use anchor_lang::prelude::*;
use crate::ErrorCode;

// oracle.rs
#[cfg(feature = "mainnet")]
pub(crate) const SOL_USD_FEED: Pubkey =
    pubkey!("CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt");

#[cfg(not(feature = "mainnet"))]
pub(crate) const SOL_USD_FEED: Pubkey =
    pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
pub(crate) const CHAINLINK_PROGRAM_ID: Pubkey =
    pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");

// ===================================================
// Chainlink Feed Reader
//
// Reads SOL/USD price from raw account feed bytes.
// Layout verified from hex dump of devnet feed 99B2bT...rR:
//
//   0x8a (138) - decimals  : u8
//   0xd0 (208) - updated_at: u32 LE (Unix timestamp)
//   0xd8 (216) - answer    : i128 LE (price * 10^decimals)
// ===================================================

const FEED_DECIMALS_OFFSET:  usize = 0x8a;
const FEED_TIMESTAMP_OFFSET: usize = 0xd0;
const FEED_ANSWER_OFFSET:    usize = 0xd8;

// FEED_MIN_LEN ditulis sebagai literal untuk menghindari `match` region
// yang dihasilkan LLVM dari `checked_add` — 0xd8 + 16 = 232.
const FEED_MIN_LEN:     usize = 232; // FEED_ANSWER_OFFSET (0xd8=216) + 16
const FEED_MAX_STALENESS: i64 = 3_600; // 1 hour

pub(crate) struct ChainlinkRound {
    pub answer:   i128,
    pub decimals: u8,
}

pub(crate) fn read_chainlink_round(feed: &AccountInfo, now: i64) -> Result<ChainlinkRound> {
    let data = feed.try_borrow_data()?;

    require!(data.len() >= FEED_MIN_LEN, ErrorCode::InvalidOracleFeed);

    let decimals = data[FEED_DECIMALS_OFFSET];

    // SAFETY: len >= FEED_MIN_LEN (232) guarantees both slices are in-bounds.
    // We use compile-time-sized arrays via copy_into_array() to avoid the
    // try_into() Err branch that LLVM counts as an uncoverable region.
    let updated_at = i64::from(u32::from_le_bytes(
        copy4(&data[FEED_TIMESTAMP_OFFSET..FEED_TIMESTAMP_OFFSET.checked_add(4).ok_or(ErrorCode::MathOverflow)?]),
    ));

    require!(
        now.saturating_sub(updated_at) < FEED_MAX_STALENESS,
        ErrorCode::StaleOraclePrice
    );

    let answer = i128::from_le_bytes(
        copy16(&data[FEED_ANSWER_OFFSET..FEED_ANSWER_OFFSET.checked_add(16).ok_or(ErrorCode::MathOverflow)?]),
    );

    require!(answer > 0, ErrorCode::InvalidOraclePrice);

    Ok(ChainlinkRound { answer, decimals })
}

// ─── Infallible slice-to-array helpers ───────────────────────────────────────
// Mengganti `.try_into().map_err(...)` yang menghasilkan 2 LLVM regions
// (Ok + Err) dengan fungsi yang hanya punya 1 region (selalu Ok).
// Caller wajib memastikan slice panjangnya tepat sebelum memanggil.

#[inline(always)]
fn copy4(s: &[u8]) -> [u8; 4] {
    debug_assert_eq!(s.len(), 4);
    [s[0], s[1], s[2], s[3]]
}

#[inline(always)]
fn copy16(s: &[u8]) -> [u8; 16] {
    debug_assert_eq!(s.len(), 16);
    [
        s[0],  s[1],  s[2],  s[3],
        s[4],  s[5],  s[6],  s[7],
        s[8],  s[9],  s[10], s[11],
        s[12], s[13], s[14], s[15],
    ]
}