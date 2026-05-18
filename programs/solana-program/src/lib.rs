use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use anchor_lang::solana_program::{
    program::invoke_signed,
    system_instruction,
};
mod oracle;

use oracle::{read_chainlink_round, CHAINLINK_PROGRAM_ID, SOL_USD_FEED};

declare_id!("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");

const MIN_STREAM_DURATION: i64 = 60;

const VESTING_TYPE_LINEAR: u8 = 0;
const VESTING_TYPE_CLIFF: u8 = 1;
const VESTING_TYPE_MILESTONE: u8 = 2;

const STREAM_STATUS_ACTIVE: u8 = 1;
const STREAM_STATUS_COMPLETED: u8 = 2;
const STREAM_STATUS_CANCELLED: u8 = 3;

// Fee = $0.99 in SOL
const WITHDRAW_FEE_USD_CENTS: u128 = 99; // $0.99
const LAMPORTS_PER_SOL: u128 = 1_000_000_000;

#[program]
pub mod solana_program {
    use super::*;

 

pub fn create_stream<'info>(
    ctx: Context<'_, '_, '_, 'info, CreateStream<'info>>,
    amount: u64,
    start_ts: i64,
    cliff_ts: i64,
    end_ts: i64,
    vesting_type: u8,
    milestones: Vec<MilestoneInput>,
    nonce: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let creator_key = ctx.accounts.creator.key();
    let stream_key = ctx.accounts.stream.key();
    let recipient_key = ctx.accounts.recipient.key();
    let mint_key = ctx.accounts.mint.key();
    let vault_key = ctx.accounts.vault.key();

    let config = &ctx.accounts.config;

    // =========================
    // Protocol State Validation
    // =========================
    require!(!config.paused, ErrorCode::ProtocolPaused);

    // =========================
    // Amount Validation
    // =========================
    require!(amount > 0, ErrorCode::InvalidAmount);

    // =========================
    // Vesting Type Validation
    // =========================
    require!(
        vesting_type <= VESTING_TYPE_MILESTONE,
        ErrorCode::InvalidVestingType
    );

    let milestone_count = milestones.len() as u8;

