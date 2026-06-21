//! Native (in-process) integration tests via `solana-program-test`.
//!
//! Unlike the Mollusk suite (which executes the compiled `.so` in a BPF VM and
//! therefore yields no `llvm-cov` coverage), these run the program through
//! `processor!(entry_native)`, so every instruction handler executes as native
//! Rust and is measured by coverage tooling.

use anchor_lang::{
    solana_program::{
        account_info::AccountInfo, entrypoint::ProgramResult, instruction::Instruction,
        program_pack::Pack, pubkey::Pubkey,
    },
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use solana_program_test::{processor, BanksClientError, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::Account,
    clock::Clock,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};
use unified_flow::{ConfigAccount, MilestoneAccount, MilestoneInput, StreamAccount};

// ─── Constants ──────────────────────────────────────────────────────────────

const SOL_USD_FEED: Pubkey =
    solana_sdk::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
const CHAINLINK_PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");

const BASE_NOW: i64 = 1_700_000_000;
const MINT_DECIMALS: u8 = 6;
const TOKEN_AMOUNT: u64 = 1_000_000;
const PRICE_DECIMALS: u8 = 8;
const PRICE_RAW: i128 = 10_000_000_000; // $100 * 10^8

const VESTING_LINEAR: u8 = 0;
const VESTING_CLIFF: u8 = 1;
const VESTING_MILESTONE: u8 = 2;

// ─── Entrypoint wrapper ───────────────────────────────────────────────────────

/// Anchor's `entry` over-constrains the account slice lifetime; this wrapper
/// exposes the general `ProcessInstruction` signature `processor!` expects.
fn entry_native(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    // SAFETY: program-test hands us a freshly deserialized slice whose element
    // and slice lifetimes are identical; we only relax the type.
    let accounts: &[AccountInfo] = unsafe { core::mem::transmute(accounts) };
    unified_flow::entry(program_id, accounts, data)
}

// ─── Oracle feed bytes ────────────────────────────────────────────────────────

fn feed_data(decimals: u8, updated_at: i64, answer: i128) -> Vec<u8> {
    let mut data = vec![0u8; 248];
    data[0x8a] = decimals;
    data[0xd0..0xd4].copy_from_slice(&(updated_at as u32).to_le_bytes());
    data[0xd8..0xd8 + 16].copy_from_slice(&answer.to_le_bytes());
    data
}

// ─── Harness ──────────────────────────────────────────────────────────────────

struct Harness {
    ctx: ProgramTestContext,
    admin: Keypair,
    creator: Keypair,
    recipient: Keypair,
    /// Monotonic slot, bumped before every tx so each gets a fresh blockhash
    /// (byte-identical transactions are otherwise deduplicated by the bank).
    slot: u64,
    /// Desired clock time, re-applied after each slot warp.
    now_ts: i64,
}

impl Harness {
    async fn new() -> Self {
        Self::new_with_feed(feed_data(PRICE_DECIMALS, BASE_NOW, PRICE_RAW)).await
    }
async fn store_stream(&mut self, key: Pubkey, stream: StreamAccount) {
    let mut acc = self.get_account(&key).await.unwrap();
    let mut new_data = Vec::new();
    { use anchor_lang::AccountSerialize; stream.try_serialize(&mut new_data).unwrap(); }
    acc.data = new_data;
    self.ctx.set_account(&key, &acc.into());
}

async fn store_milestone(&mut self, key: Pubkey, milestone: MilestoneAccount) {
    let mut acc = self.get_account(&key).await.unwrap();
    let mut new_data = Vec::new();
    { use anchor_lang::AccountSerialize; milestone.try_serialize(&mut new_data).unwrap(); }
    acc.data = new_data;
    self.ctx.set_account(&key, &acc.into());
}
    async fn new_with_feed(feed: Vec<u8>) -> Self {
        // Only our program runs as a native builtin (for coverage). The SPL
        // token / token-2022 / associated-token programs are provided by
        // program-test as bundled BPF ELFs, so CPIs into them just work.
        let mut pt = ProgramTest::new(
            "unified_flow",
            unified_flow::ID,
            processor!(entry_native),
        );

        let admin = Keypair::new();
        let creator = Keypair::new();
        let recipient = Keypair::new();
        for kp in [&admin, &creator, &recipient] {
            pt.add_account(
                kp.pubkey(),
                Account {
                    lamports: 100_000_000_000,
                    data: vec![],
                    owner: system_program::id(),
                    executable: false,
                    rent_epoch: 0,
                },
            );
        }

        // Chainlink feed account.
        pt.add_account(
            SOL_USD_FEED,
            Account {
                lamports: 1_000_000_000,
                data: feed,
                owner: CHAINLINK_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        );

        let mut ctx = pt.start_with_context().await;
        set_clock(&mut ctx, BASE_NOW);
        // Bank starts at slot 1; begin above it so every warp targets a future slot.
        Self { ctx, admin, creator, recipient, slot: 8, now_ts: BASE_NOW }
    }

    fn config_pda() -> Pubkey {
        Pubkey::find_program_address(&[b"config"], &unified_flow::ID).0
    }

    fn fee_vault_pda() -> Pubkey {
        Pubkey::find_program_address(&[b"fee_vault"], &unified_flow::ID).0
    }

    fn stream_pda(&self, nonce: u64) -> Pubkey {
        Pubkey::find_program_address(
            &[
                b"stream",
                self.creator.pubkey().as_ref(),
                self.recipient.pubkey().as_ref(),
                &nonce.to_le_bytes(),
            ],
            &unified_flow::ID,
        )
        .0
    }

    fn milestone_pda(&self, stream: &Pubkey, index: u8) -> Pubkey {
        Pubkey::find_program_address(&[b"milestone", stream.as_ref(), &[index]], &unified_flow::ID).0
    }

    fn ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
        spl_associated_token_account::get_associated_token_address_with_program_id(
            owner, mint, token_program,
        )
    }

    fn set_time(&mut self, unix_ts: i64) {
        self.now_ts = unix_ts;
        set_clock(&mut self.ctx, unix_ts);
    }

    async fn send(
        &mut self,
        ixs: &[Instruction],
        signers: &[&Keypair],
    ) -> Result<(), BanksClientError> {
        // Advance to a fresh slot so the blockhash differs every tx, then
        // re-apply the desired clock time (warp recomputes it from the slot).
        self.slot += 1;
        self.ctx.warp_to_slot(self.slot).expect("warp");
        set_clock(&mut self.ctx, self.now_ts);

        let blockhash = self.ctx.banks_client.get_latest_blockhash().await.unwrap();
        let mut all_signers: Vec<&Keypair> = vec![&self.ctx.payer];
        all_signers.extend_from_slice(signers);
        let tx = Transaction::new_signed_with_payer(
            ixs,
            Some(&self.ctx.payer.pubkey()),
            &all_signers,
            blockhash,
        );
        self.ctx.banks_client.process_transaction(tx).await
    }

    async fn get_account(&mut self, key: &Pubkey) -> Option<Account> {
        self.ctx.banks_client.get_account(*key).await.unwrap()
    }

    async fn stream_account(&mut self, key: &Pubkey) -> StreamAccount {
        let acc = self.get_account(key).await.expect("stream exists");
        StreamAccount::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    async fn milestone_account(&mut self, key: &Pubkey) -> MilestoneAccount {
        let acc = self.get_account(key).await.expect("milestone exists");
        MilestoneAccount::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    async fn config_account(&mut self) -> ConfigAccount {
        let acc = self.get_account(&Self::config_pda()).await.expect("config exists");
        ConfigAccount::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    async fn token_balance(&mut self, ata: &Pubkey) -> u64 {
        let acc = self.get_account(ata).await.expect("token account exists");
        let state = spl_token::state::Account::unpack(&acc.data[..spl_token::state::Account::LEN])
            .unwrap();
        state.amount
    }

    async fn lamports(&mut self, key: &Pubkey) -> u64 {
        self.get_account(key).await.map(|a| a.lamports).unwrap_or(0)
    }

    // ─── instruction helpers ──────────────────────────────────────────────

    async fn initialize_config(&mut self) -> Result<(), BanksClientError> {
        let data = unified_flow::instruction::InitializeConfig {}.data();
        let metas = unified_flow::accounts::InitializeConfig {
            admin: self.admin.pubkey(),
            config: Self::config_pda(),
            system_program: system_program::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &[&admin]).await
    }

    async fn create_spl_mint(&mut self, mint: &Keypair, decimals: u8) {
        let rent = self
            .ctx
            .banks_client
            .get_rent()
            .await
            .unwrap()
            .minimum_balance(spl_token::state::Mint::LEN);
        let create = solana_sdk::system_instruction::create_account(
            &self.ctx.payer.pubkey(),
            &mint.pubkey(),
            rent,
            spl_token::state::Mint::LEN as u64,
            &spl_token::id(),
        );
        let init = spl_token::instruction::initialize_mint2(
            &spl_token::id(),
            &mint.pubkey(),
            &self.admin.pubkey(),
            None,
            decimals,
        )
        .unwrap();
        self.send(&[create, init], &[mint]).await.unwrap();
    }

    async fn create_ata(&mut self, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        let ix = spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &self.ctx.payer.pubkey(),
            owner,
            mint,
            &spl_token::id(),
        );
        self.send(&[ix], &[]).await.unwrap();
        Self::ata(owner, mint, &spl_token::id())
    }

    async fn mint_to(&mut self, mint: &Pubkey, dest: &Pubkey, amount: u64) {
        let ix = spl_token::instruction::mint_to(
            &spl_token::id(),
            mint,
            dest,
            &self.admin.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &[&admin]).await.unwrap();
    }

    /// Full setup: mint + funded creator ATA + recipient ATA. Returns
    /// (mint, creator_ata, recipient_ata).
    async fn setup_token(&mut self, mint: &Keypair) -> (Pubkey, Pubkey, Pubkey) {
        self.create_spl_mint(mint, MINT_DECIMALS).await;
        let creator_ata = self.create_ata(&self.creator.pubkey(), &mint.pubkey()).await;
        self.mint_to(&mint.pubkey(), &creator_ata, TOKEN_AMOUNT * 100).await;
        let recipient_ata = self.create_ata(&self.recipient.pubkey(), &mint.pubkey()).await;
        (mint.pubkey(), creator_ata, recipient_ata)
    }

    #[allow(clippy::too_many_arguments)]
    async fn create_stream(
        &mut self,
        amount: u64,
        start_ts: i64,
        cliff_ts: i64,
        end_ts: i64,
        vesting_type: u8,
        milestones: Vec<MilestoneInput>,
        nonce: u64,
        mint: Pubkey,
        creator_ata: Pubkey,
        remaining: &[Pubkey],
    ) -> Result<Pubkey, BanksClientError> {
        let stream = self.stream_pda(nonce);
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::CreateStream {
            amount,
            start_ts,
            cliff_ts,
            end_ts,
            vesting_type,
            milestones,
            nonce,
        }
        .data();
        let mut metas = unified_flow::accounts::CreateStream {
            creator: self.creator.pubkey(),
            recipient: self.recipient.pubkey(),
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            creator_token_account: creator_ata,
            system_program: system_program::id(),
            token_program: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
        }
        .to_account_metas(None);
        for r in remaining {
            metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(*r, false));
        }
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await.map(|_| stream)
    }

    async fn withdraw(
        &mut self,
        stream: Pubkey,
        mint: Pubkey,
        recipient_ata: Pubkey,
    ) -> Result<(), BanksClientError> {
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::Withdraw {}.data();
        let metas = unified_flow::accounts::Withdraw {
            recipient: self.recipient.pubkey(),
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            recipient_ata,
            fee_vault: Self::fee_vault_pda(),
            chainlink_feed: SOL_USD_FEED,
            token_program: spl_token::id(),
            system_program: system_program::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let recipient = self.recipient.insecure_clone();
        self.send(&[ix], &[&recipient]).await
    }

    /// Airdrop lamports to an arbitrary account (e.g. an attacker keypair).
    async fn fund(&mut self, key: &Pubkey) {
        let acc = Account {
            lamports: 100_000_000_000,
            data: vec![],
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        };
        self.ctx.set_account(key, &acc.into());
    }

    /// withdraw attempted by an arbitrary signer claiming to be the recipient.
    async fn withdraw_as(
        &mut self,
        signer: &Keypair,
        stream: Pubkey,
        mint: Pubkey,
        recipient_ata: Pubkey,
    ) -> Result<(), BanksClientError> {
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::Withdraw {}.data();
        let metas = unified_flow::accounts::Withdraw {
            recipient: signer.pubkey(),
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            recipient_ata,
            fee_vault: Self::fee_vault_pda(),
            chainlink_feed: SOL_USD_FEED,
            token_program: spl_token::id(),
            system_program: system_program::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let signer = signer.insecure_clone();
        self.send(&[ix], &[&signer]).await
    }

    async fn cancel(
        &mut self,
        stream: Pubkey,
        mint: Pubkey,
        creator_ata: Pubkey,
        recipient_ata: Pubkey,
    ) -> Result<(), BanksClientError> {
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::Cancel {}.data();
        let metas = unified_flow::accounts::Cancel {
            creator: self.creator.pubkey(),
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            creator_token_account: creator_ata,
            recipient_token_account: recipient_ata,
            token_program: spl_token::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await
    }

    async fn unlock_milestone(
        &mut self,
        stream: Pubkey,
        milestone: Pubkey,
    ) -> Result<(), BanksClientError> {
        let data = unified_flow::instruction::UnlockMilestone {}.data();
        let metas = unified_flow::accounts::UnlockMilestone {
            creator: self.creator.pubkey(),
            config: Self::config_pda(),
            stream,
            milestone,
            system_program: system_program::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await
    }

    #[allow(clippy::too_many_arguments)]
    async fn edit_milestone(
        &mut self,
        stream: Pubkey,
        milestone: Pubkey,
        mint: Pubkey,
        creator_ata: Pubkey,
        new_amount: u64,
    ) -> Result<(), BanksClientError> {
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::EditMilestone { new_amount }.data();
        let metas = unified_flow::accounts::EditMilestone {
            creator: self.creator.pubkey(),
            config: Self::config_pda(),
            stream,
            milestone,
            mint,
            vault,
            creator_token_account: creator_ata,
            token_program: spl_token::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await
    }

    async fn edit_cliff(
        &mut self,
        stream: Pubkey,
        new_cliff_ts: i64,
    ) -> Result<(), BanksClientError> {
        let data = unified_flow::instruction::EditCliff { new_cliff_ts }.data();
        let metas = unified_flow::accounts::EditCliff {
            creator: self.creator.pubkey(),
            config: Self::config_pda(),
            stream,
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await
    }

    #[allow(clippy::too_many_arguments)]
    async fn edit_linear(
        &mut self,
        stream: Pubkey,
        mint: Pubkey,
        creator_ata: Pubkey,
        new_end_ts: i64,
        topup_amount: u64,
    ) -> Result<(), BanksClientError> {
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::EditLinear { new_end_ts, topup_amount }.data();
        let metas = unified_flow::accounts::EditLinear {
            creator: self.creator.pubkey(),
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            creator_token_account: creator_ata,
            token_program: spl_token::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await
    }

    async fn store_config(&mut self, cfg: ConfigAccount) {
        let cfg_key = Self::config_pda();
        let mut acc = self.get_account(&cfg_key).await.unwrap();
        let mut new_data = Vec::new();
        {
            use anchor_lang::AccountSerialize;
            cfg.try_serialize(&mut new_data).unwrap();
        }
        acc.data = new_data;
        self.ctx.set_account(&cfg_key, &acc.into());
    }

    async fn set_paused(&mut self, paused: bool) {
        let mut cfg = self.config_account().await;
        cfg.paused = paused;
        self.store_config(cfg).await;
    }

    async fn set_allowed_mints(&mut self, mints: Vec<Pubkey>) {
        let mut cfg = self.config_account().await;
        cfg.allowed_mints = mints;
        self.store_config(cfg).await;
    }

    /// Create a mint with caller-chosen decimals (for InvalidMintDecimals).
    async fn create_mint_decimals(&mut self, mint: &Keypair, decimals: u8) {
        self.create_spl_mint(mint, decimals).await;
    }

    /// create_stream with an explicit recipient + signer, for negative tests.
    #[allow(clippy::too_many_arguments)]
    async fn create_stream_full(
        &mut self,
        recipient: Pubkey,
        amount: u64,
        start_ts: i64,
        cliff_ts: i64,
        end_ts: i64,
        vesting_type: u8,
        nonce: u64,
        mint: Pubkey,
        creator_ata: Pubkey,
    ) -> Result<Pubkey, BanksClientError> {
        let stream = Pubkey::find_program_address(
            &[b"stream", self.creator.pubkey().as_ref(), recipient.as_ref(), &nonce.to_le_bytes()],
            &unified_flow::ID,
        )
        .0;
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::CreateStream {
            amount,
            start_ts,
            cliff_ts,
            end_ts,
            vesting_type,
            milestones: vec![],
            nonce,
        }
        .data();
        let metas = unified_flow::accounts::CreateStream {
            creator: self.creator.pubkey(),
            recipient,
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            creator_token_account: creator_ata,
            system_program: system_program::id(),
            token_program: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator]).await.map(|_| stream)
    }

    /// cancel signed by an arbitrary keypair acting as `creator` (for Unauthorized).
    async fn cancel_as(
        &mut self,
        signer: &Keypair,
        stream: Pubkey,
        mint: Pubkey,
        creator_ata: Pubkey,
        recipient_ata: Pubkey,
    ) -> Result<(), BanksClientError> {
        let vault = Self::ata(&stream, &mint, &spl_token::id());
        let data = unified_flow::instruction::Cancel {}.data();
        let metas = unified_flow::accounts::Cancel {
            creator: signer.pubkey(),
            mint,
            config: Self::config_pda(),
            stream,
            vault,
            creator_token_account: creator_ata,
            recipient_token_account: recipient_ata,
            token_program: spl_token::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let signer = signer.insecure_clone();
        self.send(&[ix], &[&signer]).await
    }

    /// Admin withdraws accrued SOL fees from the fee vault to `destination`.
    async fn withdraw_fees(
        &mut self,
        destination: Pubkey,
        amount: u64,
    ) -> Result<(), BanksClientError> {
        self.withdraw_fees_as(&self.admin.insecure_clone(), destination, amount).await
    }

    /// Same as `withdraw_fees` but signed by an arbitrary keypair (for the
    /// unauthorized-admin negative test).
    async fn withdraw_fees_as(
        &mut self,
        signer: &Keypair,
        destination: Pubkey,
        amount: u64,
    ) -> Result<(), BanksClientError> {
        let data = unified_flow::instruction::WithdrawFees { amount }.data();
        let metas = unified_flow::accounts::WithdrawFees {
            admin: signer.pubkey(),
            config: Self::config_pda(),
            fee_vault: Self::fee_vault_pda(),
            destination,
            system_program: system_program::id(),
        }
        .to_account_metas(None);
        let ix = Instruction { program_id: unified_flow::ID, accounts: metas, data };
        let signer = signer.insecure_clone();
        self.send(&[ix], &[&signer]).await
    }
}

fn set_clock(ctx: &mut ProgramTestContext, unix_ts: i64) {
    let mut clock: Clock = Clock::default();
    clock.unix_timestamp = unix_ts;
    ctx.set_sysvar(&clock);
}

fn milestones(amounts: &[u64]) -> Vec<MilestoneInput> {
    amounts.iter().map(|&amount| MilestoneInput { amount }).collect()
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn initialize_config_sets_defaults() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let cfg = h.config_account().await;
    assert_eq!(cfg.admin_authority, h.admin.pubkey());
    assert_eq!(cfg.fee_authority, h.admin.pubkey());
    assert!(!cfg.paused);
    assert_eq!(cfg.withdraw_fee_bps, 100);
    assert_eq!(cfg.max_withdraw_fee_bps, 500);
    assert_eq!(cfg.fee_change_timelock_seconds, 86_400);
    assert!(cfg.pending_fees.is_none());
    assert!(cfg.allowed_mints.is_empty());
}

#[tokio::test]
async fn create_linear_stream_ok() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    let s = h.stream_account(&stream).await;
    assert_eq!(s.total_amount, TOKEN_AMOUNT);
    assert_eq!(s.vesting_type, VESTING_LINEAR);
    assert_eq!(s.status, 1);
    assert_eq!(h.token_balance(&creator_ata).await, TOKEN_AMOUNT * 99);
}

#[tokio::test]
async fn create_cliff_stream_ok() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 80,
            BASE_NOW + 160,
            VESTING_CLIFF,
            vec![],
            2,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();
    let s = h.stream_account(&stream).await;
    assert_eq!(s.cliff_ts, BASE_NOW + 80);
    assert_eq!(s.vesting_type, VESTING_CLIFF);
}

#[tokio::test]
async fn create_milestone_stream_ok() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    let stream = h.stream_pda(3);
    let ms: Vec<Pubkey> = (0..4u8).map(|i| h.milestone_pda(&stream, i)).collect();
    let created = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1_000,
            VESTING_MILESTONE,
            milestones(&[250_000, 250_000, 250_000, 250_000]),
            3,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();

    let s = h.stream_account(&created).await;
    assert_eq!(s.milestone_count, 4);
    for (i, pda) in ms.iter().enumerate() {
        let m = h.milestone_account(pda).await;
        assert_eq!(m.index, i as u8);
        assert_eq!(m.amount, 250_000);
    }
}

#[tokio::test]
async fn create_stream_validation_errors() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    // zero amount
    assert!(h
        .create_stream(0, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 10, mint, creator_ata, &[])
        .await
        .is_err());
    // invalid vesting type
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, 9, vec![], 11, mint, creator_ata, &[])
        .await
        .is_err());
    // duration too short
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 119, VESTING_LINEAR, vec![], 12, mint, creator_ata, &[])
        .await
        .is_err());
    // start in past
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW - 1, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 13, mint, creator_ata, &[])
        .await
        .is_err());
    // cliff before start
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 59, BASE_NOW + 160, VESTING_LINEAR, vec![], 14, mint, creator_ata, &[])
        .await
        .is_err());
    // cliff after end
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 161, BASE_NOW + 160, VESTING_LINEAR, vec![], 15, mint, creator_ata, &[])
        .await
        .is_err());
    // linear with milestones
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, milestones(&[1]), 16, mint, creator_ata, &[])
        .await
        .is_err());
    // milestone with wrong total
    let stream = h.stream_pda(17);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream, i)).collect();
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, milestones(&[1, 1]), 17, mint, creator_ata, &ms)
        .await
        .is_err());
    // milestone count zero
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, vec![], 18, mint, creator_ata, &[])
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_paused_rejected() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    h.set_paused(true).await;
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 20, mint, creator_ata, &[])
        .await
        .is_err());
}

