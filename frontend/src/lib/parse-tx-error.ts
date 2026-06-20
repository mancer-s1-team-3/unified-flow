/**
 * parse-tx-error.ts
 * Converts raw Solana / wallet / anchor errors into clean, human-readable messages.
 * Used by dashboard-home-client.tsx before calling showNotification("error", …).
 */

export type ParsedTxError = {
  title: string;
  detail: string;
  raw?: string;
};

type ErrorLike = {
  message?: unknown;
  response?: {
    data?: unknown;
  };
  data?: unknown;
  cause?: unknown;
  logs?: unknown;
  error?: unknown;   // ← wallet-adapter sering nest error asli di sini
  name?: unknown;
  code?: unknown;
  reason?: unknown;
};

// ─── Anchor / program custom error codes ──────────────────────────────────
// These map to the program's error codes in lib.rs
const ANCHOR_ERROR_MAP: Record<number, { title: string; detail: string }> = {
  6000: { title: "Invalid Amount", detail: "Amount must be greater than zero." },
  6001: { title: "Invalid Schedule", detail: "End date must be after start date." },
  6002: { title: "Invalid Cliff", detail: "Cliff date must be between start and end dates." },
  6003: { title: "Invalid End Date", detail: "End date must be in the future." },
  6004: { title: "Invalid Start Date", detail: "Start date must not be in the past." },
  6005: { title: "Duration Too Short", detail: "Stream duration is too short. Increase the duration and try again." },
  6006: { title: "Arithmetic Overflow", detail: "A numeric overflow occurred. Check your amounts and try again." },
  6007: { title: "Invalid Recipient", detail: "Recipient is invalid — it cannot be the same as the creator wallet." },
  6008: { title: "Invalid Mint", detail: "The token mint does not match your token account for this stream." },
  6009: { title: "Invalid Token Owner", detail: "The token account owner does not match the expected wallet." },
  6010: { title: "Insufficient Token Balance", detail: "Your token balance for this mint is not enough to fund the stream amount. Top up the token and try again." },
  6011: { title: "Mint Not Allowed", detail: "This token mint is not on the protocol's allowed list. Pick an allowed token." },
  6012: { title: "Protocol Paused", detail: "The protocol is currently paused. Please try again later." },
  6013: { title: "Amount Too Small", detail: "Amount is below the minimum allowed by the protocol." },
  6014: { title: "Invalid Mint Decimals", detail: "This token mint's decimals are not supported." },
  6015: { title: "Token Type Unsupported", detail: "Tokens with transfer fees are not supported." },
  6016: { title: "Stream Not Active", detail: "This stream is no longer active." },
  6017: { title: "Stream Not Cancelable", detail: "This stream cannot be cancelled." },
  6018: { title: "Nothing to Withdraw", detail: "No tokens are currently available to withdraw." },
  6019: { title: "Unauthorized", detail: "Only the stream recipient can perform this action." },
  6020: { title: "Invalid Oracle Feed", detail: "The oracle price feed is invalid." },
  6021: { title: "Stale Oracle Price", detail: "The oracle price is stale (older than 1 hour). Try again shortly." },
  6022: { title: "Invalid Oracle Price", detail: "The oracle returned an invalid price." },
  6023: { title: "Invalid Fee Receiver", detail: "The fee receiver account is invalid." },
  6024: { title: "Already Cancelled", detail: "This stream has already been cancelled." },
  6025: { title: "Stream Fully Vested", detail: "This stream is already fully vested/ended and can no longer be cancelled." },
  6026: { title: "Stream Expired", detail: "This stream has expired and can no longer be edited." },
  6027: { title: "Milestone Already Unlocked", detail: "This milestone has already been unlocked." },
  6028: { title: "Invalid Vesting Type", detail: "This action is not valid for the stream's vesting type." },
  6029: { title: "Invalid Milestone Count", detail: "The number of milestones is invalid for this stream." },
  6030: { title: "Invalid Milestone PDA", detail: "A milestone account address is invalid." },
  6031: { title: "Invalid Milestone Amount", detail: "Milestone amounts must add up exactly to the total stream amount." },
  6032: { title: "Previous Milestone Not Approved", detail: "The previous milestone must be approved first." },
  6033: { title: "Invalid Milestone Order", detail: "Milestones must be unlocked in order." },
  6034: { title: "Previous Milestone Missing", detail: "A previous milestone account is missing." },
  6035: { title: "Stream Already Started", detail: "This stream has already started and can no longer be modified." },
};

