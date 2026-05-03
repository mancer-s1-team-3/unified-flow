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
