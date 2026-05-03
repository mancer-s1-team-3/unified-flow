use anchor_lang::prelude::*;

declare_id!("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");

#[program]
pub mod solana_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }

    pub fn create_stream(_ctx: Context<CreateStream>) -> Result<()> {
        Ok(())
    }

    pub fn withdraw(_ctx: Context<Withdraw>) -> Result<()> {
        Ok(())
    }

    pub fn cancel(_ctx: Context<Cancel>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct CreateStream {}

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