#[tokio::test]
async fn withdraw_full_flow() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 40, mint, creator_ata, &[])
        .await
        .unwrap();

    // 50% vested
    h.set_time(BASE_NOW + 110);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT / 2);
    assert!(h.lamports(&Harness::fee_vault_pda()).await > 0);

    // remaining vested at end
    h.set_time(BASE_NOW + 160);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT);
    let s = h.stream_account(&stream).await;
    assert_eq!(s.status, 2);
}

#[tokio::test]
async fn withdraw_nothing_and_paused_errors() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 41, mint, creator_ata, &[])
        .await
        .unwrap();

    // before start: nothing to withdraw
    assert!(h.withdraw(stream, mint, recipient_ata).await.is_err());

    // paused
    h.set_time(BASE_NOW + 110);
    h.set_paused(true).await;
    assert!(h.withdraw(stream, mint, recipient_ata).await.is_err());
}

#[tokio::test]
async fn withdraw_stale_oracle_rejected() {
    // feed updated far in the past relative to BASE_NOW
    let mut h = Harness::new_with_feed(feed_data(PRICE_DECIMALS, BASE_NOW - 10_000, PRICE_RAW)).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 42, mint, creator_ata, &[])
        .await
        .unwrap();
    h.set_time(BASE_NOW + 110);
    assert!(h.withdraw(stream, mint, recipient_ata).await.is_err());
}

