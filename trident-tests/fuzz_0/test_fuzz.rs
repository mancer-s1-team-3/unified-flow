use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::*;

// SPL Token program IDs
const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// SPL Token Mint size
const MINT_SIZE: usize = 82;

/// Build SPL Token `InitializeMint2` instruction.
fn init_mint_ix(
    mint: &Pubkey,
    decimals: u8,
    mint_authority: &Pubkey,
    freeze_authority: Option<&Pubkey>,
) -> Instruction {
    let mut data = Vec::with_capacity(46);
    data.push(20u8); // InitializeMint2
    data.push(decimals);
    data.extend_from_slice(&mint_authority.to_bytes());
    match freeze_authority {
        Some(fa) => {
            data.push(1);
            data.extend_from_slice(&fa.to_bytes());
        }
        None => {
            data.push(0);
            data.extend_from_slice(&[0u8; 32]);
        }
    }
    Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*mint, true),
            AccountMeta::new_readonly(solana_sdk::sysvar::rent::id(), false),
        ],
        data,
    }
}

/// Build SPL Token `MintTo` instruction.
fn mint_to_ix(
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = vec![7u8]; // MintTo
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*mint, false),
            AccountMeta::new(*destination, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

/// Derive Associated Token Account address.
fn get_associated_token_address(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    let (ata, _) = Pubkey::find_program_address(
        &[wallet.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()],
        &ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    ata
}

/// Build `CreateAssociatedTokenAccount` instruction.
fn create_ata_ix(payer: &Pubkey, wallet: &Pubkey, mint: &Pubkey) -> Instruction {
    let ata = get_associated_token_address(wallet, mint);
    Instruction {
        program_id: ASSOCIATED_TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(*wallet, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data: vec![],
    }
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
        }
    }

    #[init]
    fn start(&mut self) {
        // ---- Create creator keypair ----
        let creator = self
            .fuzz_accounts
            .creator
            .insert(&mut self.trident, None);

        // ---- Create SPL Token Mint ----
        let mint = self
            .fuzz_accounts
            .mint
            .insert(&mut self.trident, None);

        let rent = solana_sdk::rent::Rent::default().minimum_balance(MINT_SIZE);
        let create_mint = self
            .trident
            .create_account(&creator, &mint, rent, MINT_SIZE as u64, &TOKEN_PROGRAM_ID);
        let init_mint = init_mint_ix(&mint, 6, &creator, None);
        let _ = self
            .trident
            .process_transaction(&[create_mint, init_mint], None);

        // ---- Create creator ATA ----
        let creator_ata = get_associated_token_address(&creator, &mint);
        self.fuzz_accounts
            .creator_token_account
            .insert_with_address(creator_ata);

        let create_creator_ata = create_ata_ix(&creator, &creator, &mint);
        let _ = self
            .trident
            .process_transaction(&[create_creator_ata], None);

        // ---- Mint 1M tokens to creator ----
        let do_mint = mint_to_ix(&mint, &creator_ata, &creator, 1_000_000_000_000);
        let _ = self.trident.process_transaction(&[do_mint], None);

        // ---- Derive & store config PDA ----
        let program_id = solana_program::program_id();
        let (config_pda, _bump) = Pubkey::find_program_address(&[b"config"], &program_id);
        self.fuzz_accounts
            .config
            .insert_with_address(config_pda);

        // ---- Initialize Config ----
        let init_config_ix = solana_program::InitializeConfigInstruction::data(
            solana_program::InitializeConfigInstructionData::new(),
        )
        .accounts(solana_program::InitializeConfigInstructionAccounts::new(
            creator,
            config_pda,
        ))
        .instruction();

        let _ = self.trident.process_transaction(&[init_config_ix], None);
    }

    #[flow]
    fn flow_create_stream(&mut self) {
        let creator = self
            .fuzz_accounts
            .creator
            .get(&mut self.trident)
            .unwrap();

        let recipient = self
            .fuzz_accounts
            .recipient
            .get_except(&mut self.trident, &[creator])
            .unwrap_or_else(|| {
                self.fuzz_accounts
                    .recipient
                    .insert(&mut self.trident, None)
            });

        let mint = self.fuzz_accounts.mint.get(&mut self.trident).unwrap();
        let config = self.fuzz_accounts.config.get(&mut self.trident).unwrap();
        let creator_token_account = self
            .fuzz_accounts
            .creator_token_account
            .get(&mut self.trident)
            .unwrap();

        // ---- Fuzzed parameters ----
        let nonce: u64 = self.trident.random_from_range(0..u64::MAX);
        let vesting_type: u8 = self.trident.random_from_range(0..=2u8);
        let now = self.trident.get_current_timestamp();

        // Derive stream PDA
        let program_id = solana_program::program_id();
        let (stream_pda, _bump) = Pubkey::find_program_address(
            &[
                b"stream",
                creator.as_ref(),
                recipient.as_ref(),
                &nonce.to_le_bytes(),
            ],
            &program_id,
        );
        self.fuzz_accounts
            .stream
            .insert_with_address(stream_pda);

        // Derive vault (ATA of stream for mint)
        let vault = get_associated_token_address(&stream_pda, &mint);
        self.fuzz_accounts
            .vault
            .insert_with_address(vault);

        // ---- Build instruction data based on vesting type ----
        let (amount, start_ts, cliff_ts, end_ts, milestones, remaining_accounts) =
            match vesting_type {
                // Linear
                0 => {
                    let amount: u64 = self.trident.random_from_range(1..=1_000_000_000);
                    let start_ts = now + self.trident.random_from_range(1..=3600i64);
                    let duration = self.trident.random_from_range(60..=86400i64);
                    let end_ts = start_ts + duration;
                    let cliff_ts = start_ts;
                    (amount, start_ts, cliff_ts, end_ts, vec![], vec![])
                }
                // Cliff
                1 => {
                    let amount: u64 = self.trident.random_from_range(1..=1_000_000_000);
                    let start_ts = now + self.trident.random_from_range(1..=3600i64);
                    let duration = self.trident.random_from_range(60..=86400i64);
                    let end_ts = start_ts + duration;
                    let cliff_offset = self.trident.random_from_range(0..=duration);
                    let cliff_ts = start_ts + cliff_offset;
                    (amount, start_ts, cliff_ts, end_ts, vec![], vec![])
                }
                // Milestone
                _ => {
                    let milestone_count: usize =
                        self.trident.random_from_range(1..=5usize);
                    let mut remaining_accounts = Vec::new();
                    let mut milestone_amounts = Vec::new();
                    let mut total_amount: u64 = 0;

                    for i in 0..milestone_count {
                        let m_amount: u64 =
                            self.trident.random_from_range(1..=100_000u64);
                        total_amount = total_amount.saturating_add(m_amount);
                        milestone_amounts.push(m_amount);

                        let (milestone_pda, _) = Pubkey::find_program_address(
                            &[b"milestone", stream_pda.as_ref(), &[i as u8]],
                            &program_id,
                        );
                        self.fuzz_accounts
                            .milestone
                            .insert_with_address(milestone_pda);
                        remaining_accounts
                            .push(AccountMeta::new(milestone_pda, false));
                    }

                    let milestones: Vec<MilestoneInput> = milestone_amounts
                        .iter()
                        .map(|a| MilestoneInput { amount: *a })
                        .collect();

                    (
                        total_amount,
                        0i64,
                        0i64,
                        0i64,
                        milestones,
                        remaining_accounts,
                    )
                }
            };

        // ---- Build & submit CreateStream instruction ----
        let create_stream_ix = solana_program::CreateStreamInstruction::data(
            solana_program::CreateStreamInstructionData::new(
                amount,
                start_ts,
                cliff_ts,
                end_ts,
                vesting_type,
                milestones,
                nonce,
            ),
        )
        .accounts(solana_program::CreateStreamInstructionAccounts::new(
            creator,
            recipient,
            mint,
            config,
            stream_pda,
            vault,
            creator_token_account,
            TOKEN_PROGRAM_ID,
        ))
        .remaining_accounts(remaining_accounts)
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[create_stream_ix], Some("CreateStream"));
    }

    #[end]
    fn end(&mut self) {}
}

fn main() {
    FuzzTest::fuzz(1000, 100);
}