    // ==========================================
    // Milestone & Time Validation (Sudah Diperbaiki)
    // ==========================================
    if vesting_type == VESTING_TYPE_MILESTONE {
        // --- Validasi Khusus Milestone ---
        require!(
            milestone_count > 0,
            ErrorCode::InvalidMilestoneCount
        );

        require!(
            ctx.remaining_accounts.len() == milestone_count as usize,
            ErrorCode::InvalidMilestoneCount
        );

        let mut total_milestone_amount: u64 = 0;

        for milestone in &milestones {
            require!(
                milestone.amount > 0,
                ErrorCode::InvalidAmount
            );

            total_milestone_amount = total_milestone_amount
                .checked_add(milestone.amount)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        require!(
            total_milestone_amount == amount,
            ErrorCode::InvalidMilestoneAmount
        );
    } else {
        // --- Validasi Khusus Linear / Cliff (Berbasis Waktu) ---
        require!(
            milestone_count == 0,
            ErrorCode::InvalidMilestoneCount
        );

        require!(start_ts >= now, ErrorCode::InvalidStartDate);
        require!(end_ts > now, ErrorCode::InvalidEndDate);
        require!(cliff_ts >= start_ts, ErrorCode::InvalidSchedule);
        require!(end_ts > start_ts, ErrorCode::InvalidSchedule);

        let duration = end_ts
            .checked_sub(start_ts)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(
            duration >= MIN_STREAM_DURATION,
            ErrorCode::DurationTooShort
        );
    }

    // =========================
    // Recipient Validation
    // =========================
    require!(
        ctx.accounts.creator.key() != ctx.accounts.recipient.key(),
        ErrorCode::InvalidRecipient
    );

    // =========================
    // Mint Validation
    // =========================
    if !config.allowed_mints.is_empty() {
        require!(
            config.allowed_mints.contains(&ctx.accounts.mint.key()),
            ErrorCode::MintNotAllowed
        );
    }

    require!(
        ctx.accounts.creator_token_account.mint
            == ctx.accounts.mint.key(),
        ErrorCode::InvalidMint
    );

    require!(
        ctx.accounts.creator_token_account.owner
            == ctx.accounts.creator.key(),
        ErrorCode::InvalidTokenOwner
    );

    require!(
        ctx.accounts.creator_token_account.amount >= amount,
        ErrorCode::InsufficientBalance
    );

    require!(
        ctx.accounts.mint.decimals > 0,
        ErrorCode::InvalidMintDecimals
    );

    // =========================
    // Stream Init
    // =========================
    let stream = &mut ctx.accounts.stream;

    stream.creator = creator_key;
    stream.recipient = recipient_key;
    stream.mint = mint_key;
    stream.vault = vault_key;
    stream.total_amount = amount;
    stream.withdrawn = 0;

    // Untuk Milestone, parameter waktu tetap disimpan (atau bernilai 0/apapun dari FE tidak masalah)
    stream.start_ts = start_ts;
    stream.cliff_ts = cliff_ts;
    stream.end_ts = end_ts;

    stream.vesting_type = vesting_type;
    stream.status = STREAM_STATUS_ACTIVE;
    stream.cancelable = true;
    stream.milestone_count = milestone_count;
    stream.next_milestone_index = 0;
    stream.cancelled = false;
    stream.nonce = nonce;
    stream.bump = ctx.bumps.stream;
    stream.unlocked_milestone_amount = 0;

   // =========================
    // Initialize Milestones
    // =========================
    if vesting_type == VESTING_TYPE_MILESTONE {
        for i in 0..milestone_count {
            let milestone_info = ctx
                .remaining_accounts
                .get(i as usize)
                .ok_or(ErrorCode::InvalidMilestoneCount)?;

            let (milestone_pda, bump) =
                Pubkey::find_program_address(
                    &[
                        b"milestone",
                        stream_key.as_ref(),
                        &[i],
                    ],
                    ctx.program_id,
                );

            require_keys_eq!(
                milestone_pda,
                *milestone_info.key,
                ErrorCode::InvalidMilestonePda
            );

            let space = 8 + MilestoneAccount::INIT_SPACE;
            let rent = Rent::get()?;
            let required_lamports = rent.minimum_balance(space);
            
            //Cek saldo saat ini, jika kurang baru top-up (Anti-DoS)
            let current_lamports = milestone_info.lamports();
            if current_lamports < required_lamports {
                let diff = required_lamports.checked_sub(current_lamports).unwrap();
                anchor_lang::system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.creator.to_account_info(),
                            to: milestone_info.clone(),
                        },
                    ),
                    diff,
                )?;
            }

            // Alokasikan space akun secara aman
            if milestone_info.data_is_empty() {
                invoke_signed(
                    &system_instruction::allocate(milestone_info.key, space as u64),
                    &[milestone_info.clone(), ctx.accounts.system_program.to_account_info()],
                    &[&[b"milestone", stream_key.as_ref(), &[i], &[bump]]],
                )?;

                invoke_signed(
                    &system_instruction::assign(milestone_info.key, ctx.program_id),
                    &[milestone_info.clone(), ctx.accounts.system_program.to_account_info()],
                    &[&[b"milestone", stream_key.as_ref(), &[i], &[bump]]],
                )?;
            }

            let input = &milestones[i as usize];

            let milestone_data = MilestoneAccount {
                stream: stream_key,
                index: i,
                unlock_ts: 0,
                amount: input.amount,
                approved: false,
                unlocked: false,
                bump,
            };