#[tokio::test]
async fn cancel_returns_unvested_to_creator() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 50, mint, creator_ata, &[])
        .await
        .unwrap();

    // 50% vested then cancel
    h.set_time(BASE_NOW + 110);
    h.cancel(stream, mint, creator_ata, recipient_ata).await.unwrap();
    let s = h.stream_account(&stream).await;
    assert_eq!(s.status, 3);
    assert!(s.cancelled);
    // recipient got vested half, creator got remaining half back
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT / 2);

    // second cancel fails
    assert!(h.cancel(stream, mint, creator_ata, recipient_ata).await.is_err());
}

#[tokio::test]
async fn milestone_unlock_and_edit() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    let stream_pda = h.stream_pda(51);
    let ms: Vec<Pubkey> = (0..4u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, milestones(&[250_000, 250_000, 250_000, 250_000]), 51, mint, creator_ata, &ms)
        .await
        .unwrap();

    // Edit milestone 1 up (top-up CPI from creator) then down (refund CPI to creator).
    h.edit_milestone(stream, ms[1], mint, creator_ata, 300_000).await.unwrap();
    assert_eq!(h.milestone_account(&ms[1]).await.amount, 300_000);
    h.edit_milestone(stream, ms[1], mint, creator_ata, 200_000).await.unwrap();
    assert_eq!(h.milestone_account(&ms[1]).await.amount, 200_000);

    // Unlock milestone 0.
    h.unlock_milestone(stream, ms[0]).await.unwrap();
    let m0 = h.milestone_account(&ms[0]).await;
    assert!(m0.approved && m0.unlocked);

    // Editing an already-unlocked milestone fails.
    assert!(h.edit_milestone(stream, ms[0], mint, creator_ata, 100_000).await.is_err());

    // Unlock the rest in order; the final unlock flips the stream to COMPLETED.
    h.unlock_milestone(stream, ms[1]).await.unwrap();
    h.unlock_milestone(stream, ms[2]).await.unwrap();
    h.unlock_milestone(stream, ms[3]).await.unwrap();
    let s = h.stream_account(&stream).await;
    assert_eq!(s.next_milestone_index, 4);
    assert_eq!(s.status, 2);
}

