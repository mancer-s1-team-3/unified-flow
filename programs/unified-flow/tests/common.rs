use std::collections::HashMap;

use anchor_lang::{prelude::borsh, AccountDeserialize, AnchorDeserialize, AnchorSerialize};
use mollusk_svm::{result::InstructionResult, Mollusk};
use mollusk_svm_programs_token::{associated_token, token, token2022};
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_program::{hash::hashv, program_pack::Pack, system_instruction, system_program};
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token::{
    instruction as token_instruction,
    state::{Account as TokenAccountState, Mint},
};
use spl_token_2022::{
    extension::{transfer_fee, ExtensionType},
    instruction as token2022_instruction,
};

use unified_flow::{ConfigAccount, MilestoneAccount, MilestoneInput, StreamAccount};

pub const SOL_USD_FEED: Pubkey = solana_pubkey::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
pub const CHAINLINK_PROGRAM_ID: Pubkey = solana_pubkey::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");

pub const BASE_NOW: i64 = 1_700_000_000;
pub const STREAM_DURATION: i64 = 1_000;
pub const TOKEN_AMOUNT: u64 = 1_000_000;
pub const MINT_DECIMALS: u8 = 6;
pub const PRICE_DECIMALS: u8 = 8;
pub const PRICE_RAW: i128 = 10_000_000_000;
pub const FEED_LEN: usize = 248;
pub const EXPECTED_WITHDRAW_FEE_LAMPORTS: u64 = 9_900_000;

pub const VESTING_TYPE_LINEAR: u8 = 0;
pub const VESTING_TYPE_CLIFF: u8 = 1;
pub const VESTING_TYPE_MILESTONE: u8 = 2;