            let mut data = milestone_info.data.borrow_mut();
            milestone_data.try_serialize(&mut &mut data[..])?;
        }
    }
    // =========================
    // Transfer Tokens
    // =========================
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.creator_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    transfer_checked(
        cpi_ctx,
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // =========================
    // Reload Vault
    // =========================
    ctx.accounts.vault.reload()?;

    require!(
        ctx.accounts.vault.amount == amount,
        ErrorCode::TransferFeeMintUnsupported
    );

    // =========================
    // Emit Event
    // =========================
    emit!(StreamCreated {
        stream: stream_key,
        creator: creator_key,
        recipient: recipient_key,
        mint: mint_key,
        vault: vault_key,
        total_amount: amount,
        vesting_type,
        start_ts,
        cliff_ts,
        end_ts,
        milestone_count,
        cancelable: true,
        nonce,
        created_at: now,
    });

    Ok(())
}

    pub fn withdraw(ctx: Context<Withdraw>, _amount_to_withdraw: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!(!ctx.accounts.config.paused, ErrorCode::ProtocolPaused);

        let vested = vested_amount(&ctx.accounts.stream, now)?;
        let claimable = vested
            .checked_sub(ctx.accounts.stream.withdrawn)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(claimable > 0, ErrorCode::NothingToWithdraw);

        let round = read_chainlink_round(&ctx.accounts.chainlink_feed, now)?;
        let decimals_factor = 10u128
            .checked_pow(round.decimals as u32)
            .ok_or(ErrorCode::MathOverflow)?;
        let fee_lamports = WITHDRAW_FEE_USD_CENTS
            .checked_mul(LAMPORTS_PER_SOL)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(decimals_factor)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(
                100u128
                    .checked_mul(round.answer as u128)
                    .ok_or(ErrorCode::MathOverflow)?,
            )
            .ok_or(ErrorCode::MathOverflow)? as u64;
        require!(fee_lamports > 0, ErrorCode::InvalidOraclePrice);

        // CEI: mutate stream state in a block so the mutable borrow drops before CPI
        let (creator_key, recipient_key, nonce_bytes, bump_bytes, stream_key, withdrawn_total) = {
            let stream = &mut ctx.accounts.stream;
            stream.withdrawn = stream
                .withdrawn
                .checked_add(claimable)
                .ok_or(ErrorCode::MathOverflow)?;
            if stream.withdrawn == stream.total_amount {
                stream.status = STREAM_STATUS_COMPLETED;
            }
            (
                stream.creator,
                stream.recipient,
                stream.nonce.to_le_bytes(),
                [stream.bump],
                stream.key(),
                stream.withdrawn,
            )
        };

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.recipient.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                },
            ),
            fee_lamports,
        )?;

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"stream",
            creator_key.as_ref(),
            recipient_key.as_ref(),
            &nonce_bytes,
            &bump_bytes,
        ]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.recipient_ata.to_account_info(),
            authority: ctx.accounts.stream.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            claimable,
            ctx.accounts.mint.decimals,
        )?;

        // =====================
        // Emit Event
        // =====================
        emit!(TokensClaimed {
            stream: stream_key,
            recipient: ctx.accounts.recipient.key(),
            mint: ctx.accounts.mint.key(),
            claimable,
            fee_lamports,
            withdrawn_total,
            timestamp: now,
        });

        Ok(())
    }

 pub fn cancel(_ctx: Context<Cancel>) -> Result<()> {
   Ok(())
}
pub fn unlock_milestone(ctx: Context<UnlockMilestone>) -> Result<()> {
    let stream = &mut ctx.accounts.stream;
    let milestone = &mut ctx.accounts.milestone;

    require!(
        stream.status == STREAM_STATUS_ACTIVE,
        ErrorCode::StreamNotActive
    );
    require!(
        stream.vesting_type == VESTING_TYPE_MILESTONE,
        ErrorCode::InvalidVestingType
    );

    require!(
        milestone.index == stream.next_milestone_index,
        ErrorCode::InvalidMilestoneOrder
    );

    require!(
        !milestone.approved,
        ErrorCode::MilestoneAlreadyUnlocked
    );

    milestone.approved = true;
    milestone.unlocked = true;
    milestone.unlock_ts = Clock::get()?.unix_timestamp;

    stream.unlocked_milestone_amount = stream.unlocked_milestone_amount
        .checked_add(milestone.amount)
        .ok_or(ErrorCode::MathOverflow)?;

    stream.next_milestone_index = stream.next_milestone_index
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;


    if stream.next_milestone_index == stream.milestone_count {
        stream.status = STREAM_STATUS_COMPLETED;
    }

    emit!(MilestoneUnlocked {
        stream: stream.key(),
        milestone: milestone.key(),
        index: milestone.index,
        amount: milestone.amount,
        unlock_ts: milestone.unlock_ts,
    });

    Ok(())
}
pub fn edit_milestone(
    ctx: Context<EditMilestone>,
    new_amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let stream = &mut ctx.accounts.stream;
    let milestone = &mut ctx.accounts.milestone;

    require!(
        stream.vesting_type == VESTING_TYPE_MILESTONE,
        ErrorCode::InvalidVestingType
    );

    require!(
        stream.status == STREAM_STATUS_ACTIVE,
        ErrorCode::StreamNotActive
    );

    require!(
        !milestone.unlocked,
        ErrorCode::MilestoneAlreadyUnlocked
    );

    require!(
        new_amount > 0,
        ErrorCode::InvalidAmount
    );

    let old_amount = milestone.amount;
    milestone.amount = new_amount;

    if new_amount > old_amount {
        // Kreator menaikkan alokasi milestone -> Ambil sisa token dari dompet kreator
        let diff = new_amount
            .checked_sub(old_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        stream.total_amount = stream
            .total_amount
            .checked_add(diff)
            .ok_or(ErrorCode::MathOverflow)?;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.creator_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            diff,
            ctx.accounts.mint.decimals,
        )?;
    } else if new_amount < old_amount {
        // Kreator menurunkan alokasi milestone -> Kembalikan kelebihan token ke kreator
        let diff = old_amount
            .checked_sub(new_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        stream.total_amount = stream
            .total_amount
            .checked_sub(diff)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Validasi agar total komitmen baru tidak turun di bawah batas aman dana yang sudah ditarik
        require!(
            stream.total_amount >= stream.withdrawn,
            ErrorCode::InvalidAmount
        );

        let creator_key = stream.creator;
        let recipient_key = stream.recipient;
        let nonce_bytes = stream.nonce.to_le_bytes();
        let bump_bytes = [stream.bump];

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"stream",
            creator_key.as_ref(),
            recipient_key.as_ref(),
            &nonce_bytes,
            &bump_bytes,
        ]];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: stream.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            diff,
            ctx.accounts.mint.decimals,
        )?;
    }

    ctx.accounts.vault.reload()?;

    emit!(MilestoneEdited {
        stream: stream.key(),
        milestone: milestone.key(),
        index: milestone.index,
        old_amount,
        new_amount,
        timestamp: now,
    });

    Ok(())
}
pub fn edit_cliff(ctx: Context<EditCliff>, new_cliff_ts: i64) -> Result<()> {
        let stream = &mut ctx.accounts.stream;
        let now = Clock::get()?.unix_timestamp;
        require!(
            stream.vesting_type == VESTING_TYPE_CLIFF,
            ErrorCode::InvalidVestingType
        );
        require!(
            stream.status == STREAM_STATUS_ACTIVE,
            ErrorCode::StreamNotActive
        );
        require!(
            stream.withdrawn == 0,
            ErrorCode::StreamAlreadyStarted
        );
        require!(
            new_cliff_ts >= stream.start_ts,
            ErrorCode::InvalidSchedule
        );
        require!(
            new_cliff_ts <= stream.end_ts,
            ErrorCode::InvalidSchedule
        );
        require!(
            new_cliff_ts >= now,
            ErrorCode::InvalidStartDate
        );

        let old_cliff = stream.cliff_ts;
        stream.cliff_ts = new_cliff_ts;

        emit!(CliffEdited {
            stream: stream.key(),
            old_cliff_ts: old_cliff,
            new_cliff_ts,
            timestamp: now,
        });

        Ok(())
    }

