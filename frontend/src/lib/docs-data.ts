export const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/streams",
    desc: "Fetch all indexed token vesting and distribution streams, ordered by creation date descending.",
    response: `[
  {
    "id": "cm0a1b2c3d4e5f6g7h8i9j0k",
    "creator": "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
    "recipient": "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "vault": "ATA5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
    "totalAmount": "100000000",
    "withdrawn": "25000000",
    "startTs": "1789045600",
    "cliffTs": "1789045600",
    "endTs": "1791637600",
    "vestingType": 0,
    "status": 1,
    "createdAt": "2026-05-17T05:10:00.000Z"
  }
]`
  },
  {
    method: "GET",
    path: "/streams/:id",
    desc: "Retrieve exhaustive details of a single indexed stream using its indexed record identifier.",
    response: `{
  "id": "cm0a1b2c3d4e5f6g7h8i9j0k",
  "creator": "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
  "recipient": "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "vault": "ATA5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
  "totalAmount": "100000000",
  "withdrawn": "25000000",
  "startTs": "1789045600",
  "cliffTs": "1789045600",
  "endTs": "1791637601",
  "vestingType": 0,
  "status": 1,
  "createdAt": "2026-05-17T05:10:00.000Z"
}`
  }
];

export const MCP_TOOLS = [
  {
    name: "get_streams",
    category: "Indexed API",
    desc: "Query the backend API for indexed streams. Supports filtering by creator, recipient, status, vesting type, and limit.",
    params: [
      { name: "creator", type: "string (optional)", desc: "Filter by creator public key" },
      { name: "recipient", type: "string (optional)", desc: "Filter by recipient public key" },
      { name: "status", type: "number (optional)", desc: "1 = Active, 2 = Completed, 3 = Cancelled" },
      { name: "vestingType", type: "number (optional)", desc: "0 = Linear, 1 = Cliff, 2 = Milestone" },
      { name: "limit", type: "number (optional)", desc: "Maximum number of streams to return" }
    ]
  },
  {
    name: "get_stream_details",
    category: "On-Chain",
    desc: "Retrieve real-time on-chain state directly from Solana, resolving all child sequential milestone accounts.",
    params: [
      { name: "streamAddress", type: "string (required)", desc: "The public key of the StreamAccount PDA" }
    ]
  },
  {
    name: "create_stream",
    category: "Transaction",
    desc: "Build, sign and dispatch a new stream on Solana. Handles ATA creation, milestone PDAs derivation & fee setups.",
    params: [
      { name: "recipient", type: "string (required)", desc: "Recipient address" },
      { name: "mint", type: "string (required)", desc: "SPL Token Mint" },
      { name: "amount", type: "string (required)", desc: "Raw amount in base units" },
      { name: "vestingType", type: "number (required)", desc: "0 = Linear, 1 = Cliff, 2 = Milestone" },
      { name: "milestones", type: "array (optional)", desc: "Amounts for Milestone vesting" }
    ]
  },
  {
    name: "withdraw_from_stream",
    category: "Transaction",
    desc: "Withdraw claimable tokens. Dynamically calculates SOL fee via Chainlink price feeds.",
    params: [
      { name: "streamAddress", type: "string (required)", desc: "Stream PDA address" }
    ]
  }
];

export const CLI_READ_COMMANDS = [
  {
    cmd: "unifiedflow view <streamAddress>",
    desc: "Fetch & print real-time on-chain stream & milestone details with ANSI colored tree display.",
    example: "unifiedflow view 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow config",
    desc: "Print global protocol config — fees, admin authority, paused state, and allowed mints."
  },
  {
    cmd: "unifiedflow version",
    desc: "Print CLI version, connected program ID, and active RPC endpoint.",
    example: "unifiedflow version"
  }
];