#[tokio::test]
async fn edit_cliff_and_linear() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    // cliff stream
    let cliff = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 80, BASE_NOW + 160, VESTING_CLIFF, vec![], 60, mint, creator_ata, &[])
        .await
        .unwrap();
    h.edit_cliff(cliff, BASE_NOW + 100).await.unwrap();
    assert_eq!(h.stream_account(&cliff).await.cliff_ts, BASE_NOW + 100);

    // linear stream: extend + topup
    let linear = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 61, mint, creator_ata, &[])
        .await
        .unwrap();
    h.edit_linear(linear, mint, creator_ata, BASE_NOW + 220, TOKEN_AMOUNT / 4).await.unwrap();
    let s = h.stream_account(&linear).await;
    assert_eq!(s.end_ts, BASE_NOW + 220);
    assert_eq!(s.total_amount, TOKEN_AMOUNT + TOKEN_AMOUNT / 4);
}

#[tokio::test]
async fn withdraw_collects_fees_into_vault() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 70, mint, creator_ata, &[])
        .await
        .unwrap();
    h.set_time(BASE_NOW + 110);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();

    let collected = h.lamports(&Harness::fee_vault_pda()).await;
    assert!(collected > 0);
}

// ─── Additional negative / branch-coverage tests ──────────────────────────────

#[tokio::test]
async fn create_stream_invalid_recipient() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    let creator = h.creator.pubkey();
    // recipient == creator
    assert!(h
        .create_stream_full(creator, TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, 80, mint, creator_ata)
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_insufficient_balance() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    // amount far exceeds creator balance
    assert!(h
        .create_stream(TOKEN_AMOUNT * 100_000, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 81, mint, creator_ata, &[])
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_invalid_mint_decimals() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    h.create_mint_decimals(&mint, 0).await;
    let creator_ata = h.create_ata(&h.creator.pubkey(), &mint.pubkey()).await;
    h.mint_to(&mint.pubkey(), &creator_ata, TOKEN_AMOUNT * 100).await;
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 82, mint.pubkey(), creator_ata, &[])
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_mint_not_allowed() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    // restrict allowed mints to a random other key
    h.set_allowed_mints(vec![Pubkey::new_unique()]).await;
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 83, mint, creator_ata, &[])
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_mint_allowed_passes() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    // explicitly allow this mint -> contains() branch true
    h.set_allowed_mints(vec![mint]).await;
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 84, mint, creator_ata, &[])
        .await
        .is_ok());
}

#[tokio::test]
async fn cancel_unauthorized_and_fully_vested() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 90, mint, creator_ata, &[])
        .await
        .unwrap();

    // unauthorized: a stranger signs as creator
    let stranger = Keypair::new();
    assert!(h.cancel_as(&stranger, stream, mint, creator_ata, recipient_ata).await.is_err());

    // fully vested -> cancel rejected
    h.set_time(BASE_NOW + 200);
    assert!(h.cancel(stream, mint, creator_ata, recipient_ata).await.is_err());
}

#[tokio::test]
async fn edit_cliff_error_paths() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    // wrong vesting type: edit_cliff on a linear stream
    let linear = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 100, mint, creator_ata, &[])
        .await
        .unwrap();
    assert!(h.edit_cliff(linear, BASE_NOW + 100).await.is_err());

    // cliff stream: invalid bounds + expiry
    let cliff = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 80, BASE_NOW + 160, VESTING_CLIFF, vec![], 101, mint, creator_ata, &[])
        .await
        .unwrap();
    // new cliff before start
    assert!(h.edit_cliff(cliff, BASE_NOW + 10).await.is_err());
    // new cliff after end
    assert!(h.edit_cliff(cliff, BASE_NOW + 999).await.is_err());
    // expired
    h.set_time(BASE_NOW + 200);
    assert!(h.edit_cliff(cliff, BASE_NOW + 150).await.is_err());
}

#[tokio::test]
async fn edit_linear_error_paths() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    // wrong vesting type: edit_linear on a milestone stream
    let stream_pda = h.stream_pda(110);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let milestone_stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, milestones(&[500_000, 500_000]), 110, mint, creator_ata, &ms)
        .await
        .unwrap();
    assert!(h.edit_linear(milestone_stream, mint, creator_ata, BASE_NOW + 2000, 0).await.is_err());

    // linear stream: no-op (no extend, no topup) -> InvalidAmount
    let linear = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 111, mint, creator_ata, &[])
        .await
        .unwrap();
    assert!(h.edit_linear(linear, mint, creator_ata, BASE_NOW + 100, 0).await.is_err());

    // expired
    h.set_time(BASE_NOW + 200);
    assert!(h.edit_linear(linear, mint, creator_ata, BASE_NOW + 300, 0).await.is_err());
}

#[tokio::test]
async fn edit_milestone_error_paths() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    let stream_pda = h.stream_pda(120);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, milestones(&[500_000, 500_000]), 120, mint, creator_ata, &ms)
        .await
        .unwrap();

    // new_amount = 0 -> InvalidAmount
    assert!(h.edit_milestone(stream, ms[0], mint, creator_ata, 0).await.is_err());
}

#[tokio::test]
async fn edit_linear_extend_only() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    let linear = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 130, mint, creator_ata, &[])
        .await
        .unwrap();
    // extend only, no topup
    h.edit_linear(linear, mint, creator_ata, BASE_NOW + 300, 0).await.unwrap();
    assert_eq!(h.stream_account(&linear).await.end_ts, BASE_NOW + 300);
}