pub struct Harness {
    pub mollusk: Mollusk,
    pub accounts: HashMap<Pubkey, Account>,
    pub admin: Pubkey,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub stranger: Pubkey,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct CreateStreamArgs {
    pub amount: u64,
    pub start_ts: i64,
    pub cliff_ts: i64,
    pub end_ts: i64,
    pub vesting_type: u8,
    pub milestones: Vec<MilestoneInput>,
    pub nonce: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct EditMilestoneArgs {
    pub new_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct EditCliffArgs {
    pub new_cliff_ts: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct EditLinearArgs {
    pub new_end_ts: i64,
    pub topup_amount: u64,
}

fn discriminator(name: &str) -> [u8; 8] {
    let hash = hashv(&[format!("global:{name}").as_bytes()]);
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&hash.to_bytes()[..8]);
    bytes
}

pub fn ix_data<T: AnchorSerialize>(name: &str, args: &T) -> Vec<u8> {
    let mut data = discriminator(name).to_vec();
    args.serialize(&mut data).expect("serialize ix data");
    data
}

fn system_account(lamports: u64) -> Account {
    Account {
        lamports,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    }
}

fn empty_account() -> Account {
    system_account(0)
}

fn program_account() -> Account {
    Account {
        lamports: 1,
        data: vec![],
        owner: system_program::ID,
        executable: true,
        rent_epoch: 0,
    }
}

fn feed_account(price_raw: i128, decimals: u8, updated_at: i64) -> Account {
    let mut data = vec![0u8; FEED_LEN];
    data[0x8a] = decimals;
    data[0xd0..0xd4].copy_from_slice(&(updated_at as u32).to_le_bytes());
    data[0xd8..0xe8].copy_from_slice(&price_raw.to_le_bytes());

    Account {
        lamports: 1_000_000_000,
        data,
        owner: CHAINLINK_PROGRAM_ID,
        executable: false,
        rent_epoch: 0,
    }
}

fn account_entries(accounts: &HashMap<Pubkey, Account>) -> Vec<(Pubkey, Account)> {
    accounts.iter().map(|(pubkey, account)| (*pubkey, account.clone())).collect()
}

fn token_account_mint(account: &Account) -> Pubkey {
    Pubkey::new_from_array(account.data[0..32].try_into().expect("token account mint"))
}

fn token_account_owner(account: &Account) -> Pubkey {
    Pubkey::new_from_array(account.data[32..64].try_into().expect("token account owner"))
}

fn token_account_amount(account: &Account) -> u64 {
    u64::from_le_bytes(account.data[64..72].try_into().expect("token account amount"))
}

fn set_token_account_amount(account: &mut Account, amount: u64) {
    account.data[64..72].copy_from_slice(&amount.to_le_bytes());
}

fn initialize_mint_account(account: &mut Account, decimals: u8, mint_authority: &Pubkey) {
    account.data = vec![0u8; Mint::LEN];
    account.owner = spl_token::ID;
    account.executable = false;
    account.rent_epoch = 0;
    account.data[0] = 1;
    account.data[1..33].copy_from_slice(mint_authority.as_ref());
    account.data[36] = decimals;
    account.data[44] = 1;
}

fn initialize_token_account(account: &mut Account, mint: &Pubkey, owner: &Pubkey, amount: u64, token_program: Pubkey) {
    account.data = vec![0u8; TokenAccountState::LEN];
    account.owner = token_program;
    account.executable = false;
    account.rent_epoch = 0;
    account.data[0..32].copy_from_slice(mint.as_ref());
    account.data[32..64].copy_from_slice(owner.as_ref());
    set_token_account_amount(account, amount);
    account.data[108] = 1;
}

impl Harness {
    pub fn new() -> Self {
        let program_id = unified_flow::ID;
        let elf_path = format!("{}/../../target/deploy/unified_flow", env!("CARGO_MANIFEST_DIR"));
        let mut mollusk = Mollusk::new(&program_id, &elf_path);
        token::add_program(&mut mollusk);
        token2022::add_program(&mut mollusk);
        associated_token::add_program(&mut mollusk);

        let mut accounts = HashMap::new();
        let admin = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let recipient = Pubkey::new_unique();
        let stranger = Pubkey::new_unique();

        for pubkey in [admin, creator, recipient, stranger] {
            accounts.insert(pubkey, system_account(100_000_000_000));
        }
        let (sys_id, sys_account) = mollusk_svm::program::keyed_account_for_system_program();
        accounts.insert(sys_id, sys_account);
        accounts.insert(spl_token::ID, mollusk_svm::program::create_program_account_loader_v3(&spl_token::ID));
        accounts.insert(spl_token_2022::ID, mollusk_svm::program::create_program_account_loader_v3(&spl_token_2022::ID));
        accounts.insert(spl_associated_token_account::ID, mollusk_svm::program::create_program_account_loader_v3(&spl_associated_token_account::ID));
        accounts.insert(SOL_USD_FEED, feed_account(PRICE_RAW, PRICE_DECIMALS, BASE_NOW));

        for (id, account) in [
            mollusk.sysvars.keyed_account_for_rent_sysvar(),
            mollusk.sysvars.keyed_account_for_epoch_schedule_sysvar(),
            mollusk.sysvars.keyed_account_for_slot_hashes_sysvar(),
        ] {
            accounts.insert(id, account);
        }

        let mut harness = Self { mollusk, accounts, admin, creator, recipient, stranger };
        harness.set_time(BASE_NOW);
        harness
    }

    pub fn set_time(&mut self, unix_ts: i64) {
        self.mollusk.sysvars.clock.unix_timestamp = unix_ts;
    }

    pub fn set_oracle(&mut self, price_raw: i128, decimals: u8, updated_at: i64) {
        self.accounts.insert(SOL_USD_FEED, feed_account(price_raw, decimals, updated_at));
    }

    pub fn account(&self, pubkey: &Pubkey) -> Account {
        self.accounts.get(pubkey).expect("account present").clone()
    }

    pub fn update_account(&mut self, pubkey: Pubkey, account: Account) {
        self.accounts.insert(pubkey, account);
    }

    pub fn accounts(&self) -> Vec<(Pubkey, Account)> {
        account_entries(&self.accounts)
    }

    pub fn process(&mut self, instruction: &Instruction) -> InstructionResult {
        let result = self.mollusk.process_instruction(instruction, &self.accounts());
        self.accounts = result.resulting_accounts.iter().cloned().collect();
        result
    }

    pub fn process_ok(&mut self, instruction: &Instruction) -> InstructionResult {
        let result = self.process(instruction);
        assert!(
            result.program_result.is_ok(),
            "instruction failed: {:?}",
            result.program_result
        );
        result
    }

    pub fn process_err(&mut self, instruction: &Instruction) -> InstructionResult {
        let result = self.process(instruction);
        assert!(
            result.program_result.is_err(),
            "expected failure, got {:?}",
            result.program_result
        );
        result
    }

    pub fn initialize_config(&mut self, config: Pubkey) {
        self.accounts.entry(config).or_insert_with(empty_account);
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.admin, true),
                AccountMeta::new(config, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: ix_data("initialize_config", &()),
        };
        self.process_ok(&ix);
    }

    pub fn create_token_mint(
        &mut self,
        mint: Pubkey,
        mint_authority: Pubkey,
        decimals: u8,
        token_program: Pubkey,
        space: usize,
    ) {
        self.accounts.entry(mint).or_insert_with(empty_account);
        let create_ix = system_instruction::create_account(
            &self.admin,
            &mint,
            self.mollusk.sysvars.rent.minimum_balance(space),
            space as u64,
            &token_program,
        );
        self.process_ok(&create_ix);

        let init_ix = if token_program == spl_token::ID {
            token_instruction::initialize_mint(&spl_token::ID, &mint, &mint_authority, None, decimals)
                .expect("initialize_mint")
        } else {
            token2022_instruction::initialize_mint(&spl_token_2022::ID, &mint, &mint_authority, None, decimals)
                .expect("initialize_mint_2022")
        };
        self.process_ok(&init_ix);
    }

    pub fn create_transfer_fee_mint(
        &mut self,
        mint: Pubkey,
        mint_authority: Pubkey,
        transfer_fee_authority: Pubkey,
        decimals: u8,
        basis_points: u16,
        maximum_fee: u64,
    ) {
        let extensions = [ExtensionType::TransferFeeConfig];
        let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
            .expect("token2022 account len");

        self.accounts.entry(mint).or_insert_with(empty_account);
        let create_ix = system_instruction::create_account(
            &self.admin,
            &mint,
            self.mollusk.sysvars.rent.minimum_balance(space),
            space as u64,
            &spl_token_2022::ID,
        );
        self.process_ok(&create_ix);

        let init_fee_ix = transfer_fee::instruction::initialize_transfer_fee_config(
            &spl_token_2022::ID,
            &mint,
            Some(&transfer_fee_authority),
            Some(&transfer_fee_authority),
            basis_points,
            maximum_fee,
        )
        .expect("initialize transfer fee");
        self.process_ok(&init_fee_ix);

        let init_mint_ix = token2022_instruction::initialize_mint(
            &spl_token_2022::ID,
            &mint,
            &mint_authority,
            None,
            decimals,
        )
        .expect("initialize mint 2022");
        self.process_ok(&init_mint_ix);
    }

    pub fn create_ata(&mut self, owner: Pubkey, mint: Pubkey, token_program: Pubkey) -> Pubkey {
        let ata = spl_associated_token_account::get_associated_token_address_with_program_id(
            &owner,
            &mint,
            &token_program,
        );
        self.accounts.entry(ata).or_insert_with(empty_account);
        let ix = create_associated_token_account_idempotent(&self.admin, &owner, &mint, &token_program);
        self.process_ok(&ix);
        ata
    }

    pub fn mint_to(
        &mut self,
        mint: Pubkey,
        destination: Pubkey,
        authority: Pubkey,
        amount: u64,
        token_program: Pubkey,
    ) {
        let ix = if token_program == spl_token::ID {
            token_instruction::mint_to(&spl_token::ID, &mint, &destination, &authority, &[], amount)
                .expect("mint_to")
        } else {
            token2022_instruction::mint_to(&spl_token_2022::ID, &mint, &destination, &authority, &[], amount)
                .expect("mint_to_2022")
        };
        self.process_ok(&ix);
    }

    pub fn create_stream(
        &mut self,
        amount: u64,
        start_ts: i64,
        cliff_ts: i64,
        end_ts: i64,
        vesting_type: u8,
        milestones: Vec<MilestoneInput>,
        nonce: u64,
        mint: Pubkey,
        creator_token_account: Pubkey,
        token_program: Pubkey,
        remaining_accounts: Vec<Pubkey>,
    ) -> Pubkey {
        let recipient = self.recipient;
        let (stream, _bump) = Pubkey::find_program_address(
            &[
                b"stream",
                self.creator.as_ref(),
                recipient.as_ref(),
                &nonce.to_le_bytes(),
            ],
            &unified_flow::ID,
        );

        let vault = spl_associated_token_account::get_associated_token_address_with_program_id(
            &stream,
            &mint,
            &token_program,
        );
        self.accounts.entry(stream).or_insert_with(empty_account);
        self.accounts.entry(vault).or_insert_with(empty_account);

        let mut accounts = vec![
            AccountMeta::new(self.creator, true),
            AccountMeta::new_readonly(recipient, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Pubkey::find_program_address(&[b"config"], &unified_flow::ID).0, false),
            AccountMeta::new(stream, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(creator_token_account, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(token_program, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ];

        accounts.extend(remaining_accounts.into_iter().map(|pubkey| AccountMeta::new(pubkey, false)));

        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts,
            data: ix_data(
                "create_stream",
                &CreateStreamArgs {
                    amount,
                    start_ts,
                    cliff_ts,
                    end_ts,
                    vesting_type,
                    milestones,
                    nonce,
                },
            ),
        };

        self.process_ok(&ix);

        stream
    }

    pub fn withdraw(
        &mut self,
        stream: Pubkey,
        mint: Pubkey,
        recipient_ata: Pubkey,
        fee_vault: Pubkey,
        token_program: Pubkey,
    ) {
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.recipient, true),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new_readonly(Pubkey::find_program_address(&[b"config"], &unified_flow::ID).0, false),
                AccountMeta::new(stream, false),
                AccountMeta::new(
                    spl_associated_token_account::get_associated_token_address_with_program_id(
                        &stream,
                        &mint,
                        &token_program,
                    ),
                    false,
                ),
                AccountMeta::new(recipient_ata, false),
                AccountMeta::new(fee_vault, false),
                AccountMeta::new_readonly(SOL_USD_FEED, false),
                AccountMeta::new_readonly(token_program, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: ix_data("withdraw", &()),
        };
        self.process_ok(&ix);
    }

    pub fn cancel(
        &mut self,
        stream: Pubkey,
        mint: Pubkey,
        creator_token_account: Pubkey,
        recipient_token_account: Pubkey,
        token_program: Pubkey,
    ) {
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.creator, true),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new_readonly(Self::config_pda(), false),
                AccountMeta::new(stream, false),
                AccountMeta::new(
                    spl_associated_token_account::get_associated_token_address_with_program_id(
                        &stream,
                        &mint,
                        &token_program,
                    ),
                    false,
                ),
                AccountMeta::new(creator_token_account, false),
                AccountMeta::new(recipient_token_account, false),
                AccountMeta::new_readonly(token_program, false),
            ],
            data: ix_data("cancel", &()),
        };
        self.process_ok(&ix);
    }

