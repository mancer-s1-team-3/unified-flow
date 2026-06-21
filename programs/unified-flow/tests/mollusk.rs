mod common;

use common::*;

use anchor_lang::{AccountDeserialize, AnchorSerialize};
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_program::{program_pack::Pack, system_program};
use solana_pubkey::Pubkey;
use spl_token::state::Mint;
use unified_flow::{ConfigAccount, MilestoneInput};

fn fresh_harness() -> Harness {
    Harness::new()
}

fn config_account_mut(harness: &mut Harness) -> (Pubkey, ConfigAccount) {
    let config = Harness::config_pda();
    let account = harness.account(&config);
    let mut data = account.data.as_slice();
    let config_state = ConfigAccount::try_deserialize(&mut data).expect("config deserialize");
    (config, config_state)
}

fn store_config(harness: &mut Harness, config: Pubkey, config_state: ConfigAccount) {
    let mut account = harness.account(&config);
    let mut data = Vec::new();
    config_state.serialize(&mut data).expect("config serialize");
    account.data = data;
    harness.update_account(config, account);
}

fn create_base_stream(
    harness: &mut Harness,
    vesting_type: u8,
    amount: u64,
    nonce: u64,
    token_program: Pubkey,
    start_ts: i64,
    cliff_ts: i64,
    end_ts: i64,
    milestones: Vec<MilestoneInput>,
) -> (Pubkey, Pubkey, Pubkey, Pubkey) {
    let mint = Pubkey::new_unique();
    harness.create_token_mint(mint, harness.admin, MINT_DECIMALS, token_program, Mint::LEN);
    let creator_ata = harness.create_ata(harness.creator, mint, token_program);
    harness.mint_to(mint, creator_ata, harness.admin, TOKEN_AMOUNT * 100, token_program);
    let recipient_ata = harness.create_ata(harness.recipient, mint, token_program);
    let stream = harness.stream_pda(nonce);
    let remaining_accounts = if vesting_type == VESTING_TYPE_MILESTONE {
        add_milestone_accounts_to_store(harness, stream, milestones.len())
    } else {
        vec![]
    };
    let stream = harness.create_stream(
        amount,
        start_ts,
        cliff_ts,
        end_ts,
        vesting_type,
        milestones,
        nonce,
        mint,
        creator_ata,
        token_program,
        remaining_accounts,
    );
    (mint, creator_ata, recipient_ata, stream)
}

#[test]
fn create_stream_matrix() {
    let mut harness = fresh_harness();
    let config = Harness::config_pda();
    harness.initialize_config(config);

    let (mint, creator_ata, _, linear_stream) = create_base_stream(
        &mut harness,
        VESTING_TYPE_LINEAR,
        TOKEN_AMOUNT,
        1,
        spl_token::ID,
        BASE_NOW + 60,
        BASE_NOW + 60,
        BASE_NOW + 160,
        vec![],
    );
    let linear = harness.stream_account(&linear_stream);
    assert_eq!(linear.total_amount, TOKEN_AMOUNT);
    assert_eq!(linear.vesting_type, VESTING_TYPE_LINEAR);
    assert_eq!(harness.token_balance(&creator_ata), TOKEN_AMOUNT * 99);

    let (_, _, _, cliff_stream) = create_base_stream(
        &mut harness,
        VESTING_TYPE_CLIFF,
        TOKEN_AMOUNT,
        2,
        spl_token::ID,
        BASE_NOW + 60,
        BASE_NOW + 80,
        BASE_NOW + 160,
        vec![],
    );
    let cliff = harness.stream_account(&cliff_stream);
    assert_eq!(cliff.cliff_ts, BASE_NOW + 80);

    let milestones = build_milestones(&[250_000, 250_000, 250_000, 250_000]);
    let (_, _, _, milestone_stream) = create_base_stream(
        &mut harness,
        VESTING_TYPE_MILESTONE,
        TOKEN_AMOUNT,
        3,
        spl_token::ID,
        BASE_NOW + 60,
        BASE_NOW + 60,
        BASE_NOW + 1_000,
        milestones.clone(),
    );
    let milestone = harness.stream_account(&milestone_stream);
    assert_eq!(milestone.milestone_count, 4);
    for index in 0..4 {
        let pda = harness.milestone_pda(&milestone_stream, index);
        let item = harness.milestone_account(&pda);
        assert_eq!(item.index, index);
        assert_eq!(item.amount, 250_000);
    }

    harness.set_time(BASE_NOW - 1);
    let dummy_stream = Pubkey::new_unique();
    let dummy_vault = spl_associated_token_account::get_associated_token_address_with_program_id(&dummy_stream, &mint, &spl_token::ID);
    harness.accounts.entry(dummy_stream).or_insert_with(|| Account { lamports: 0, data: vec![], owner: system_program::ID, executable: false, rent_epoch: 0 });
    harness.accounts.entry(dummy_vault).or_insert_with(|| Account { lamports: 0, data: vec![], owner: system_program::ID, executable: false, rent_epoch: 0 });
    let past_result = harness.process_err(&Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(harness.recipient, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(dummy_stream, false),
            AccountMeta::new(dummy_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ],
        data: ix_data(
            "create_stream",
            &CreateStreamArgs {
                amount: TOKEN_AMOUNT,
                start_ts: BASE_NOW - 1,
                cliff_ts: BASE_NOW,
                end_ts: BASE_NOW + 60,
                vesting_type: VESTING_TYPE_LINEAR,
                milestones: vec![],
                nonce: 99,
            },
        ),
    });
    assert_failed(&past_result);
}