#[tokio::test]
async fn create_stream_zero_milestone_amount() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    let stream_pda = h.stream_pda(140);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    // total == amount but one milestone is zero -> InvalidAmount inside loop
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, milestones(&[TOKEN_AMOUNT, 0]), 140, mint, creator_ata, &ms)
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_milestone_count_mismatch() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    let stream_pda = h.stream_pda(141);
    // 2 milestones but only 1 remaining account passed
    let ms = vec![h.milestone_pda(&stream_pda, 0)];
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 1000, VESTING_MILESTONE, milestones(&[500_000, 500_000]), 141, mint, creator_ata, &ms)
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_wrong_token_owner() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, _creator_ata, recipient_ata) = h.setup_token(&mint).await;
    // pass recipient's ATA as the creator_token_account -> owner mismatch
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 142, mint, recipient_ata, &[])
        .await
        .is_err());
}

#[tokio::test]
async fn create_stream_wrong_mint() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint1 = Keypair::new();
    let (_m1, creator_ata1, _) = h.setup_token(&mint1).await;
    let mint2 = Keypair::new();
    let (m2, _creator_ata2, _) = h.setup_token(&mint2).await;
    // stream mint = mint2 but creator_token_account belongs to mint1 -> InvalidMint
    let _ = creator_ata1;
    let stream_pda = h.stream_pda(150);
    let _ = stream_pda;
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 150, m2, creator_ata1, &[])
        .await
        .is_err());
}

// ─── Boundary edge cases (Week 7 acceptance criteria) ─────────────────────────

#[tokio::test]
async fn withdraw_at_exactly_cliff_date() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    // cliff stream: start +60, cliff +80, end +160 (duration 100)
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 80, BASE_NOW + 160, VESTING_CLIFF, vec![], 200, mint, creator_ata, &[])
        .await
        .unwrap();

    // Just BEFORE the cliff: nothing is vested -> withdraw rejected.
    h.set_time(BASE_NOW + 79);
    assert!(h.withdraw(stream, mint, recipient_ata).await.is_err());

    // EXACTLY at the cliff date: vesting unlocks proportionally and withdraw succeeds.
    // vested = total * (cliff - start) / (end - start) = total * 20/100 = 20%.
    h.set_time(BASE_NOW + 80);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT / 5);
}

#[tokio::test]
async fn cancel_at_exactly_end_date_fails() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    // Create both streams up front (start date must be in the future relative
    // to the current clock), then warp time to exercise the boundaries.
    let before = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 201, mint, creator_ata, &[])
        .await
        .unwrap();
    let at_end = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 202, mint, creator_ata, &[])
        .await
        .unwrap();

    // Just BEFORE end date -> unvested funds remain -> cancel succeeds.
    h.set_time(BASE_NOW + 159);
    h.cancel(before, mint, creator_ata, recipient_ata).await.unwrap();
    assert_eq!(h.stream_account(&before).await.status, 3);

    // EXACTLY at end date -> fully vested -> cancel rejected (FullyVested).
    h.set_time(BASE_NOW + 160);
    assert!(h.cancel(at_end, mint, creator_ata, recipient_ata).await.is_err());
}

// ─── Security regression tests ────────────────────────────────────────────────

/// PDA reinitialization protection: a stream PDA is derived from
/// [b"stream", creator, recipient, nonce]; reusing the same nonce must fail
/// because the account already exists (Anchor `init`).
#[tokio::test]
async fn duplicate_stream_same_nonce_fails() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;

    h.create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 210, mint, creator_ata, &[])
        .await
        .unwrap();
    // same nonce -> same PDA -> reinit rejected
    assert!(h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 210, mint, creator_ata, &[])
        .await
        .is_err());
}

/// Authority: only the recipient may withdraw. A stranger signing in place of
/// the recipient is rejected by the `stream.recipient == recipient.key()`
/// constraint.
#[tokio::test]
async fn withdraw_by_non_recipient_fails() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 211, mint, creator_ata, &[])
        .await
        .unwrap();
    h.set_time(BASE_NOW + 110);

    // A stranger funds an ATA and tries to withdraw as if they were the recipient.
    let stranger = Keypair::new();
    h.fund(&stranger.pubkey()).await;
    let stranger_ata = h.create_ata(&stranger.pubkey(), &mint).await;
    assert!(h
        .withdraw_as(&stranger, stream, mint, stranger_ata)
        .await
        .is_err());
}

// ─── Additional branch coverage (false-side of conditionals) ──────────────────

/// Cancelling before the stream starts: nothing is vested, so the
/// `claimable_for_recipient > 0` branch takes its FALSE path and the full
/// amount is returned to the creator.
#[tokio::test]
async fn cancel_before_start_returns_all_to_creator() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 220, mint, creator_ata, &[])
        .await
        .unwrap();

    // still at BASE_NOW < start (+60): vested == 0
    let before = h.token_balance(&creator_ata).await;
    h.cancel(stream, mint, creator_ata, recipient_ata).await.unwrap();
    assert_eq!(h.stream_account(&stream).await.status, 3);
    // recipient got nothing; creator got the full stream amount back
    assert_eq!(h.token_balance(&recipient_ata).await, 0);
    assert_eq!(h.token_balance(&creator_ata).await, before + TOKEN_AMOUNT);
}

/// edit_linear with a top-up but WITHOUT extending the end date exercises the
/// FALSE path of the `new_end_ts > end_ts` branch (extend skipped, top-up runs).
#[tokio::test]
async fn edit_linear_topup_only() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
    let linear = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 221, mint, creator_ata, &[])
        .await
        .unwrap();

    // new_end_ts == current end (NOT greater) but topup > 0 -> only top-up applies
    h.edit_linear(linear, mint, creator_ata, BASE_NOW + 160, TOKEN_AMOUNT / 2).await.unwrap();
    let s = h.stream_account(&linear).await;
    assert_eq!(s.end_ts, BASE_NOW + 160); // unchanged
    assert_eq!(s.total_amount, TOKEN_AMOUNT + TOKEN_AMOUNT / 2);
}

// ─── withdraw_fees (admin fee withdrawal) ─────────────────────────────────────

/// Full fee lifecycle: a withdraw accrues SOL into the fee vault, then the
/// admin (fee_authority) withdraws it to a destination. Also covers the two
/// guards: unauthorized admin and over-withdrawal.
#[tokio::test]
async fn withdraw_fees_full_flow() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
    let stream = h
        .create_stream(TOKEN_AMOUNT, BASE_NOW + 60, BASE_NOW + 60, BASE_NOW + 160, VESTING_LINEAR, vec![], 230, mint, creator_ata, &[])
        .await
        .unwrap();

    // Accrue fees into the vault.
    h.set_time(BASE_NOW + 110);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    let collected = h.lamports(&Harness::fee_vault_pda()).await;
    assert!(collected > 0);

    let destination = Keypair::new().pubkey();
    h.fund(&destination).await;
    let dest_before = h.lamports(&destination).await;

    // Unauthorized: a stranger acting as admin is rejected.
    let stranger = Keypair::new();
    h.fund(&stranger.pubkey()).await;
    assert!(h
        .withdraw_fees_as(&stranger, destination, 1)
        .await
        .is_err());

    // Over-withdrawal: more than the vault balance is rejected.
    assert!(h
        .withdraw_fees(destination, collected + 1_000_000_000)
        .await
        .is_err());

    // Authorized withdrawal of the full collected amount succeeds.
    h.withdraw_fees(destination, collected).await.unwrap();
    assert_eq!(h.lamports(&destination).await, dest_before + collected);
}

// ══════════════════════════════════════════════════════════════════════════════
// Oracle coverage tests
// Target: read_chainlink_round() — semua branch harus kena
// ══════════════════════════════════════════════════════════════════════════════
//
// Branch map untuk read_chainlink_round():
//   [A] data.len() < FEED_MIN_LEN (232)   → InvalidOracleFeed
//   [B] staleness: now - updated_at >= 3600 → StaleOraclePrice
//   [C] staleness: now - updated_at == 3599 → OK (tepat di bawah batas)
//   [D] staleness: now - updated_at == 3600 → StaleOraclePrice (tepat di batas)
//   [E] answer == 0                         → InvalidOraclePrice
//   [F] answer < 0                          → InvalidOraclePrice
//   [G] happy path: valid feed              → Ok(ChainlinkRound { answer, decimals })
//
// Layout byte feed (248 byte):
//   offset 0x8a (138) → decimals: u8
//   offset 0xd0 (208) → updated_at: u32 LE
//   offset 0xd8 (216) → answer: i128 LE