pub fn edit_linear(
    ctx: Context<EditLinear>,
    new_end_ts: i64,
    topup_amount: u64,
) -> Result<()> {
    let stream = &mut ctx.accounts.stream;
    let now = Clock::get()?.unix_timestamp;

    require!(
        stream.vesting_type == VESTING_TYPE_LINEAR
            || stream.vesting_type == VESTING_TYPE_CLIFF,
        ErrorCode::InvalidVestingType
    );
    require!(
        stream.status == STREAM_STATUS_ACTIVE,
        ErrorCode::StreamNotActive
    );

    // Minimal salah satu harus diisi
    require!(
        new_end_ts > stream.end_ts || topup_amount > 0,
        ErrorCode::InvalidAmount
    );

    // Extend end date
    let old_end_ts = stream.end_ts;
    if new_end_ts > stream.end_ts {
        require!(new_end_ts > now, ErrorCode::InvalidEndDate);
        stream.end_ts = new_end_ts;
    }

    // Top-up
    let old_total = stream.total_amount;
    if topup_amount > 0 {
        require!(
            ctx.accounts.creator_token_account.amount >= topup_amount,
            ErrorCode::InsufficientBalance
        );

        stream.total_amount = stream.total_amount
            .checked_add(topup_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.creator_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            topup_amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    emit!(LinearEdited {
        stream: stream.key(),
        old_end_ts,
        new_end_ts: stream.end_ts,
        old_total_amount: old_total,
        new_total_amount: stream.total_amount,
        topup_amount,
        timestamp: now,
    });

    Ok(())
}
    pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    ) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.admin_authority = ctx.accounts.admin.key();
    config.fee_authority = ctx.accounts.admin.key();

    config.paused = false;

    // fees
    config.withdraw_fee_bps = 100; // 1%

    // fee limits
    config.max_withdraw_fee_bps = 500; // 5%

    // timelock
    config.fee_change_timelock_seconds = 86400; // 24h

    // no pending fees
    config.pending_fees = None;

    // allowed mint list
    config.allowed_mints = vec![];

    config.bump = ctx.bumps.config;

    Ok(())
}
}