const ANCHOR_ERROR_NAME_MAP: Record<string, { title: string; detail: string }> = {
  InvalidAmount: ANCHOR_ERROR_MAP[6000],
  InvalidSchedule: ANCHOR_ERROR_MAP[6001],
  InvalidCliff: ANCHOR_ERROR_MAP[6002],
  InvalidEndDate: ANCHOR_ERROR_MAP[6003],
  InvalidStartDate: ANCHOR_ERROR_MAP[6004],
  DurationTooShort: ANCHOR_ERROR_MAP[6005],
  MathOverflow: ANCHOR_ERROR_MAP[6006],
  InvalidRecipient: ANCHOR_ERROR_MAP[6007],
  InvalidMint: ANCHOR_ERROR_MAP[6008],
  InvalidTokenOwner: ANCHOR_ERROR_MAP[6009],
  InsufficientBalance: ANCHOR_ERROR_MAP[6010],
  MintNotAllowed: ANCHOR_ERROR_MAP[6011],
  ProtocolPaused: ANCHOR_ERROR_MAP[6012],
  AmountTooSmall: ANCHOR_ERROR_MAP[6013],
  InvalidMintDecimals: ANCHOR_ERROR_MAP[6014],
  TransferFeeMintUnsupported: ANCHOR_ERROR_MAP[6015],
  StreamNotActive: ANCHOR_ERROR_MAP[6016],
  StreamNotCancelable: ANCHOR_ERROR_MAP[6017],
  NothingToWithdraw: ANCHOR_ERROR_MAP[6018],
  Unauthorized: ANCHOR_ERROR_MAP[6019],
  AlreadyCancelled: ANCHOR_ERROR_MAP[6024],
  FullyVested: ANCHOR_ERROR_MAP[6025],
  StreamExpired: ANCHOR_ERROR_MAP[6026],
  MilestoneAlreadyUnlocked: ANCHOR_ERROR_MAP[6027],
  InvalidVestingType: ANCHOR_ERROR_MAP[6028],
  InvalidMilestoneCount: ANCHOR_ERROR_MAP[6029],
  InvalidMilestoneAmount: ANCHOR_ERROR_MAP[6031],
  StreamAlreadyStarted: ANCHOR_ERROR_MAP[6035],
};