#[test]
fn create_stream_validation_matrix() {
    let mut harness = fresh_harness();
    harness.initialize_config(Harness::config_pda());

    let mint = Pubkey::new_unique();
    harness.create_token_mint(mint, harness.admin, MINT_DECIMALS, spl_token::ID, Mint::LEN);
    let creator_ata = harness.create_ata(harness.creator, mint, spl_token::ID);
    harness.mint_to(mint, creator_ata, harness.admin, TOKEN_AMOUNT * 2, spl_token::ID);

    let base_args = CreateStreamArgs {
        amount: TOKEN_AMOUNT,
        start_ts: BASE_NOW + 60,
        cliff_ts: BASE_NOW + 60,
        end_ts: BASE_NOW + 160,
        vesting_type: VESTING_TYPE_LINEAR,
        milestones: vec![],
        nonce: 10,
    };

    for (label, args, expect_ok) in [
        ("zero amount", { let mut a = base_args.clone(); a.amount = 0; a }, false),
        ("invalid vesting", { let mut a = base_args.clone(); a.vesting_type = 9; a }, false),
        ("duration too short", { let mut a = base_args.clone(); a.end_ts = a.start_ts + 59; a }, false),
        ("start in past", { let mut a = base_args.clone(); a.start_ts = BASE_NOW - 1; a }, false),
        ("end in past", { let mut a = base_args.clone(); a.end_ts = BASE_NOW - 1; a }, false),
        ("cliff before start", { let mut a = base_args.clone(); a.cliff_ts = a.start_ts - 1; a }, false),
        ("cliff after end", { let mut a = base_args.clone(); a.cliff_ts = a.end_ts + 1; a }, false),
        ("linear with milestones", { let mut a = base_args.clone(); a.milestones = build_milestones(&[1]); a }, false),
    ] {
        let stream = Pubkey::new_unique();
        let vault = spl_associated_token_account::get_associated_token_address_with_program_id(&stream, &mint, &spl_token::ID);
        harness.accounts.entry(stream).or_insert_with(|| Account {
            lamports: 0,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        });
        harness.accounts.entry(vault).or_insert_with(|| Account {
            lamports: 0,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        });
        let mut accounts = vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(harness.recipient, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Harness::config_pda(), false),
            AccountMeta::new(stream, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ];
        if args.vesting_type == VESTING_TYPE_MILESTONE {
            let milestone = harness.milestone_pda(&stream, 0);
            accounts.push(AccountMeta::new(milestone, false));
            harness.accounts.entry(milestone).or_insert(Account {
                lamports: 1_000_000_000,
                data: vec![],
                owner: system_program::ID,
                executable: false,
                rent_epoch: 0,
            });
        }
        let ix = Instruction {
            program_id: unified_flow::ID,
            accounts,
            data: ix_data("create_stream", &args),
        };
        if expect_ok {
            harness.process_ok(&ix);
        } else {
            let result = harness.process_err(&ix);
            assert_failed(&result);
            let _ = label;
        }
    }

    let transfer_fee_mint = Pubkey::new_unique();
    harness.create_transfer_fee_mint(
        transfer_fee_mint,
        harness.admin,
        harness.admin,
        MINT_DECIMALS,
        25,
        1_000,
    );
    let transfer_fee_ata = harness.create_ata(harness.creator, transfer_fee_mint, spl_token_2022::ID);
    harness.mint_to(transfer_fee_mint, transfer_fee_ata, harness.admin, TOKEN_AMOUNT, spl_token_2022::ID);
    let stream = Pubkey::new_unique();
    let vault = spl_associated_token_account::get_associated_token_address_with_program_id(&stream, &transfer_fee_mint, &spl_token_2022::ID);
    harness.accounts.entry(stream).or_insert_with(|| Account { lamports: 0, data: vec![], owner: system_program::ID, executable: false, rent_epoch: 0 });
    harness.accounts.entry(vault).or_insert_with(|| Account { lamports: 0, data: vec![], owner: system_program::ID, executable: false, rent_epoch: 0 });
    let ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(harness.recipient, false),
            AccountMeta::new_readonly(transfer_fee_mint, false),
            AccountMeta::new_readonly(Harness::config_pda(), false),
            AccountMeta::new(stream, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(transfer_fee_ata, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token_2022::ID, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ],
        data: ix_data("create_stream", &base_args),
    };
    let result = harness.process_err(&ix);
    assert_failed(&result);
}

