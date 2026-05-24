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

// ─── Anchor / program custom error codes ──────────────────────────────────
// These map to the program's error codes in lib.rs
const ANCHOR_ERROR_MAP: Record<number, { title: string; detail: string }> = {
  6000: { title: "Stream Already Cancelled", detail: "This stream has already been cancelled and cannot be cancelled again." },
  6001: { title: "Stream Already Completed", detail: "This stream has already completed and cannot be modified." },
  6002: { title: "Not the Stream Creator", detail: "Your connected wallet is not the creator of this stream. Connect the correct wallet." },
  6003: { title: "Not the Stream Recipient", detail: "Your connected wallet is not the recipient of this stream. Connect the correct wallet." },
  6004: { title: "Stream Not Cancellable", detail: "This stream was created as non-cancellable and cannot be cancelled." },
  6005: { title: "No Tokens Claimable Yet", detail: "No tokens are unlocked yet. Wait for the vesting schedule to progress before claiming." },
  6006: { title: "Withdraw Amount Too Large", detail: "The amount you requested exceeds what is currently claimable." },
  6007: { title: "All Milestones Unlocked", detail: "All milestones for this stream have already been unlocked." },
  6008: { title: "Not a Milestone Stream", detail: "Milestone unlock is only available for milestone-based vesting streams." },
  6009: { title: "Invalid Vesting Type", detail: "An unsupported vesting type was specified. Use Linear (0), Cliff (1), or Milestone (2)." },
  6010: { title: "Invalid Duration", detail: "The stream duration must be a positive number of seconds." },
  6011: { title: "Invalid Cliff Duration", detail: "The cliff duration must be a positive number of seconds and not exceed stream duration." },
  6012: { title: "Milestone Sum Mismatch", detail: "The sum of all milestone amounts must exactly equal the total stream amount." },
  6013: { title: "Invalid Milestone Count", detail: "The number of milestones must match the provided milestone allocations." },
  6014: { title: "Unauthorized", detail: "You are not authorized to perform this action on this stream." },
  6015: { title: "Arithmetic Overflow", detail: "A numeric overflow occurred. Check your amounts and try again." },
  6024: { title: "Stream Fully Vested", detail: "This stream is already fully vested/ended and can no longer be cancelled." },
};

const ANCHOR_ERROR_NAME_MAP: Record<string, { title: string; detail: string }> = {
  FullyVested: { title: "Stream Fully Vested", detail: "This stream is already fully vested/ended and can no longer be cancelled." },
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

export function parseTransactionError(err: unknown): ParsedTxError {
  const raw = err instanceof Error ? err.message : String(err ?? "Unknown error");
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