// ─── Known raw message fragments → friendly messages ─────────────────────
const FRAGMENT_MAP: { pattern: RegExp; title: string; detail: string }[] = [
  // Insufficient balance (pre-flight checks from our own code)
  {
    pattern: /insufficient token balance/i,
    title: "Insufficient Token Balance",
    detail: (m: string) => extractDetail(m, /insufficient token balance[^.]*\./i),
  } as any,
  {
    pattern: /insufficient sol balance/i,
    title: "Insufficient SOL Balance",
    detail: (m: string) => extractDetail(m, /insufficient sol balance[^.]*\./i),
  } as any,
  {
    pattern: /insufficient lamports/i,
    title: "Insufficient SOL Balance",
    detail: "Your wallet doesn't have enough SOL to cover the transaction fee and rent. Top up your wallet and try again.",
  },
  {
    pattern: /insufficient funds/i,
    title: "Insufficient SOL Balance",
    detail: "Your wallet doesn't have enough SOL for this transaction. Top up your wallet and try again.",
  },
  {
    pattern: /insufficientfundsforrent|insufficient funds for rent/i,
    title: "Insufficient SOL for Rent",
    detail: "You don't have enough SOL to pay the rent for the new stream and vault accounts. Top up SOL (e.g. from the Devnet faucet) and try again.",
  },
  {
    pattern: /insufficientfundsforfee|insufficient funds for fee|prior credit/i,
    title: "Insufficient SOL for Fees",
    detail: "Your wallet doesn't have enough SOL to cover the network fee. Top up SOL and try again.",
  },
  {
    pattern: /accountnotinitialized|account not initialized|could not find account.*token|uninitialized account/i,
    title: "Token Account Missing",
    detail: "Your token account for this mint doesn't exist yet or is empty. Receive/hold the token first, then create the stream.",
  },

  // Wallet / signing errors
  {
    pattern: /user rejected|wallet_requestPermissions|user denied/i,
    title: "Transaction Rejected",
    detail: "You rejected the transaction in your wallet. Approve the transaction to continue.",
  },
  {
    pattern: /wallet not connected|connect.*wallet/i,
    title: "Wallet Not Connected",
    detail: "Please connect your Solana wallet before performing this action.",
  },

  // Network / RPC
  {
    pattern: /blockhash not found|block height exceeded/i,
    title: "Transaction Expired",
    detail: "The transaction took too long and expired. Please try again — this usually resolves itself.",
  },
  {
    pattern: /429|too many requests|rate limit/i,
    title: "RPC Rate Limited",
    detail: "The RPC node is rate-limiting requests. Wait a few seconds and try again.",
  },
  {
    pattern: /failed to fetch|network request failed|econnrefused|enotfound/i,
    title: "Network Error",
    detail: "Could not reach the Solana RPC node. Check your internet connection and try again.",
  },
  {
    pattern: /transaction simulation failed/i,
    title: "Simulation Failed",
    detail: "The transaction was rejected during simulation. Check your inputs and wallet balance.",
  },
  {
    pattern: /simulation failed|simulation error/i,
    title: "Transaction Simulation Failed",
    detail: "The transaction failed during pre-flight simulation. Review the details and try again.",
  },

  // Already cancelled / already withdrawn
  {
    pattern: /already been cancelled/i,
    title: "Already Cancelled",
    detail: "This stream has already been cancelled.",
  },
  {
    pattern: /fully vested/i,
    title: "Stream Fully Vested",
    detail: "This stream is already fully vested/ended and can no longer be cancelled.",
  },
  {
    pattern: /no claimable tokens|not claimable/i,
    title: "Nothing to Claim",
    detail: "No tokens are currently unlocked for this stream. Check back later.",
  },

  // Account errors
  {
    pattern: /invalid.*address|invalid.*public key/i,
    title: "Invalid Address",
    detail: "The stream or wallet address entered is not a valid Solana public key.",
  },
  {
    pattern: /account not found|could not find account/i,
    title: "Account Not Found",
    detail: "The stream account could not be found on-chain. Verify the stream ID is correct.",
  },
];

function extractDetail(message: string, pattern: RegExp): string {
  const match = message.match(pattern);
  return match ? match[0] : message.slice(0, 200);
}

function parseAnchorErrorCode(message: string): { title: string; detail: string } | null {
  // Anchor errors can appear as:
  // - "Error Code: FullyVested. Error Number: 6024."
  // - "custom program error: 0x1788"
  const nameMatch = message.match(/error code:\s*([A-Za-z_][A-Za-z0-9_]*)/i);
  if (nameMatch && ANCHOR_ERROR_NAME_MAP[nameMatch[1]]) {
    return ANCHOR_ERROR_NAME_MAP[nameMatch[1]];
  }

  const numberMatch = message.match(/error number[:\s]+(\d{4})/i);
  if (numberMatch) {
    const code = parseInt(numberMatch[1], 10);
    if (ANCHOR_ERROR_MAP[code]) return ANCHOR_ERROR_MAP[code];
  }

  const customProgramHexMatch = message.match(/custom program error:\s*0x([0-9a-f]+)/i);
  if (customProgramHexMatch) {
    const code = parseInt(customProgramHexMatch[1], 16);
    if (ANCHOR_ERROR_MAP[code]) return ANCHOR_ERROR_MAP[code];
  }

  const customDecimalMatch = message.match(/"?Custom"?\s*:\s*(\d{4,5})/i);
  if (customDecimalMatch) {
    const code = parseInt(customDecimalMatch[1], 10);
    if (ANCHOR_ERROR_MAP[code]) return ANCHOR_ERROR_MAP[code];
  }

  // Also check hex in logs: 0x1770 = 6000, 0x1771 = 6001 ...
  const hexMatch = message.match(/0x([0-9a-f]{3,4})\b/i);
  if (hexMatch) {
    const code = parseInt(hexMatch[1], 16);
    if (ANCHOR_ERROR_MAP[code]) return ANCHOR_ERROR_MAP[code];
  }

  return null;
}