#[test]
fn withdraw_matrix() {
    let mut harness = fresh_harness();
    harness.initialize_config(Harness::config_pda());

    let mint = Pubkey::new_unique();
    harness.create_token_mint(mint, harness.admin, MINT_DECIMALS, spl_token::ID, Mint::LEN);
    let creator_ata = harness.create_ata(harness.creator, mint, spl_token::ID);
    let recipient_ata = harness.create_ata(harness.recipient, mint, spl_token::ID);
    let fee_vault = Harness::fee_vault_pda();
    harness.update_account(
        fee_vault,
        Account {
            lamports: 0,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        },
    );
    harness.mint_to(mint, creator_ata, harness.admin, TOKEN_AMOUNT * 100, spl_token::ID);

    let stream = harness.create_stream(
        TOKEN_AMOUNT,
        BASE_NOW + 60,
        BASE_NOW + 60,
        BASE_NOW + 160,
        VESTING_TYPE_LINEAR,
        vec![],
        40,
        mint,
        creator_ata,
        spl_token::ID,
        vec![],
    );


    harness.set_time(BASE_NOW + 110);
    harness.set_oracle(PRICE_RAW, PRICE_DECIMALS, BASE_NOW + 110);
    harness.withdraw(stream, mint, recipient_ata, fee_vault, spl_token::ID);
    assert_eq!(harness.token_balance(&recipient_ata), TOKEN_AMOUNT / 2);
    assert_eq!(harness.account(&fee_vault).lamports, EXPECTED_WITHDRAW_FEE_LAMPORTS);

    harness.set_time(BASE_NOW + 160);
    harness.set_oracle(PRICE_RAW, PRICE_DECIMALS, BASE_NOW + 160);
    harness.withdraw(stream, mint, recipient_ata, fee_vault, spl_token::ID);
    assert_eq!(harness.token_balance(&recipient_ata), TOKEN_AMOUNT);
    let stream_state = harness.stream_account(&stream);
    assert_eq!(stream_state.status, 2);

    harness.set_time(BASE_NOW + 110);
    let no_tokens = harness.process_err(&Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.recipient, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Harness::config_pda(), false),
            AccountMeta::new(stream, false),
            AccountMeta::new(spl_associated_token_account::get_associated_token_address_with_program_id(&stream, &mint, &spl_token::ID), false),
            AccountMeta::new(recipient_ata, false),
            AccountMeta::new(fee_vault, false),
            AccountMeta::new_readonly(SOL_USD_FEED, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: ix_data("withdraw", &()),
    });
    assert_failed(&no_tokens);

    let mut paused_config = config_account_mut(&mut harness).1;
    paused_config.paused = true;
    store_config(&mut harness, Harness::config_pda(), paused_config);
    let paused = harness.process_err(&Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.recipient, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Harness::config_pda(), false),
            AccountMeta::new(stream, false),
            AccountMeta::new(spl_associated_token_account::get_associated_token_address_with_program_id(&stream, &mint, &spl_token::ID), false),
            AccountMeta::new(recipient_ata, false),
            AccountMeta::new(fee_vault, false),
            AccountMeta::new_readonly(SOL_USD_FEED, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: ix_data("withdraw", &()),
    });
    assert_failed(&paused);

    // withdraw_fees must also respect the global pause (pause guard runs first)
    let fees_paused = harness.process_err(&Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.admin, true),
            AccountMeta::new_readonly(Harness::config_pda(), false),
            AccountMeta::new(fee_vault, false),
            AccountMeta::new(harness.stranger, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: ix_data("withdraw_fees", &1u64),
    });
    assert_failed(&fees_paused);
}

