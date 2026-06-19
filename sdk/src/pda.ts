import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

export const UNIFIED_FLOW_PROGRAM_ID = new PublicKey(
  "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

export function getConfigPDA(programId: PublicKey = UNIFIED_FLOW_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function getFeeVaultPDA(programId: PublicKey = UNIFIED_FLOW_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], programId);
}

export function getStreamPDA(
  creator: PublicKey,
  recipient: PublicKey,
  nonce: BN,
  programId: PublicKey = UNIFIED_FLOW_PROGRAM_ID
): [PublicKey, number] {
  // Use BN.toArrayLike rather than Buffer.writeBigUInt64LE: the latter is absent
  // from some browser Buffer polyfills (throws "writeBigUInt64LE is not a
  // function"). toArrayLike(...,"le",8) yields the same 8-byte LE buffer and
  // matches the dashboard/MCP/CLI derivations.
  const nonceBuffer = nonce.toArrayLike(Buffer, "le", 8);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("stream"),
      creator.toBuffer(),
      recipient.toBuffer(),
      nonceBuffer,
    ],
    programId
  );
}

export function getMilestonePDA(
  stream: PublicKey,
  index: number,
  programId: PublicKey = UNIFIED_FLOW_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), stream.toBuffer(), Buffer.from([index])],
    programId
  );
}

export function getVaultATA(
  mint: PublicKey,
  stream: PublicKey
): PublicKey {
  return getAssociatedTokenAddressSync(mint, stream, true);
}