    pub fn unlock_milestone(
        &mut self,
        stream: Pubkey,
        milestone: Pubkey,
    ) {
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.creator, true),
                AccountMeta::new_readonly(Self::config_pda(), false),
                AccountMeta::new(stream, false),
                AccountMeta::new(milestone, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: ix_data("unlock_milestone", &()),
        };
        self.process_ok(&ix);
    }

    pub fn edit_milestone(
        &mut self,
        stream: Pubkey,
        milestone: Pubkey,
        mint: Pubkey,
        vault: Pubkey,
        creator_token_account: Pubkey,
        token_program: Pubkey,
        new_amount: u64,
    ) {
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.creator, true),
                AccountMeta::new_readonly(Self::config_pda(), false),
                AccountMeta::new(stream, false),
                AccountMeta::new(milestone, false),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new(vault, false),
                AccountMeta::new(creator_token_account, false),
                AccountMeta::new_readonly(token_program, false),
            ],
            data: ix_data("edit_milestone", &EditMilestoneArgs { new_amount }),
        };
        self.process_ok(&ix);
    }

    pub fn edit_cliff(&mut self, stream: Pubkey, new_cliff_ts: i64) {
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.creator, true),
                AccountMeta::new_readonly(Self::config_pda(), false),
                AccountMeta::new(stream, false),
            ],
            data: ix_data("edit_cliff", &EditCliffArgs { new_cliff_ts }),
        };
        self.process_ok(&ix);
    }

    pub fn edit_linear(
        &mut self,
        stream: Pubkey,
        mint: Pubkey,
        vault: Pubkey,
        creator_token_account: Pubkey,
        token_program: Pubkey,
        new_end_ts: i64,
        topup_amount: u64,
    ) {
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts: vec![
                AccountMeta::new(self.creator, true),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new_readonly(Self::config_pda(), false),
                AccountMeta::new(stream, false),
                AccountMeta::new(vault, false),
                AccountMeta::new(creator_token_account, false),
                AccountMeta::new_readonly(token_program, false),
            ],
            data: ix_data("edit_linear", &EditLinearArgs { new_end_ts, topup_amount }),
        };
        self.process_ok(&ix);
    }

    pub fn config_pda() -> Pubkey {
        Pubkey::find_program_address(&[b"config"], &unified_flow::ID).0
    }

    pub fn fee_vault_pda() -> Pubkey {
        Pubkey::find_program_address(&[b"fee_vault"], &unified_flow::ID).0
    }

    pub fn stream_pda(&self, nonce: u64) -> Pubkey {
        Pubkey::find_program_address(
            &[b"stream", self.creator.as_ref(), self.recipient.as_ref(), &nonce.to_le_bytes()],
            &unified_flow::ID,
        )
        .0
    }

    pub fn milestone_pda(&self, stream: &Pubkey, index: u8) -> Pubkey {
        Pubkey::find_program_address(&[b"milestone", stream.as_ref(), &[index]], &unified_flow::ID).0
    }

    pub fn token_balance(&self, pubkey: &Pubkey) -> u64 {
        token_account_amount(&self.account(pubkey))
    }

    pub fn token_owner(&self, pubkey: &Pubkey) -> Pubkey {
        token_account_owner(&self.account(pubkey))
    }

    pub fn token_mint(&self, pubkey: &Pubkey) -> Pubkey {
        token_account_mint(&self.account(pubkey))
    }

    pub fn stream_account(&self, pubkey: &Pubkey) -> StreamAccount {
        let account = self.account(pubkey);
        StreamAccount::try_deserialize(&mut account.data.as_slice()).expect("stream deserialize")
    }

    pub fn milestone_account(&self, pubkey: &Pubkey) -> MilestoneAccount {
        let account = self.account(pubkey);
        MilestoneAccount::try_deserialize(&mut account.data.as_slice()).expect("milestone deserialize")
    }

    pub fn config_account(&self, pubkey: &Pubkey) -> ConfigAccount {
        let account = self.account(pubkey);
        ConfigAccount::try_deserialize(&mut account.data.as_slice()).expect("config deserialize")
    }

    pub fn set_token_balance(&mut self, pubkey: &Pubkey, amount: u64) {
        let mut account = self.account(pubkey);
        set_token_account_amount(&mut account, amount);
        self.update_account(*pubkey, account);
    }

    pub fn account_exists(&self, pubkey: &Pubkey) -> bool {
        self.accounts.contains_key(pubkey)
    }
}