#[test]
fn cancel_and_milestone_matrix() {
    let mut harness = fresh_harness();
    harness.initialize_config(Harness::config_pda());

    let mint = Pubkey::new_unique();
    harness.create_token_mint(mint, harness.admin, MINT_DECIMALS, spl_token::ID, Mint::LEN);
    let creator_ata = harness.create_ata(harness.creator, mint, spl_token::ID);
    let recipient_ata = harness.create_ata(harness.recipient, mint, spl_token::ID);
    harness.mint_to(mint, creator_ata, harness.admin, TOKEN_AMOUNT * 100, spl_token::ID);

    let linear_stream = harness.create_stream(
        TOKEN_AMOUNT,
        BASE_NOW + 60,
        BASE_NOW + 60,
        BASE_NOW + 160,
        VESTING_TYPE_LINEAR,
        vec![],
        50,
        mint,
        creator_ata,
        spl_token::ID,
        vec![],
    );
    harness.set_time(BASE_NOW + 60);
    harness.cancel(linear_stream, mint, creator_ata, recipient_ata, spl_token::ID);
    let cancel_state = harness.stream_account(&linear_stream);
    assert_eq!(cancel_state.status, 3);
    assert!(harness.token_balance(&creator_ata) > 0);

    let second_cancel = harness.process_err(&Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(linear_stream, false),
            AccountMeta::new(spl_associated_token_account::get_associated_token_address_with_program_id(&linear_stream, &mint, &spl_token::ID), false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new(recipient_ata, false),
            AccountMeta::new_readonly(spl_token::ID, false),
        ],
        data: ix_data("cancel", &()),
    });
    assert_failed(&second_cancel);

    let milestone_stream_pda = harness.stream_pda(51);
    let milestone_accounts = add_milestone_accounts_to_store(&mut harness, milestone_stream_pda, 4);
    let milestone_stream = harness.create_stream(
        TOKEN_AMOUNT,
        BASE_NOW + 60,
        BASE_NOW + 60,
        BASE_NOW + 1_000,
        VESTING_TYPE_MILESTONE,
        build_milestones(&[250_000, 250_000, 250_000, 250_000]),
        51,
        mint,
        creator_ata,
        spl_token::ID,
        milestone_accounts,
    );
    let milestone0 = harness.milestone_pda(&milestone_stream, 0);
    let milestone1 = harness.milestone_pda(&milestone_stream, 1);
    harness.unlock_milestone(milestone_stream, milestone0);
    harness.edit_milestone(milestone_stream, milestone1, mint, spl_associated_token_account::get_associated_token_address_with_program_id(&milestone_stream, &mint, &spl_token::ID), creator_ata, spl_token::ID, 300_000);
    let milestone_state = harness.milestone_account(&milestone0);
    assert!(milestone_state.approved);
}

#[test]
fn edit_flow_matrix() {
    let mut harness = fresh_harness();
    harness.initialize_config(Harness::config_pda());

    let mint = Pubkey::new_unique();
    harness.create_token_mint(mint, harness.admin, MINT_DECIMALS, spl_token::ID, Mint::LEN);
    let creator_ata = harness.create_ata(harness.creator, mint, spl_token::ID);
    harness.mint_to(mint, creator_ata, harness.admin, TOKEN_AMOUNT * 100, spl_token::ID);

    let cliff_stream = harness.create_stream(
        TOKEN_AMOUNT,
        BASE_NOW + 60,
        BASE_NOW + 80,
        BASE_NOW + 160,
        VESTING_TYPE_CLIFF,
        vec![],
        60,
        mint,
        creator_ata,
        spl_token::ID,
        vec![],
    );
    harness.set_time(BASE_NOW + 61);
    harness.edit_cliff(cliff_stream, BASE_NOW + 100);
    let cliff_state = harness.stream_account(&cliff_stream);
    assert_eq!(cliff_state.cliff_ts, BASE_NOW + 100);

    let linear_stream = harness.create_stream(
        TOKEN_AMOUNT,
        BASE_NOW + 61,
        BASE_NOW + 61,
        BASE_NOW + 160,
        VESTING_TYPE_LINEAR,
        vec![],
        61,
        mint,
        creator_ata,
        spl_token::ID,
        vec![],
    );
    harness.set_time(BASE_NOW + 61);
    harness.edit_linear(linear_stream, mint, spl_associated_token_account::get_associated_token_address_with_program_id(&linear_stream, &mint, &spl_token::ID), creator_ata, spl_token::ID, BASE_NOW + 220, TOKEN_AMOUNT / 4);
    let linear_state = harness.stream_account(&linear_stream);
    assert_eq!(linear_state.end_ts, BASE_NOW + 220);
    assert_eq!(linear_state.total_amount, TOKEN_AMOUNT + TOKEN_AMOUNT / 4);
}
