mod common;
use common::*;

use solana_instruction::{AccountMeta, Instruction};
use solana_program::{program_pack::Pack, system_program};
use solana_pubkey::Pubkey;
use spl_token::state::Mint;
use std::fs;

// ─── helper: run one ix, assert success, return CUs consumed ────────────────
fn bench_ix(label: &str, harness: &mut Harness, ix: &Instruction) -> u64 {
    let result = harness.process_ok(ix);
    let cus = result.compute_units_consumed;
    println!("{:<40} {:>8} CUs", label, cus);
    cus
}

fn main() {
    let mut harness = Harness::new();
    let config = Harness::config_pda();
    harness.initialize_config(config);

    // ── Shared mint & token accounts ─────────────────────────────────────
    let mint = Pubkey::new_unique();
    harness.create_token_mint(mint, harness.admin, MINT_DECIMALS, spl_token::ID, Mint::LEN);
    let creator_ata = harness.create_ata(harness.creator, mint, spl_token::ID);
    harness.mint_to(mint, creator_ata, harness.admin, TOKEN_AMOUNT * 200, spl_token::ID);
    let recipient_ata = harness.create_ata(harness.recipient, mint, spl_token::ID);
    let fee_vault = Harness::fee_vault_pda();
    harness.update_account(
        fee_vault,
        solana_account::Account {
            lamports: 0,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        },
    );

    // ── Pre-register PDAs so init constraints don't fail ─────────────────
    let linear_stream = harness.stream_pda(100);
    let linear_vault = spl_associated_token_account::get_associated_token_address_with_program_id(
        &linear_stream,
        &mint,
        &spl_token::ID,
    );
    harness
        .accounts
        .entry(linear_stream)
        .or_insert_with(solana_account::Account::default);
    harness
        .accounts
        .entry(linear_vault)
        .or_insert_with(solana_account::Account::default);

    let cliff_stream = harness.stream_pda(101);
    let cliff_vault = spl_associated_token_account::get_associated_token_address_with_program_id(
        &cliff_stream,
        &mint,
        &spl_token::ID,
    );
    harness
        .accounts
        .entry(cliff_stream)
        .or_insert_with(solana_account::Account::default);
    harness
        .accounts
        .entry(cliff_vault)
        .or_insert_with(solana_account::Account::default);

    let ms_stream = harness.stream_pda(102);
    let ms_vault = spl_associated_token_account::get_associated_token_address_with_program_id(
        &ms_stream,
        &mint,
        &spl_token::ID,
    );
    harness
        .accounts
        .entry(ms_stream)
        .or_insert_with(solana_account::Account::default);
    harness
        .accounts
        .entry(ms_vault)
        .or_insert_with(solana_account::Account::default);
    let ms_pdas = add_milestone_accounts_to_store(&mut harness, ms_stream, 4);

    // ── Build instructions ────────────────────────────────────────────────

    // 1. create_stream linear
    let create_linear_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(harness.recipient, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(linear_stream, false),
            AccountMeta::new(linear_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ],
        data: ix_data(
            "create_stream",
            &CreateStreamArgs {
                amount: TOKEN_AMOUNT,
                start_ts: BASE_NOW + 60,
                cliff_ts: BASE_NOW + 60,
                end_ts: BASE_NOW + STREAM_DURATION,
                vesting_type: VESTING_TYPE_LINEAR,
                milestones: vec![],
                nonce: 100,
            },
        ),
    };

    // 2. create_stream cliff
    let create_cliff_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(harness.recipient, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(cliff_stream, false),
            AccountMeta::new(cliff_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ],
        data: ix_data(
            "create_stream",
            &CreateStreamArgs {
                amount: TOKEN_AMOUNT,
                start_ts: BASE_NOW + 60,
                cliff_ts: BASE_NOW + 80,
                end_ts: BASE_NOW + STREAM_DURATION,
                vesting_type: VESTING_TYPE_CLIFF,
                milestones: vec![],
                nonce: 101,
            },
        ),
    };

    // 3. create_stream milestone ×4
    let create_milestone_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: {
            let mut accs = vec![
                AccountMeta::new(harness.creator, true),
                AccountMeta::new_readonly(harness.recipient, false),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new_readonly(config, false),
                AccountMeta::new(ms_stream, false),
                AccountMeta::new(ms_vault, false),
                AccountMeta::new(creator_ata, false),
                AccountMeta::new_readonly(system_program::ID, false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(spl_associated_token_account::ID, false),
            ];
            accs.extend(ms_pdas.iter().map(|p| AccountMeta::new(*p, false)));
            accs
        },
        data: ix_data(
            "create_stream",
            &CreateStreamArgs {
                amount: TOKEN_AMOUNT,
                start_ts: BASE_NOW + 60,
                cliff_ts: BASE_NOW + 60,
                end_ts: BASE_NOW + STREAM_DURATION,
                vesting_type: VESTING_TYPE_MILESTONE,
                milestones: build_milestones(&[250_000, 250_000, 250_000, 250_000]),
                nonce: 102,
            },
        ),
    };

    // ── Execute create_stream × 3 to populate on-chain state ─────────────
    // Clock is at BASE_NOW — all start_ts (BASE_NOW+60) are in the future ✓
    let mut results: Vec<(&str, u64)> = vec![];

    results.push(("create_stream_linear", bench_ix("create_stream_linear", &mut harness, &create_linear_ix)));
    results.push(("create_stream_cliff", bench_ix("create_stream_cliff", &mut harness, &create_cliff_ix)));
    results.push(("create_stream_milestone_4", bench_ix("create_stream_milestone_4", &mut harness, &create_milestone_ix)));

    // ── Advance clock to mid-stream for withdraw / cancel ────────────────
    // STREAM_DURATION = 1_000, so BASE_NOW+110 is 5% through the stream
    harness.set_time(BASE_NOW + 110);
    harness.set_oracle(PRICE_RAW, PRICE_DECIMALS, BASE_NOW + 110);

    // 4. withdraw (mid-stream, linear)
    let withdraw_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.recipient, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(linear_stream, false),
            AccountMeta::new(linear_vault, false),
            AccountMeta::new(recipient_ata, false),
            AccountMeta::new(fee_vault, false),
            AccountMeta::new_readonly(SOL_USD_FEED, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: ix_data("withdraw", &()),
    };
    results.push(("withdraw_mid_stream", bench_ix("withdraw_mid_stream", &mut harness, &withdraw_ix)));

    // 5. cancel (cliff stream — not yet past cliff, so recipient gets 0)
    // cliff_ts = BASE_NOW+80, current time = BASE_NOW+110 → cliff has passed,
    // so vested > 0 and cancel sends partial amounts. Still valid.
    let cancel_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(cliff_stream, false),
            AccountMeta::new(cliff_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new(recipient_ata, false),
            AccountMeta::new_readonly(spl_token::ID, false),
        ],
        data: ix_data("cancel", &()),
    };
    results.push(("cancel_cliff_stream", bench_ix("cancel_cliff_stream", &mut harness, &cancel_ix)));

    // 6. unlock_milestone 0
    let milestone0 = harness.milestone_pda(&ms_stream, 0);
    let unlock_ms_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new(ms_stream, false),
            AccountMeta::new(milestone0, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: ix_data("unlock_milestone", &()),
    };
    results.push(("unlock_milestone_0", bench_ix("unlock_milestone_0", &mut harness, &unlock_ms_ix)));

    // ── Reset clock to BASE_NOW for edit benches ──────────────────────────
    // edit_cliff requires: now < end_ts AND withdrawn == 0 AND new_cliff >= now
    // We create a fresh cliff stream at BASE_NOW, then bench edit_cliff at BASE_NOW+61
    harness.set_time(BASE_NOW);

    // 7. Create fresh cliff stream for edit_cliff bench
    // (cliff_stream nonce=101 is now cancelled — use nonce 103)
    let cliff2_stream = harness.create_stream(
        TOKEN_AMOUNT,
        BASE_NOW + 60,
        BASE_NOW + 80,
        BASE_NOW + STREAM_DURATION,
        VESTING_TYPE_CLIFF,
        vec![],
        103,
        mint,
        creator_ata,
        spl_token::ID,
        vec![],
    );

    // Create a fresh linear stream for edit_linear bench
    // (linear_stream nonce=100 has already had a withdraw — still active,
    //  but let's use a clean one so topup math is predictable, nonce 104)
    let linear2_stream = harness.stream_pda(104);
    let linear2_vault = spl_associated_token_account::get_associated_token_address_with_program_id(
        &linear2_stream,
        &mint,
        &spl_token::ID,
    );
    harness
        .accounts
        .entry(linear2_stream)
        .or_insert_with(solana_account::Account::default);
    harness
        .accounts
        .entry(linear2_vault)
        .or_insert_with(solana_account::Account::default);
    harness.process_ok(&Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(harness.recipient, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(linear2_stream, false),
            AccountMeta::new(linear2_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(spl_associated_token_account::ID, false),
        ],
        data: ix_data(
            "create_stream",
            &CreateStreamArgs {
                amount: TOKEN_AMOUNT,
                start_ts: BASE_NOW + 60,
                cliff_ts: BASE_NOW + 60,
                end_ts: BASE_NOW + STREAM_DURATION,
                vesting_type: VESTING_TYPE_LINEAR,
                milestones: vec![],
                nonce: 104,
            },
        ),
    });

    // Advance to BASE_NOW+61: past start, before cliff, stream not expired
    harness.set_time(BASE_NOW + 61);

    // 7. edit_cliff
    // Constraint: withdrawn == 0 (cliff2 never had a withdraw) ✓
    // new_cliff_ts (BASE_NOW+90) >= now (BASE_NOW+61) ✓
    // new_cliff_ts <= end_ts (BASE_NOW+STREAM_DURATION) ✓
    let edit_cliff_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(cliff2_stream, false),
        ],
        data: ix_data("edit_cliff", &EditCliffArgs {
            new_cliff_ts: BASE_NOW + 90,
        }),
    };
    results.push(("edit_cliff", bench_ix("edit_cliff", &mut harness, &edit_cliff_ix)));

    // 8. edit_linear (extend end + topup)
    // Constraint: now (BASE_NOW+61) < end_ts (BASE_NOW+STREAM_DURATION) ✓
    // new_end_ts (BASE_NOW+STREAM_DURATION+500) > current end_ts ✓
    let edit_linear_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(linear2_stream, false),
            AccountMeta::new(linear2_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(spl_token::ID, false),
        ],
        data: ix_data("edit_linear", &EditLinearArgs {
            new_end_ts: BASE_NOW + STREAM_DURATION + 500,
            topup_amount: TOKEN_AMOUNT / 4,
        }),
    };
    results.push(("edit_linear_extend_topup", bench_ix("edit_linear_extend_topup", &mut harness, &edit_linear_ix)));

    // 9. edit_milestone (raise allocation on milestone index 1)
    // milestone 0 was unlocked above → next_milestone_index == 1
    // milestone 1 is still locked → can be edited ✓
    let milestone1 = harness.milestone_pda(&ms_stream, 1);
    let edit_ms_ix = Instruction {
        program_id: unified_flow::ID,
        accounts: vec![
            AccountMeta::new(harness.creator, true),
            AccountMeta::new(ms_stream, false),
            AccountMeta::new(milestone1, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(ms_vault, false),
            AccountMeta::new(creator_ata, false),
            AccountMeta::new_readonly(spl_token::ID, false),
        ],
        data: ix_data("edit_milestone", &EditMilestoneArgs {
            new_amount: 300_000,
        }),
    };
    results.push(("edit_milestone_raise", bench_ix("edit_milestone_raise", &mut harness, &edit_ms_ix)));

    // ── Write markdown report ─────────────────────────────────────────────
    let out_dir = "../../target/benches";
    fs::create_dir_all(out_dir).unwrap_or_default();

    // Try to read previous run for delta comparison
    let prev_path = format!("{}/compute_units.md", out_dir);
    let prev_values: std::collections::HashMap<String, u64> = fs::read_to_string(&prev_path)
        .unwrap_or_default()
        .lines()
        .filter(|l| l.starts_with('|') && !l.contains("Name") && !l.contains("---"))
        .filter_map(|l| {
            let cols: Vec<&str> = l.split('|').map(str::trim).filter(|s| !s.is_empty()).collect();
            if cols.len() >= 2 {
                let name = cols[0].to_string();
                let cus: u64 = cols[1].replace(',', "").parse().ok()?;
                Some((name, cus))
            } else {
                None
            }
        })
        .collect();

    let mut md = String::from("| Name | CUs | Delta |\n| ---- | --- | ----- |\n");
    for (name, cus) in &results {
        let delta = match prev_values.get(*name) {
            Some(&prev) if prev != *cus => {
                let diff = *cus as i64 - prev as i64;
                if diff > 0 {
                    format!("+{}", diff)
                } else {
                    format!("{}", diff)
                }
            }
            Some(_) => "--".to_string(),
            None => "--".to_string(),
        };
        md.push_str(&format!(
            "| {} | {:>6} | {} |\n",
            name,
            format_cus(*cus),
            delta
        ));
    }

    fs::write(&prev_path, &md).expect("write bench output");
    println!("\nReport written to {}", prev_path);
    println!("\n{}", md);
}

fn format_cus(cus: u64) -> String {
    // format with thousands separator: 123456 → "123,456"
    let s = cus.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out.chars().rev().collect()
}