pub fn create_creator_token_account(harness: &mut Harness, mint: Pubkey, token_program: Pubkey) -> Pubkey {
    let ata = harness.create_ata(harness.creator, mint, token_program);
    harness.mint_to(mint, ata, harness.admin, TOKEN_AMOUNT * 100, token_program);
    ata
}

pub fn create_recipient_token_account(harness: &mut Harness, mint: Pubkey, token_program: Pubkey) -> Pubkey {
    harness.create_ata(harness.recipient, mint, token_program)
}

pub fn create_stranger_token_account(harness: &mut Harness, mint: Pubkey, token_program: Pubkey) -> Pubkey {
    harness.create_ata(harness.stranger, mint, token_program)
}

pub fn build_milestones(amounts: &[u64]) -> Vec<MilestoneInput> {
    amounts.iter().map(|amount| MilestoneInput { amount: *amount }).collect()
}

pub fn create_milestone_accounts(harness: &Harness, stream: Pubkey, count: usize) -> Vec<Pubkey> {
    (0..count)
        .map(|index| harness.milestone_pda(&stream, index as u8))
        .collect()
}

pub fn add_milestone_accounts_to_store(harness: &mut Harness, stream: Pubkey, count: usize) -> Vec<Pubkey> {
    let mut pdas = Vec::with_capacity(count);
    for index in 0..count {
        let pda = harness.milestone_pda(&stream, index as u8);
        harness.accounts.entry(pda).or_insert(Account {
            lamports: 1_000_000_000,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        });
        pdas.push(pda);
    }
    pdas
}

