use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked,
    Mint,
    TokenAccount,
    TokenInterface,
    TransferChecked,
};

declare_id!("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");

const MIN_STREAM_DURATION: i64 = 60;
const STREAM_STATUS_ACTIVE: u8 = 1;
#[program]
pub mod solana_program {
    use super::*;

    pub fn create_stream(
        ctx: Context<CreateStream>,
        amount: u64,
        start_ts: i64,
        end_ts: i64,
        nonce: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

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
        // Time Validation
        // =========================

        require!(start_ts >= now, ErrorCode::InvalidStartDate);

        require!(end_ts > now, ErrorCode::InvalidEndDate);

        require!(end_ts > start_ts, ErrorCode::InvalidSchedule);

        let duration = end_ts
            .checked_sub(start_ts)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(
            duration >= MIN_STREAM_DURATION,
            ErrorCode::DurationTooShort
        );

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
            ctx.accounts.creator_token_account.mint == ctx.accounts.mint.key(),
            ErrorCode::InvalidMint
        );

        require!(
            ctx.accounts.creator_token_account.owner == ctx.accounts.creator.key(),
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

        stream.creator = ctx.accounts.creator.key();
        stream.recipient = ctx.accounts.recipient.key();
        stream.mint = ctx.accounts.mint.key();
        stream.vault = ctx.accounts.vault.key();

        stream.total_amount = amount;
        stream.withdrawn = 0;

        stream.start_ts = start_ts;
        stream.cliff_ts = start_ts;
        stream.end_ts = end_ts;

        stream.nonce = nonce;
        stream.bump = ctx.bumps.stream;

        stream.vesting_type = 0;
        stream.status = STREAM_STATUS_ACTIVE;
        stream.cancelable = true;
        stream.milestone_count = 0;

        // =========================
        // Pre-transfer balance check
        // (for Token-2022 fee awareness)
        // =========================

        let vault_before = ctx.accounts.vault.amount;

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

        let vault_after = ctx.accounts.vault.amount;

        let actual_received = vault_after
            .checked_sub(vault_before)
            .ok_or(ErrorCode::MathOverflow)?;

        // Reject transfer-fee tokens
        require!(
            actual_received == amount,
            ErrorCode::TransferFeeMintUnsupported
        );

        emit!(StreamCreated {
    stream: stream.key(),
    creator: ctx.accounts.creator.key(),
    recipient: ctx.accounts.recipient.key(),
    mint: ctx.accounts.mint.key(),
    vault: ctx.accounts.vault.key(),

    total_amount: amount,

    start_ts,
    end_ts,

    nonce,

    created_at: now,
});
        Ok(())
    }

    pub fn withdraw(
        _ctx: Context<Withdraw>,
        _amount_to_withdraw: u64,
    ) -> Result<()> {
        Ok(())
    }

    pub fn cancel(_ctx: Context<Cancel>) -> Result<()> {
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
    config.cancel_fee_lamports = 5_000;

    // fee limits
    config.max_withdraw_fee_bps = 500; // 5%
    config.max_cancel_fee_lamports = 1_000_000;

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
#[instruction(amount: u64, start_ts: i64, end_ts: i64, nonce: u64)]
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
pub struct Withdraw {}

#[derive(Accounts)]
pub struct Cancel {}

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
    pub new_cancel_fee_lamports: u64,
    pub effective_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct ConfigAccount {
    pub admin_authority: Pubkey,
    pub fee_authority: Pubkey,

    pub paused: bool,


    pub withdraw_fee_bps: u16,
    pub cancel_fee_lamports: u64,


    pub max_withdraw_fee_bps: u16,
    pub max_cancel_fee_lamports: u64,

    pub fee_change_timelock_seconds: u64,

    pub pending_fees: Option<PendingFees>,

    #[max_len(50)]
    pub allowed_mints: Vec<Pubkey>,

    pub bump: u8,
}

#[account]
pub struct FeeVaultAccount {
    pub mint: Pubkey,
    pub balance: u64,
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

    pub nonce: u64,
    pub bump: u8,
}

#[account]
pub struct MilestoneAccount {
    pub stream: Pubkey,
    pub index: u8,

    pub unlock_ts: i64,
    pub amount: u64,

    pub approved: bool,
    pub unlocked: bool,

    pub bump: u8,
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
}

#[event]
pub struct StreamCreated {
    pub stream: Pubkey,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,

    pub total_amount: u64,

    pub start_ts: i64,
    pub end_ts: i64,

    pub nonce: u64,

    pub created_at: i64,
}