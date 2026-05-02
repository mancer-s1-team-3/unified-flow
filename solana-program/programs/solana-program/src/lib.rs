use anchor_lang::prelude::*;

declare_id!("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");

#[program]
pub mod solana_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