pub fn assert_failed(result: &InstructionResult) {
    assert!(result.program_result.is_err(), "expected failure, got {:?}", result.program_result);
}

pub fn assert_success(result: &InstructionResult) {
    assert!(result.program_result.is_ok(), "expected success, got {:?}", result.program_result);
}

pub fn set_mint_account(account: &mut Account, decimals: u8, mint_authority: &Pubkey, token_program: Pubkey) {
    if token_program == spl_token::ID {
        initialize_mint_account(account, decimals, mint_authority);
    } else {
        account.data = vec![0u8; Mint::LEN];
        account.owner = token_program;
        account.executable = false;
        account.rent_epoch = 0;
        account.data[0] = 1;
        account.data[1..33].copy_from_slice(mint_authority.as_ref());
        account.data[36] = decimals;
        account.data[44] = 1;
    }
}

pub fn set_token_account(account: &mut Account, mint: &Pubkey, owner: &Pubkey, amount: u64, token_program: Pubkey) {
    initialize_token_account(account, mint, owner, amount, token_program);
}

pub fn set_transfer_fee_mint_account(account: &mut Account, mint_authority: &Pubkey, decimals: u8) {
    account.data = vec![0u8; Mint::LEN + 128];
    account.owner = spl_token_2022::ID;
    account.executable = false;
    account.rent_epoch = 0;
    account.data[0] = 1;
    account.data[1..33].copy_from_slice(mint_authority.as_ref());
    account.data[36] = decimals;
    account.data[44] = 1;
}

pub fn expected_fee_vault_balance() -> u64 {
    EXPECTED_WITHDRAW_FEE_LAMPORTS
}