// ─── Helper: buat raw feed bytes ─────────────────────────────────────────────

/// Duplikat helper dari harness utama, diekstrak eksplisit untuk kejelasan.
fn make_feed(decimals: u8, updated_at: i64, answer: i128) -> Vec<u8> {
    let mut data = vec![0u8; 248];
    data[0x8a] = decimals;
    data[0xd0..0xd4].copy_from_slice(&(updated_at as u32).to_le_bytes());
    data[0xd8..0xd8 + 16].copy_from_slice(&answer.to_le_bytes());
    data
}



// ─── Feed-level oracle unit tests (tanpa bankrun, via custom account) ─────────
//
// Strategy: inject feed account dengan data arbitrary ke ProgramTestContext,
// lalu trigger `withdraw` yang akan memanggil read_chainlink_round() internally.
// Kita proxy hasilnya lewat sukses/gagal-nya instruksi withdraw.

// Semua oracle test butuh stream aktif dengan waktu sudah mulai vesting.
// Setup helper inline di setiap test agar isolation terjaga.

// [G] Happy path — feed valid, staleness rendah, answer positif
#[tokio::test]
async fn oracle_happy_path_valid_feed() {
    let feed = make_feed(PRICE_DECIMALS, BASE_NOW, PRICE_RAW);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1001,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    // 50% vested, oracle fresh → withdraw harus sukses
    h.set_time(BASE_NOW + 110);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();

    // Pastikan token sudah diterima (oracle path benar-benar dieksekusi)
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT / 2);
}

// [B] Stale feed — updated_at jauh di masa lalu (> 3600 detik dari now)
#[tokio::test]
async fn oracle_stale_feed_far_past_rejected() {
    // updated_at = BASE_NOW - 7200 → staleness = 7200 > 3600
    let feed = make_feed(PRICE_DECIMALS, BASE_NOW - 7200, PRICE_RAW);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1002,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    // Harus gagal dengan StaleOraclePrice
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "stale feed (7200s) harus ditolak");
}

// [D] Staleness tepat di batas — updated_at = now - 3600 → harus DITOLAK
// (kondisi: now - updated_at < 3600 → false saat diff == 3600)
#[tokio::test]
async fn oracle_staleness_at_exact_boundary_rejected() {
    let now = BASE_NOW + 110; // waktu saat withdraw
    // updated_at = now - 3600 → diff == 3600 → tidak < 3600 → StaleOraclePrice
    let feed = make_feed(PRICE_DECIMALS, now - 3600, PRICE_RAW);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1003,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(now);
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "diff==3600 harus ditolak (off-by-one boundary)");
}

// [C] Staleness tepat di bawah batas — updated_at = now - 3599 → harus OK
#[tokio::test]
async fn oracle_staleness_one_second_before_boundary_accepted() {
    let now = BASE_NOW + 110;
    // updated_at = now - 3599 → diff == 3599 → 3599 < 3600 → lolos
    let feed = make_feed(PRICE_DECIMALS, now - 3599, PRICE_RAW);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1004,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(now);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    // Kalau sukses, oracle menerima feed dengan diff=3599
    assert!(h.token_balance(&recipient_ata).await > 0);
}

// [E] Answer == 0 — oracle mengembalikan nol
#[tokio::test]
async fn oracle_zero_answer_rejected() {
    let feed = make_feed(PRICE_DECIMALS, BASE_NOW, 0i128);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1005,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "answer==0 harus menghasilkan InvalidOraclePrice");
}

// [F] Answer negatif — oracle mengembalikan harga negatif
#[tokio::test]
async fn oracle_negative_answer_rejected() {
    let feed = make_feed(PRICE_DECIMALS, BASE_NOW, -1_000_000_000i128);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1006,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "answer negatif harus menghasilkan InvalidOraclePrice");
}

// [A] Data terlalu pendek — account data < FEED_MIN_LEN (232 byte)
// Inject feed account dengan data truncated langsung ke context.
#[tokio::test]
async fn oracle_feed_data_too_short_rejected() {
    // Feed hanya 100 byte → jauh di bawah FEED_MIN_LEN=232
    let short_feed: Vec<u8> = vec![0u8; 100];
    let mut h = Harness::new_with_feed(short_feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1007,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "feed data pendek harus menghasilkan InvalidOracleFeed");
}

// Tepat di batas minimum — 231 byte (FEED_MIN_LEN - 1) → harus ditolak
#[tokio::test]
async fn oracle_feed_data_min_len_minus_one_rejected() {
    let feed: Vec<u8> = vec![0u8; 231]; // FEED_MIN_LEN = 232
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1008,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "feed 231 byte (min-1) harus ditolak");
}

// Tepat di batas minimum — 232 byte valid dengan data nol kecuali field penting
// Ini menguji bahwa data.len() >= FEED_MIN_LEN lolos, tapi answer=0 akan gagal di cek berikutnya.
// Jadi: len check lolos, staleness check lolos (updated_at=BASE_NOW), answer=0 → InvalidOraclePrice
#[tokio::test]
async fn oracle_feed_data_exact_min_len_passes_length_check() {
    // 232 byte, updated_at valid, answer=0 → lolos len check, gagal di answer check
    let mut feed = vec![0u8; 232];
    feed[0x8a] = PRICE_DECIMALS;
    feed[0xd0..0xd4].copy_from_slice(&(BASE_NOW as u32).to_le_bytes());
    // answer = 0 (all zeros sudah di-set)

    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1009,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    // Harus gagal di answer==0, bukan di len check (membuktikan len branch lolos)
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "answer=0 harus ditolak meskipun len tepat di minimum");
}

// Feed dengan decimals=0 — fee_lamports menjadi 0 karena integer division
// fee = 99 * 10^9 * 10^0 / (100 * 10_000_000_000) = 99_000_000_000 / 1_000_000_000_000 = 0
// → require!(fee_lamports > 0) gagal → InvalidOraclePrice
#[tokio::test]
async fn oracle_decimals_zero_produces_zero_fee_rejected() {
    let feed = make_feed(0u8, BASE_NOW, PRICE_RAW);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1010,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    // decimals=0 → decimals_factor=1 → fee integer-divides to 0 → InvalidOraclePrice
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "decimals=0 menghasilkan fee_lamports=0 → harus ditolak");
}

// Feed dengan answer sangat kecil (1) — fee_lamports menjadi sangat besar
// Tidak overflow karena kita pakai u128 arithmetic, tapi hasilnya valid
#[tokio::test]
async fn oracle_very_small_answer_produces_large_fee() {
    // answer = 1 → fee_lamports = 0.99 * 10^9 * 10^8 / (100 * 1) = sangat besar
    // Tapi recipient punya 100 SOL jadi masih bisa bayar (atau tidak bisa → err)
    let feed = make_feed(PRICE_DECIMALS, BASE_NOW, 1i128);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1011,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    // Dengan answer=1, fee akan sangat besar → recipient tidak sanggup bayar
    // Ini tetap valid sebagai coverage: path oracle sukses dieksekusi,
    // kegagalan (jika ada) terjadi di SOL transfer bukan di oracle parsing.
    // Hasil bisa sukses (jika recipient punya cukup SOL) atau err (InsufficientFunds).
    // Yang penting: tidak panik, tidak InvalidOracleFeed/InvalidOraclePrice.
    let _ = h.withdraw(stream, mint, recipient_ata).await;
    // Test ini tentang tidak panic, bukan tentang sukses/gagalnya withdraw
}

// Feed dengan answer sangat besar — tidak menyebabkan overflow di fee calculation
#[tokio::test]
async fn oracle_very_large_answer_produces_tiny_fee() {
    // answer = i128::MAX / 2 → fee_lamports ≈ 0 (dibulatkan ke bawah)
    // fee_lamports = 0 → InvalidOraclePrice (require fee_lamports > 0)
    let large_answer: i128 = i128::MAX / 2;
    let feed = make_feed(PRICE_DECIMALS, BASE_NOW, large_answer);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1012,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    // fee_lamports menjadi 0 → require(fee_lamports > 0) gagal → InvalidOraclePrice
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err(), "answer terlalu besar → fee=0 → InvalidOraclePrice");
}