export const CLI_WRITE_COMMANDS = [
  {
    cmd: "unifiedflow init",
    desc: "Initialize the global protocol config PDA state. Run once by the admin before any streams can be created."
  },
  {
    cmd: "unifiedflow create <recipient> <mint> <amount> 0 <durationSecs>",
    desc: "Create a Linear vesting stream (type 0). Tokens unlock continuously second-by-second over the given duration.",
    example: "unifiedflow create <recipient> <mint> 1000000000 0 31536000"
  },
  {
    cmd: "unifiedflow create <recipient> <mint> <amount> 1 <durationSecs>",
    desc: "Create a Cliff vesting stream (type 1). Tokens are fully locked until the cliff timestamp, then released at once.",
    example: "unifiedflow create <recipient> <mint> 1000000000 1 15552000"
  },
  {
    cmd: "unifiedflow create <recipient> <mint> <amount> 2 <milestone1,milestone2,...>",
    desc: "Create a Milestone vesting stream (type 2). Pass comma-separated amounts — they must sum exactly to the total amount.",
    example: "unifiedflow create <recipient> <mint> 1000000000 2 250000000,250000000,250000000,250000000"
  },
  {
    cmd: "unifiedflow create-batch <csvPath>",
    desc: "Create multiple streams in one command from a CSV file. Supports all three vesting types. CSV columns: recipient, mint, amount, type, duration, cliffDuration, milestones (semicolon-separated for type 2).",
    example: "unifiedflow create-batch ./streams.csv"
  },
  {
    cmd: "unifiedflow withdraw <streamAddress>",
    desc: "Withdraw claimable vested tokens as the stream recipient. SOL fee is calculated dynamically via Chainlink oracle.",
    example: "unifiedflow withdraw 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow cancel <streamAddress>",
    desc: "Cancel an active stream as the creator. Unvested tokens are returned to the creator's wallet.",
    example: "unifiedflow cancel 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow unlock <streamAddress>",
    desc: "Unlock the next sequential milestone in a Milestone stream. Must be called in order — index i before i+1.",
    example: "unifiedflow unlock 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow edit-milestone <streamAddress> <milestoneIndex> <newAmount>",
    desc: "Modify a locked milestone allocation. The contract auto-adjusts vault token balance to match the updated total.",
    example: "unifiedflow edit-milestone 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 2 300000000"
  },
  {
    cmd: "unifiedflow edit-linear <streamAddress> <newDurationSecs> [topupAmount]",
    desc: "Extend a linear stream's end time and/or top up its total allocation. newDurationSecs is measured from the original startTs. topupAmount is optional — omit if only extending duration.",
    example: "unifiedflow edit-linear 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 63072000 500000000"
  },
  {
    cmd: "unifiedflow edit-cliff <streamAddress> <newCliffDurationSecs>",
    desc: "Edit the cliff of an existing stream. Accepts duration in seconds from the stream's original startTs — the contract derives the absolute cliff timestamp internally.",
    example: "unifiedflow edit-cliff 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 7776000"
  },
  {
    cmd: "unifiedflow edit-batch <csvPath>",
    desc: "Bulk edit multiple streams from a CSV file. Routes each row to the correct edit instruction based on vesting type. CSV columns: id (stream address), duration, amount (linear), cliffDuration (cliff), milestones (milestone, semicolon-separated).",
    example: "unifiedflow edit-batch ./edits.csv"
  },
];

export const SDK_METHODS = [
  {
    name: "createStream",
    desc: "Create a new vesting stream.",
    example: `await client.createStream(
  recipient,
  mint,
  amount,
  startTs,
  cliffTs,
  endTs,
  0,
  [],
  nonce
);`,
  },
  {
    name: "withdraw",
    desc: "Withdraw vested tokens.",
    example: `await client.withdraw(streamPDA);`,
  },
  {
    name: "cancel",
    desc: "Cancel active stream.",
    example: `await client.cancel(streamPDA);`,
  },
  {
    name: "unlockMilestone",
    desc: "Unlock milestone.",
    example: `await client.unlockMilestone(streamPDA, 0);`,
  },
  {
    name: "editMilestone",
    desc: "Update milestone allocation.",
    example: `await client.editMilestone(
  streamPDA,
  mint,
  milestoneIndex,
  newAmount
);`,
  },
  {
    name: "editCliff",
    desc: "Update cliff timestamp.",
    example: `await client.editCliff(
  streamPDA,
  newCliffTs
);`,
  },
  {
    name: "editLinear",
    desc: "Extend stream and/or topup.",
    example: `await client.editLinear(
  streamPDA,
  mint,
  newEndTs,
  topupAmount
);`,
  },
];
