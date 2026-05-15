use anchor_lang::prelude::*;

use crate::ErrorCode;

pub(crate) const SOL_USD_FEED: Pubkey = pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
pub(crate) const CHAINLINK_PROGRAM_ID: Pubkey =
    pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");

// ===================================================
// Chainlink Feed Reader
//
// Reads SOL/USD price from raw account feed bytes
// without external crates. Layout verified from
// hex dump of devnet feed 99B2bT...rR:
//
//   0x8a (138) - decimals  : u8
//   0xd0 (208) - updated_at: u32 LE (Unix timestamp)
//   0xd8 (216) - answer    : i128 LE (price * 10^decimals)
// ===================================================

const FEED_DECIMALS_OFFSET: usize = 0x8a;
const FEED_TIMESTAMP_OFFSET: usize = 0xd0;
const FEED_ANSWER_OFFSET: usize = 0xd8;
const FEED_MIN_LEN: usize = FEED_ANSWER_OFFSET + 16;
const FEED_MAX_STALENESS: i64 = 3_600; // 1 hour

pub(crate) struct ChainlinkRound {
    pub answer: i128,
    pub decimals: u8,
}

pub(crate) fn read_chainlink_round(feed: &AccountInfo, now: i64) -> Result<ChainlinkRound> {
    let data = feed.try_borrow_data()?;
    require!(data.len() >= FEED_MIN_LEN, ErrorCode::InvalidOracleFeed);

    let decimals = data[FEED_DECIMALS_OFFSET];

    let updated_at = u32::from_le_bytes(
        data[FEED_TIMESTAMP_OFFSET..FEED_TIMESTAMP_OFFSET + 4]
            .try_into()
            .map_err(|_| error!(ErrorCode::InvalidOracleFeed))?,
    ) as i64;

    require!(
        now.saturating_sub(updated_at) < FEED_MAX_STALENESS,
        ErrorCode::StaleOraclePrice
    );

    let answer = i128::from_le_bytes(
        data[FEED_ANSWER_OFFSET..FEED_ANSWER_OFFSET + 16]
            .try_into()
            .map_err(|_| error!(ErrorCode::InvalidOracleFeed))?,
    );

    require!(answer > 0, ErrorCode::InvalidOraclePrice);

    Ok(ChainlinkRound { answer, decimals })
}