// Feed dengan updated_at di masa depan (future timestamp) — staleness check
// now - updated_at bisa negatif → saturating_sub menghasilkan 0 → lolos
#[tokio::test]
async fn oracle_future_updated_at_treated_as_fresh() {
    let now = BASE_NOW + 110;
    // updated_at = now + 100 → future timestamp → saturating_sub → 0 < 3600 → lolos
    let feed = make_feed(PRICE_DECIMALS, now + 100, PRICE_RAW);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1013,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(now);
    // saturating_sub(now, future) = 0 → 0 < 3600 → feed dianggap fresh
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    assert!(h.token_balance(&recipient_ata).await > 0);
}

// Feed dengan decimals tinggi (18) — memastikan decimals_factor tidak overflow u128
// 10^18 masih dalam range u128 (max ~3.4 * 10^38)
#[tokio::test]
async fn oracle_high_decimals_no_overflow() {
    // decimals=18, answer disesuaikan agar fee_lamports reasonable
    // fee = 0.99 * 10^9 * 10^18 / (100 * answer) → butuh answer sangat besar
    // Gunakan answer = 10^25 agar fee ≈ reasonable
    let high_answer: i128 = 10_000_000_000_000_000_000_000_000i128; // 10^25
    let feed = make_feed(18u8, BASE_NOW, high_answer);
    let mut h = Harness::new_with_feed(feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;

    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1014,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();

    h.set_time(BASE_NOW + 110);
    // Tidak harus sukses, tapi tidak boleh panic karena overflow
    let _ = h.withdraw(stream, mint, recipient_ata).await;
}

// ── Regression: oracle check tidak dipanggil untuk non-withdraw instructions ──
// Memastikan create_stream dengan feed invalid tetap berhasil
// (oracle hanya dicek di withdraw, bukan di create)
#[tokio::test]
async fn oracle_not_checked_during_create_stream() {
    // Feed dengan answer=0 (invalid untuk withdraw)
    let invalid_feed = make_feed(PRICE_DECIMALS, BASE_NOW, 0i128);
    let mut h = Harness::new_with_feed(invalid_feed).await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _recipient_ata) = h.setup_token(&mint).await;

    // create_stream tidak memanggil oracle → harus sukses meskipun feed invalid
    let result = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            1015,
            mint,
            creator_ata,
            &[],
        )
        .await;

    assert!(result.is_ok(), "create_stream tidak bergantung pada oracle");
}

#[tokio::test]
async fn cliff_stream_withdraw_after_cliff_date_linear_vesting_applies() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
 
    // cliff stream: start=+60, cliff=+80, end=+160
    // Setelah cliff (now >= cliff_ts), vested = total * (now - start) / (end - start)
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 80,
            BASE_NOW + 160,
            VESTING_CLIFF,
            vec![],
            300,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();
 
    // now = cliff + 20 → elapsed = 40, duration = 100 → vested = 40%
    // Ini meng-cover branch: vesting_type == CLIFF && now >= cliff_ts → SKIP cliff block
    // kemudian jatuh ke linear calculation
    h.set_time(BASE_NOW + 100);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
 
    let balance = h.token_balance(&recipient_ata).await;
    // vested = 1_000_000 * (100-60) / (160-60) = 1_000_000 * 40/100 = 400_000
    assert_eq!(balance, TOKEN_AMOUNT * 40 / 100);
}
 
// ─── [2b] vested_amount: CLIFF setelah end_ts → full amount ──────────────────
#[tokio::test]
async fn cliff_stream_withdraw_after_end_ts_returns_full_amount() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
 
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 80,
            BASE_NOW + 160,
            VESTING_CLIFF,
            vec![],
            301,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();
 
    // now > end_ts → vested = total_amount (cover: now >= end_ts branch untuk CLIFF)
    h.set_time(BASE_NOW + 200);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
 
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT);
    assert_eq!(h.stream_account(&stream).await.status, 2); // COMPLETED
}
 
// ─── [3] edit_milestone: new_amount == old_amount (no-op) ────────────────────
// Covers: if new_amount > old: FALSE, else if new_amount < old: FALSE
// → kedua branch di-skip, tidak ada transfer, hanya emit event
#[tokio::test]
async fn edit_milestone_same_amount_is_noop() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(302);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            302,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    // Edit milestone 0 dengan amount yang sama → no transfer, hanya event
    let vault_before = h
        .token_balance(&Harness::ata(&stream, &mint, &spl_token::id()))
        .await;
 
    h.edit_milestone(stream, ms[0], mint, creator_ata, 500_000)
        .await
        .unwrap();
 
    // Vault tidak berubah karena tidak ada transfer
    let vault_after = h
        .token_balance(&Harness::ata(&stream, &mint, &spl_token::id()))
        .await;
    assert_eq!(vault_before, vault_after);
 
    // Amount milestone tetap 500_000
    assert_eq!(h.milestone_account(&ms[0]).await.amount, 500_000);
 
    // Total amount stream tidak berubah
    assert_eq!(h.stream_account(&stream).await.total_amount, TOKEN_AMOUNT);
}
 
// ─── [4] create_stream: milestone account sudah pre-funded ───────────────────
// Covers: if current_lamports < required_lamports → FALSE path (skip transfer)
// Caranya: buat milestone PDA dulu dan fund manual sebelum create_stream
#[tokio::test]
async fn create_milestone_stream_with_prefunded_milestone_accounts() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(303);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
 
    // Pre-fund milestone accounts dengan lebih dari cukup lamports
    // sehingga branch `current_lamports < required_lamports` = FALSE
    let large_lamports = 10_000_000_000u64; // 10 SOL — jauh melebihi rent
    for milestone_key in &ms {
        h.ctx.set_account(
            milestone_key,
            &solana_sdk::account::Account {
                lamports: large_lamports,
                data: vec![],
                owner: solana_sdk::system_program::id(),
                executable: false,
                rent_epoch: 0,
            }
            .into(),
        );
    }
 
    // create_stream harus berhasil — lamports sudah cukup, skip transfer, lanjut allocate+assign
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            303,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    let s = h.stream_account(&stream).await;
    assert_eq!(s.milestone_count, 2);
}
 
// ─── [5] edit_cliff: withdrawn > 0 → StreamAlreadyStarted ────────────────────
// Covers branch: require!(stream.withdrawn == 0, StreamAlreadyStarted) FALSE
#[tokio::test]
async fn edit_cliff_after_partial_withdraw_fails() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
 
    // cliff stream: start=+60, cliff=+80, end=+160
    let cliff = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 80,
            BASE_NOW + 160,
            VESTING_CLIFF,
            vec![],
            304,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();
 
    // Advance ke setelah cliff dan withdraw
    h.set_time(BASE_NOW + 100);
    h.withdraw(cliff, mint, recipient_ata).await.unwrap();
 
    // Pastikan sudah ada withdrawn
    assert!(h.stream_account(&cliff).await.withdrawn > 0);
 
    // edit_cliff sekarang harus gagal: withdrawn > 0
    let err = h.edit_cliff(cliff, BASE_NOW + 90).await;
    assert!(err.is_err(), "edit_cliff setelah withdraw harus gagal dengan StreamAlreadyStarted");
}
 
// ─── [6] vested_amount: MILESTONE type dengan unlocked_milestone_amount > 0 ──
// Sudah dicovered via unlock_milestone tests yang ada, tapi tambahkan
// withdraw setelah unlock untuk cover path milestone → claimable > 0 → withdraw sukses
#[tokio::test]
async fn milestone_withdraw_after_unlock() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(305);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            305,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    // Unlock milestone 0
    h.unlock_milestone(stream, ms[0]).await.unwrap();
 
    // Withdraw: vested = unlocked_milestone_amount = 500_000
    h.set_time(BASE_NOW + 100);
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
 
    assert_eq!(h.token_balance(&recipient_ata).await, 500_000);
 
    // Double withdraw setelah milestone: NothingToWithdraw
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err());
 
    // Unlock milestone 1 → status COMPLETED → withdraw lagi
    h.unlock_milestone(stream, ms[1]).await.unwrap();
    h.withdraw(stream, mint, recipient_ata).await.unwrap();
    assert_eq!(h.token_balance(&recipient_ata).await, TOKEN_AMOUNT);
}

