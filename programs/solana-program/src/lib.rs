use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

declare_id!("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");

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
        stream.status = 1;
        stream.cancelable = true;
        stream.milestone_count = 0;

        // Transfer tokens to vault
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.creator_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount_to_withdraw: u64) -> Result<()> {

        Ok(())
    }

    pub fn cancel(_ctx: Context<Cancel>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, start_ts: i64, end_ts: i64, nonce: u64)]
pub struct CreateStream<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: Recipient pubkey
    pub recipient: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = creator,
        space = 8 + StreamAccount::INIT_SPACE,
        seeds = [b"stream", creator.key().as_ref(), recipient.key().as_ref(), &nonce.to_le_bytes()],
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
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}

#[derive(Accounts)]
pub struct Withdraw {}

#[derive(Accounts)]
pub struct Cancel {}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct PendingFees {
    pub new_create_fee_bps: u16,
    pub new_withdraw_fee_bps: u16,
    pub new_cancel_fee_lamports: u64,
    pub effective_at: i64,
}

#[account]
pub struct ConfigAccount {
    pub admin_authority: Pubkey,
    pub fee_authority: Pubkey,
    pub paused: bool,
    pub create_fee_bps: u16,
    pub withdraw_fee_bps: u16,
    pub cancel_fee_lamports: u64,
    pub max_create_fee_bps: u16,
    pub max_withdraw_fee_bps: u16,
    pub max_cancel_fee_lamports: u64,
    pub fee_change_timelock_seconds: u64,
    pub pending_fees: Option<PendingFees>,
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
    #[msg("Insufficient unlocked balance")]
    InsufficientUnlockedBalance,
}