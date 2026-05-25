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
  6007: { title: "Invalid Recipient", detail: "The recipient address is invalid." },
  6008: { title: "Invalid Mint", detail: "The token mint is invalid for this stream." },
  6009: { title: "Invalid Token Owner", detail: "The token account owner does not match the expected wallet." },
  6010: { title: "Insufficient Balance", detail: "Creator token balance is not enough for this operation." },
  6011: { title: "Mint Not Allowed", detail: "This token mint is not allowed by the protocol." },
  6012: { title: "Protocol Paused", detail: "The protocol is currently paused. Try again later." },
  6013: { title: "Amount Too Small", detail: "Amount is below the minimum allowed by the protocol." },
  6014: { title: "Invalid Mint Decimals", detail: "Token mint decimals are not supported." },
  6015: { title: "Token Type Unsupported", detail: "Tokens with transfer fees are not supported." },
  6024: { title: "Already Cancelled", detail: "This stream has already been cancelled." },
};

const ANCHOR_ERROR_NAME_MAP: Record<string, { title: string; detail: string }> = {
  FullyVested: { title: "Stream Fully Vested", detail: "This stream is already fully vested/ended and can no longer be cancelled." },
  InvalidAmount: { title: "Invalid Amount", detail: "Amount must be greater than zero or valid for this edit operation." },
  InvalidEndDate: { title: "Invalid End Date", detail: "End date must be in the future and extend the stream." },
  StreamExpired: { title: "Stream Expired", detail: "This stream has expired and can no longer be edited." },
  InsufficientBalance: { title: "Insufficient Balance", detail: "Creator token balance is not enough for the requested top-up." },
  InvalidVestingType: { title: "Invalid Vesting Type", detail: "This edit action is not valid for the stream vesting type." },
  StreamNotActive: { title: "Stream Not Active", detail: "This stream is no longer active, so it cannot be edited." },
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
  ].filter(Boolean);

  if (chunks.length === 0) {
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