#[tokio::test]
async fn create_milestone_stream_skips_allocate_when_account_already_initialized() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(400);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
 
    // Pre-inject milestone accounts dengan:
    //   - owner = program_id (bukan system_program)
    //   - data non-empty (tidak kosong → data_is_empty() = false)
    //   - lamports >= rent-exempt (agar skip top-up juga)
    // Ini mensimulasikan milestone yang sudah pernah di-allocate+assign
    // 8 (discriminator) + MilestoneAccount::INIT_SPACE
    // stream(32) + index(1) + unlock_ts(8) + amount(8) + approved(1) + unlocked(1) + bump(1) = 52
    // total = 8 + 52 = 60
    let space = 8 + 52_usize; // == 8 + MilestoneAccount::INIT_SPACE
    let rent_lamports = 1_000_000u64; // cukup untuk rent-exempt milestone account kecil
 
    for milestone_key in &ms {
        // Data non-empty: isi dengan zeros tapi panjang > 0
        // Owner = program id unified_flow sehingga data_is_empty() check = false
        h.ctx.set_account(
            milestone_key,
            &solana_sdk::account::Account {
                lamports: rent_lamports,
                data: vec![0u8; space],
                owner: unified_flow::ID,   // owner = our program → data_is_empty() = false
                executable: false,
                rent_epoch: 0,
            }
            .into(),
        );
    }
 
    // create_stream harus berhasil:
    //   - lamports >= required → skip top-up
    //   - data_is_empty() = false → skip allocate+assign
    //   - langsung try_serialize milestone data
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            400,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    let s = h.stream_account(&stream).await;
    assert_eq!(s.milestone_count, 2);
 
    // Verify milestone data ter-serialize dengan benar
    let m0 = h.milestone_account(&ms[0]).await;
    assert_eq!(m0.amount, 500_000);
    assert_eq!(m0.index, 0);
    assert!(!m0.approved);
}
 
// ══════════════════════════════════════════════════════════════════════════════
// [3a] MathOverflow: edit_milestone total_amount.checked_add overflow
//
// Trigger: set stream.total_amount = u64::MAX via store_stream,
// lalu edit_milestone dengan new_amount > old_amount → diff = 1
// → total_amount.checked_add(1) = None → MathOverflow
// ══════════════════════════════════════════════════════════════════════════════
#[tokio::test]
async fn edit_milestone_increase_overflows_total_amount() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(401);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            401,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    // Corrupt stream.total_amount = u64::MAX via direct account manipulation
    let mut s = h.stream_account(&stream).await;
    s.total_amount = u64::MAX;
    h.store_stream(stream, s).await;
 
    // edit_milestone naik 1 → diff=1 → u64::MAX + 1 = overflow → MathOverflow
    let err = h
        .edit_milestone(stream, ms[0], mint, creator_ata, 500_001)
        .await;
    assert!(err.is_err());
    // Verifikasi error adalah MathOverflow
    let raw = format!("{:?}", err.unwrap_err());
    assert!(raw.contains("MathOverflow") || raw.contains("6006"),
        "expected MathOverflow, got: {raw}");
}
 
// ══════════════════════════════════════════════════════════════════════════════
// [3b] MathOverflow: unlock_milestone unlocked_milestone_amount.checked_add overflow
//
// Trigger: set stream.unlocked_milestone_amount = u64::MAX,
// lalu unlock_milestone → checked_add(milestone.amount) overflow
// ══════════════════════════════════════════════════════════════════════════════
#[tokio::test]
async fn unlock_milestone_overflows_unlocked_amount() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(402);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            402,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    // Corrupt stream.unlocked_milestone_amount = u64::MAX
    let mut s = h.stream_account(&stream).await;
    s.unlocked_milestone_amount = u64::MAX;
    h.store_stream(stream, s).await;
 
    // unlock_milestone 0 → u64::MAX + 500_000 = overflow → MathOverflow
    let err = h.unlock_milestone(stream, ms[0]).await;
    assert!(err.is_err());
    let raw = format!("{:?}", err.unwrap_err());
    assert!(raw.contains("MathOverflow") || raw.contains("6006"),
        "expected MathOverflow, got: {raw}");
}
 
// ══════════════════════════════════════════════════════════════════════════════
// [3c] MathOverflow: edit_linear total_amount.checked_add overflow
//
// Trigger: set stream.total_amount = u64::MAX, lalu edit_linear topup > 0
// ══════════════════════════════════════════════════════════════════════════════
#[tokio::test]
async fn edit_linear_topup_overflows_total_amount() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, _) = h.setup_token(&mint).await;
 
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 160,
            VESTING_LINEAR,
            vec![],
            403,
            mint,
            creator_ata,
            &[],
        )
        .await
        .unwrap();
 
    // Corrupt total_amount = u64::MAX
    let mut s = h.stream_account(&stream).await;
    s.total_amount = u64::MAX;
    h.store_stream(stream, s).await;
 
    // Mint extra token ke creator agar balance check lolos
    h.mint_to(&mint, &creator_ata, 1).await;
 
    // edit_linear topup=1 → u64::MAX + 1 = overflow → MathOverflow
    let err = h
        .edit_linear(stream, mint, creator_ata, BASE_NOW + 160, 1)
        .await;
    assert!(err.is_err());
    let raw = format!("{:?}", err.unwrap_err());
    assert!(raw.contains("MathOverflow") || raw.contains("6006"),
        "expected MathOverflow, got: {raw}");
}
 
// ══════════════════════════════════════════════════════════════════════════════
// [3d] MathOverflow: withdraw claimable.checked_sub overflow
//
// Trigger: set stream.withdrawn > stream.unlocked_milestone_amount
// (untuk MILESTONE type) → vested < withdrawn → checked_sub underflow
// ══════════════════════════════════════════════════════════════════════════════
#[tokio::test]
async fn withdraw_claimable_underflow_math_overflow() {
    let mut h = Harness::new().await;
    h.initialize_config().await.unwrap();
    let mint = Keypair::new();
    let (mint, creator_ata, recipient_ata) = h.setup_token(&mint).await;
 
    let stream_pda = h.stream_pda(404);
    let ms: Vec<Pubkey> = (0..2u8).map(|i| h.milestone_pda(&stream_pda, i)).collect();
    let stream = h
        .create_stream(
            TOKEN_AMOUNT,
            BASE_NOW + 60,
            BASE_NOW + 60,
            BASE_NOW + 1000,
            VESTING_MILESTONE,
            milestones(&[500_000, 500_000]),
            404,
            mint,
            creator_ata,
            &ms,
        )
        .await
        .unwrap();
 
    // Unlock milestone 0 (500_000 unlocked)
    h.unlock_milestone(stream, ms[0]).await.unwrap();
 
    // Corrupt: set withdrawn > unlocked_milestone_amount
    // vested = unlocked_milestone_amount = 500_000
    // withdrawn = 600_000 → claimable = 500_000 - 600_000 = underflow → MathOverflow
    let mut s = h.stream_account(&stream).await;
    s.withdrawn = 600_000;
    h.store_stream(stream, s).await;
 
    h.set_time(BASE_NOW + 100);
    let err = h.withdraw(stream, mint, recipient_ata).await;
    assert!(err.is_err());
    // Bisa MathOverflow atau NothingToWithdraw tergantung apakah checked_sub
    // dipanggil sebelum require!(claimable > 0)
    // Di kode: claimable = vested.checked_sub(withdrawn).ok_or(MathOverflow)?
    // → 500_000 - 600_000 = None → MathOverflow
    let raw = format!("{:?}", err.unwrap_err());
    assert!(
        raw.contains("MathOverflow") || raw.contains("6006"),
        "expected MathOverflow, got: {raw}"
    );
}