function flattenUnknown(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return [String(value)];

  // Native Error instances (and subclasses like WalletSignTransactionError)
  // don't expose `message`/`name` as enumerable own properties, so
  // Object.values() below would silently return []. Handle explicitly.
  if (value instanceof Error) {
    const parts: string[] = [];
    if (value.message) parts.push(value.message);
    if (value.name && value.name !== "Error") parts.push(value.name);
    // Some wallet adapters attach extra context on a non-standard `.error` /
    // `.cause` field even on Error subclasses.
    const anyErr = value as any;
    if (anyErr.cause) parts.push(...flattenUnknown(anyErr.cause));
    if (anyErr.error) parts.push(...flattenUnknown(anyErr.error));
    if (anyErr.code != null) parts.push(String(anyErr.code));
    return parts.length > 0 ? parts : [value.toString()];
  }

  if (Array.isArray(value)) return value.flatMap((item) => flattenUnknown(item));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => flattenUnknown(item));
  }
  return [];
}

function buildRawErrorText(err: unknown): string {
  const errorLike = (err ?? {}) as ErrorLike;
  const chunks = [
    ...flattenUnknown(errorLike.message),
    ...flattenUnknown(errorLike.response?.data),
    ...flattenUnknown(errorLike.data),
    ...flattenUnknown(errorLike.logs),
    ...flattenUnknown(errorLike.cause),
    ...flattenUnknown(errorLike.error),   // ← tambah
    ...flattenUnknown(errorLike.name),    // ← tambah
    ...flattenUnknown(errorLike.code),    // ← tambah
    ...flattenUnknown(errorLike.reason),  // ← tambah
  ].filter(Boolean);

  if (chunks.length === 0) {
    // Last-resort fallback — never let this surface as "[object Object]".
    if (err instanceof Error) return err.toString();
    if (typeof err === "object" && err !== null) {
      try {
        const json = JSON.stringify(err);
        return json && json !== "{}" ? json : "Unknown error (empty error object)";
      } catch {
        return "Unknown error";
      }
    }
    return String(err ?? "Unknown error");
  }

  return chunks.join(" | ");
}

export function parseTransactionError(err: unknown): ParsedTxError {
  const raw = buildRawErrorText(err);
  const lower = raw.toLowerCase();

  // 1. Check anchor program custom error codes first (most specific)
  const anchorError = parseAnchorErrorCode(raw);
  if (anchorError) {
    return { ...anchorError, raw };
  }

  // 2. Check fragment patterns
  for (const { pattern, title, detail } of FRAGMENT_MAP) {
    if (pattern.test(raw) || pattern.test(lower)) {
      const resolvedDetail = typeof detail === "function" ? (detail as Function)(raw) : detail;
      return { title, detail: resolvedDetail, raw };
    }
  }

  // 3. Fallback — clean up the raw message for display
  const cleaned = raw
    ?.replace(/^Error:\s*/i, "")
    ?.split("\n")[0]
    ?.trim()
    ?.slice(0, 300);

  return {
    title: "Transaction Failed",
    detail: cleaned || "An unexpected error occurred. Please try again.",
    raw,
  };
}