#[derive(Accounts)]
#[instruction(amount: u64, start_ts: i64, cliff_ts: i64, end_ts: i64, vesting_type: u8, milestones: Vec<MilestoneInput>, nonce: u64)]
pub struct CreateStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK:
    pub recipient: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ConfigAccount>,

    #[account(
        init,
        payer = creator,
        space = 8 + StreamAccount::INIT_SPACE,
        seeds = [
            b"stream",
            creator.key().as_ref(),
            recipient.key().as_ref(),
            &nonce.to_le_bytes()
        ],
        bump
    )]
    pub stream: Account<'info, StreamAccount>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = stream,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,

    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program:
        Program<'info, anchor_spl::associated_token::AssociatedToken>,
}


#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ConfigAccount>,

    /// Stream account
    #[account(
        mut,
        seeds = [
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.nonce.to_le_bytes()
        ],
        bump = stream.bump,
        constraint = stream.recipient == recipient.key()
            @ ErrorCode::Unauthorized,
        constraint = stream.status == STREAM_STATUS_ACTIVE
            @ ErrorCode::StreamNotActive,
        has_one = mint @ ErrorCode::InvalidMint,
    )]
    pub stream: Account<'info, StreamAccount>,

    /// Vault token account (ATA owned by stream PDA)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = stream,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token account recipient
    #[account(
        mut,
        constraint = recipient_ata.owner == recipient.key()
            @ ErrorCode::InvalidTokenOwner,
        constraint = recipient_ata.mint == mint.key()
            @ ErrorCode::InvalidMint,
    )]
    pub recipient_ata: InterfaceAccount<'info, TokenAccount>,

    /// Recipient fee SOL
    #[account(
        mut,
        seeds = [b"fee_vault"],
        bump,
    )]
    pub fee_vault: SystemAccount<'info>,

    /// CHECK: Address and owner validated via constraints; data read in read_chainlink_round()
    #[account(
        constraint = chainlink_feed.key() == SOL_USD_FEED
            @ ErrorCode::InvalidOracleFeed,
        constraint = chainlink_feed.owner == &CHAINLINK_PROGRAM_ID
            @ ErrorCode::InvalidOracleFeed,
    )]
    pub chainlink_feed: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.nonce.to_le_bytes()
        ],
        bump = stream.bump,
        has_one = creator,
        has_one = mint,
        constraint = stream.status == STREAM_STATUS_ACTIVE
            @ ErrorCode::StreamNotActive,
        constraint = stream.cancelable
            @ ErrorCode::StreamNotCancelable,
    )]
    pub stream: Account<'info, StreamAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = stream,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token_account.owner == creator.key()
            @ ErrorCode::InvalidTokenOwner,
        constraint = creator_token_account.mint == mint.key()
            @ ErrorCode::InvalidMint,
    )]
    pub creator_token_account:
        InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = recipient_token_account.owner
            == stream.recipient
            @ ErrorCode::InvalidRecipient,
        constraint = recipient_token_account.mint
            == mint.key()
            @ ErrorCode::InvalidMint,
    )]
    pub recipient_token_account:
        InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct EditLinear<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.nonce.to_le_bytes()
        ],
        bump = stream.bump,
        has_one = creator @ ErrorCode::Unauthorized,
        has_one = mint @ ErrorCode::InvalidMint,
    )]
    pub stream: Account<'info, StreamAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = stream,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token_account.owner == creator.key()
            @ ErrorCode::InvalidTokenOwner,
        constraint = creator_token_account.mint == mint.key()
            @ ErrorCode::InvalidMint,
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)]
pub struct EditMilestone<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator @ ErrorCode::Unauthorized,
        has_one = mint @ ErrorCode::InvalidMint,
        seeds = [
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.nonce.to_le_bytes()
        ],
        bump = stream.bump, // Memastikan akun stream ini adalah PDA resmi sistem Anda
    )]
    pub stream: Account<'info, StreamAccount>,

    #[account(
        mut,
        seeds = [
            b"milestone",
            stream.key().as_ref(),
            &[milestone.index] // Menghitung ulang alamat asli berdasarkan index milestone-nya
        ],
        bump = milestone.bump,
        constraint = milestone.stream == stream.key() @ ErrorCode::InvalidMilestonePda
    )]
    pub milestone: Account<'info, MilestoneAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = stream,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token_account.owner == creator.key()
            @ ErrorCode::InvalidTokenOwner,
        constraint = creator_token_account.mint == mint.key()
            @ ErrorCode::InvalidMint,
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)]
pub struct EditCliff<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.nonce.to_le_bytes()
        ],
        bump = stream.bump,
        has_one = creator @ ErrorCode::Unauthorized,
    )]
    pub stream: Account<'info, StreamAccount>,
}
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + ConfigAccount::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ConfigAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnlockMilestone<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"stream",
            stream.creator.as_ref(),
            stream.recipient.as_ref(),
            &stream.nonce.to_le_bytes()
        ],
        bump = stream.bump,
        has_one = creator @ ErrorCode::Unauthorized,
        constraint = stream.vesting_type == VESTING_TYPE_MILESTONE @ ErrorCode::InvalidVestingType,
    )]
    pub stream: Account<'info, StreamAccount>,

    #[account(
        mut,
        seeds = [
            b"milestone",
            stream.key().as_ref(),
            &[stream.next_milestone_index]
        ],
        bump = milestone.bump,
        constraint = milestone.stream == stream.key() @ ErrorCode::InvalidMilestonePda
    )]
    pub milestone: Account<'info, MilestoneAccount>,

    pub system_program: Program<'info, System>,
}
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq,
    InitSpace
)]
pub struct PendingFees {
    pub new_withdraw_fee_bps: u16,
    pub effective_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct ConfigAccount {
    pub admin_authority: Pubkey,
    pub fee_authority: Pubkey,

    pub paused: bool,


    pub withdraw_fee_bps: u16,


    pub max_withdraw_fee_bps: u16,

    pub fee_change_timelock_seconds: u64,

    pub pending_fees: Option<PendingFees>,

    #[max_len(50)]
    pub allowed_mints: Vec<Pubkey>,

    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StreamAccount {
    pub creator: Pubkey,
    pub recipient: Pubkey,

    pub mint: Pubkey,
    pub vault: Pubkey,

    pub total_amount: u64,
    pub withdrawn: u64,

    pub start_ts: i64,
    pub cliff_ts: i64,
    pub end_ts: i64,

    pub vesting_type: u8,
    pub status: u8,

    pub cancelable: bool,
    pub milestone_count: u8,
    pub next_milestone_index: u8,

    pub cancelled: bool,


    pub nonce: u64,
    pub bump: u8,
    pub unlocked_milestone_amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct MilestoneAccount {
    pub stream: Pubkey,
    pub index: u8,

    pub unlock_ts: i64,
    pub amount: u64,

    pub approved: bool,
    pub unlocked: bool,

    pub bump: u8,
}

fn vested_amount(stream: &StreamAccount, now: i64) -> Result<u64> {
    if now < stream.start_ts {
        return Ok(0);
    }
    if stream.vesting_type == VESTING_TYPE_CLIFF && now < stream.cliff_ts {
        return Ok(0);
    }
    if now >= stream.end_ts {
        return Ok(stream.total_amount);
    }

    let elapsed = now
        .checked_sub(stream.start_ts)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let duration = stream
        .end_ts
        .checked_sub(stream.start_ts)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let vested = (stream.total_amount as u128)
        .checked_mul(elapsed as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(duration as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    Ok(vested)
}

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("End date must be after start date")]
    InvalidSchedule,

    #[msg("End date must be in the future")]
    InvalidEndDate,

    #[msg("Start date must not be in the past")]
    InvalidStartDate,

    #[msg("Stream duration too short")]
    DurationTooShort,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid recipient")]
    InvalidRecipient,

    #[msg("Invalid mint")]
    InvalidMint,

    #[msg("Invalid token owner")]
    InvalidTokenOwner,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Mint not allowed")]
    MintNotAllowed,

    #[msg("Protocol paused")]
    ProtocolPaused,

    #[msg("Amount too small")]
    AmountTooSmall,

    #[msg("Invalid mint decimals")]
    InvalidMintDecimals,

    #[msg("Transfer fee tokens unsupported")]
    TransferFeeMintUnsupported,

    #[msg("Stream not active")]
    StreamNotActive,

    #[msg("Stream not cancelable")]
    StreamNotCancelable,

    #[msg("No tokens available to withdraw")]
    NothingToWithdraw,

    #[msg("Signer is not the stream recipient")]
    Unauthorized,

    #[msg("Invalid oracle price feed")]
    InvalidOracleFeed,

    #[msg("Oracle price is stale (> 1 hour)")]
    StaleOraclePrice,

    #[msg("Oracle returned invalid price")]
    InvalidOraclePrice,

    #[msg("Invalid fee receiver account")]
    InvalidFeeReceiver,

    #[msg("Already cancelled")]
    AlreadyCancelled,

    #[msg("Fully vested")]
    FullyVested,

    #[msg("Stream expired")]
    StreamExpired,

    #[msg("Milestone already unlocked")]
    MilestoneAlreadyUnlocked,

    #[msg("Invalid vesting type")]
    InvalidVestingType,

    #[msg("Invalid milestone count")]
    InvalidMilestoneCount,

    #[msg("Invalid milestone PDA")]
    InvalidMilestonePda,

    #[msg("Invalid milestone amount")]
    InvalidMilestoneAmount,
    
    #[msg("Previous milestone not approved")]
    PreviousMilestoneNotApproved,

    #[msg("Invalid milestone order")]
    InvalidMilestoneOrder,

    #[msg("Previous milestone missing")]
    PreviousMilestoneMissing,

    #[msg("Stream already started and cannot be modified")]
    StreamAlreadyStarted,
}

#[event]
pub struct StreamCreated {
    pub stream: Pubkey,

    pub creator: Pubkey,
    pub recipient: Pubkey,

    pub mint: Pubkey,
    pub vault: Pubkey,

    pub total_amount: u64,

    pub vesting_type: u8,

    pub start_ts: i64,
    pub cliff_ts: i64,
    pub end_ts: i64,

    pub milestone_count: u8,

    pub cancelable: bool,

    pub nonce: u64,

    pub created_at: i64,
}

#[event]
pub struct TokensClaimed {
    pub stream: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub claimable: u64,
    pub fee_lamports: u64,
    pub withdrawn_total: u64,
    pub timestamp: i64,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneInput {
    pub amount: u64,
}
#[event]
pub struct MilestoneUnlocked {
    pub stream: Pubkey,
    pub milestone: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub unlock_ts: i64,
}
#[event]
pub struct MilestoneEdited {
    pub stream: Pubkey,
    pub milestone: Pubkey,
    pub index: u8,
    pub old_amount: u64,
    pub new_amount: u64,
    pub timestamp: i64,
}
#[event]
pub struct LinearEdited {
    pub stream: Pubkey,
    pub old_end_ts: i64,
    pub new_end_ts: i64,
    pub old_total_amount: u64,
    pub new_total_amount: u64,
    pub topup_amount: u64,
    pub timestamp: i64,
}
#[event]
pub struct CliffEdited {
    pub stream: Pubkey,
    pub old_cliff_ts: i64,
    pub new_cliff_ts: i64,
    pub timestamp: i64,
}