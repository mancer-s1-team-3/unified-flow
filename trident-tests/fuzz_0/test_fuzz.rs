use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::*;

const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MINT_SIZE: usize = 82;

fn init_mint_ix(mint: &Pubkey, decimals: u8, mint_authority: &Pubkey, freeze_authority: Option<&Pubkey>) -> Instruction {
    let mut data = Vec::with_capacity(46);
    data.push(20u8); // InitializeMint2
    data.push(decimals);
    data.extend_from_slice(&mint_authority.to_bytes());
    match freeze_authority {
        Some(fa) => { data.push(1); data.extend_from_slice(&fa.to_bytes()); }
        None => { data.push(0); data.extend_from_slice(&[0u8; 32]); }
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

fn mint_to_ix(mint: &Pubkey, dest: &Pubkey, authority: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![7u8]; // MintTo
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*mint, false),
            AccountMeta::new(*dest, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn get_ata(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    let (ata, _) = Pubkey::find_program_address(
        &[wallet.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()],
        &ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    ata
}

fn create_ata_ix(payer: &Pubkey, wallet: &Pubkey, mint: &Pubkey) -> Instruction {
    let ata = get_ata(wallet, mint);
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
        let creator = self.fuzz_accounts.creator.insert(&mut self.trident, None);

        // Airdrop SOL to creator so it can pay for accounts
        self.trident.airdrop(&creator, 5_000_000_000); // 5 SOL

        // Create SPL Token Mint
        let mint = self.fuzz_accounts.mint.insert(&mut self.trident, None);
        let rent = solana_sdk::rent::Rent::default().minimum_balance(MINT_SIZE);
        let create_mint = self.trident.create_account(&creator, &mint, rent, MINT_SIZE as u64, &TOKEN_PROGRAM_ID);
        let init_mint = init_mint_ix(&mint, 6, &creator, None);
        let _ = self.trident.process_transaction(&[create_mint, init_mint], Some("InitMint"));

        // Create creator ATA
        let creator_ata = get_ata(&creator, &mint);
        self.fuzz_accounts.creator_token_account.insert_with_address(creator_ata);
        let create_ata = create_ata_ix(&creator, &creator, &mint);
        let _ = self.trident.process_transaction(&[create_ata], Some("CreateATA"));

        // Mint tokens to creator
        let do_mint = mint_to_ix(&mint, &creator_ata, &creator, 1_000_000_000_000);
        let _ = self.trident.process_transaction(&[do_mint], Some("MintTo"));

        // Derive & init config PDA
        let program_id = solana_program::program_id();
        let (config_pda, _) = Pubkey::find_program_address(&[b"config"], &program_id);
        self.fuzz_accounts.config.insert_with_address(config_pda);

        let ix = solana_program::InitializeConfigInstruction::data(
            solana_program::InitializeConfigInstructionData::new(),
        )
        .accounts(solana_program::InitializeConfigInstructionAccounts::new(creator, config_pda))
        .instruction();
        let _ = self.trident.process_transaction(&[ix], Some("InitConfig"));
    }

    #[flow]
    fn flow_create_stream(&mut self) {
        let creator = self.fuzz_accounts.creator.get(&mut self.trident).unwrap();
        let recipient = self.fuzz_accounts.recipient.get_except(&mut self.trident, &[creator])
            .unwrap_or_else(|| self.fuzz_accounts.recipient.insert(&mut self.trident, None));
        let mint = self.fuzz_accounts.mint.get(&mut self.trident).unwrap();
        let config = self.fuzz_accounts.config.get(&mut self.trident).unwrap();
        let creator_token_account = self.fuzz_accounts.creator_token_account.get(&mut self.trident).unwrap();

        let nonce: u64 = self.trident.random_from_range(0..u64::MAX);
        let vesting_type: u8 = self.trident.random_from_range(0..=2u8);
        let now = self.trident.get_current_timestamp();

        let program_id = solana_program::program_id();
        let (stream_pda, _) = Pubkey::find_program_address(
            &[b"stream", creator.as_ref(), recipient.as_ref(), &nonce.to_le_bytes()],
            &program_id,
        );
        self.fuzz_accounts.stream.insert_with_address(stream_pda);

        let vault = get_ata(&stream_pda, &mint);
        self.fuzz_accounts.vault.insert_with_address(vault);

        let (amount, start_ts, cliff_ts, end_ts, milestones, remaining) = match vesting_type {
            0 => {
                let amount: u64 = self.trident.random_from_range(1..=1_000_000_000);
                let start_ts = now.checked_add(self.trident.random_from_range(1..=3600i64)).unwrap();
                let duration = self.trident.random_from_range(60..=86400i64);
                (amount, start_ts, start_ts, start_ts.checked_add( duration).unwrap(), vec![], vec![])
            }
            1 => {
                let amount: u64 = self.trident.random_from_range(1..=1_000_000_000);
                let start_ts = now.checked_add(self.trident.random_from_range(1..=3600i64)).unwrap();
                let duration = self.trident.random_from_range(60..=86400i64);
                let end_ts = start_ts.checked_add( duration).unwrap();
                let cliff_offset = self.trident.random_from_range(0..=duration);
                (amount, start_ts, start_ts.checked_add(cliff_offset).unwrap(), end_ts, vec![], vec![])
            }
            _ => {
                let cnt: usize = self.trident.random_from_range(1..=5usize);
                let mut remaining = Vec::new();
                let mut amounts = Vec::new();
                let mut total: u64 = 0;
                for i in 0..cnt {
                    let m: u64 = self.trident.random_from_range(1..=100_000u64);
                    total = total.saturating_add(m);
                    amounts.push(m);
                    let (mpda, _) = Pubkey::find_program_address(
                        &[b"milestone", stream_pda.as_ref(), &[i as u8]],
                        &program_id,
                    );
                    self.fuzz_accounts.milestone.insert_with_address(mpda);
                    remaining.push(AccountMeta::new(mpda, false));
                }
                let ms: Vec<MilestoneInput> = amounts.iter().map(|a| MilestoneInput { amount: *a }).collect();
                (total, 0i64, 0i64, 0i64, ms, remaining)
            }
        };

        let ix = solana_program::CreateStreamInstruction::data(
            solana_program::CreateStreamInstructionData::new(amount, start_ts, cliff_ts, end_ts, vesting_type, milestones, nonce),
        )
        .accounts(solana_program::CreateStreamInstructionAccounts::new(
            creator, recipient, mint, config, stream_pda, vault, creator_token_account, TOKEN_PROGRAM_ID,
        ))
        .remaining_accounts(remaining)
        .instruction();

        let _ = self.trident.process_transaction(&[ix], Some("CreateStream"));
    }

    #[end]
    fn end(&mut self) {}
}

fn main() {
    FuzzTest::fuzz(1000, 100);
}
