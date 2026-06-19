"use client";

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeAccount3Instruction,
  getSyncNativeInstruction,
  getTransferInstruction,
} from "@solana-program/token";
import { getCreateAccountInstruction } from "@solana-program/system";
import { getTransferSolInstruction } from "@solana-program/system";
import { generateKeyPairSigner } from "@solana/signers";
import { Connection, PublicKey, SystemProgram, type Commitment } from "@solana/web3.js";
import { createWalletTransactionSigner } from "@solana/client";
import type { KitInstruction } from "@/lib/solana/kit-types";

type WalletKitSigner = ReturnType<typeof createWalletTransactionSigner>["signer"];
type CreateAtaInput = Parameters<typeof getCreateAssociatedTokenIdempotentInstruction>[0];
type CreateAtaPayer = CreateAtaInput["payer"];
type TransferSolSource = Parameters<typeof getTransferSolInstruction>[0]["source"];
type TransferSolInput = Parameters<typeof getTransferSolInstruction>[0];
type TransferAuthority = Parameters<typeof getTransferInstruction>[0]["authority"];
type TransferInput = Parameters<typeof getTransferInstruction>[0];
type CloseAccountOwner = Parameters<typeof getCloseAccountInstruction>[0]["owner"];
type CloseAccountInput = Parameters<typeof getCloseAccountInstruction>[0];
type CreateAccountInput = Parameters<typeof getCreateAccountInstruction>[0];
type InitializeAccount3Input = Parameters<typeof getInitializeAccount3Instruction>[0];
type SyncNativeInput = Parameters<typeof getSyncNativeInstruction>[0];

function asCreateAtaPayer(signer: WalletKitSigner): CreateAtaPayer {
  return signer as CreateAtaPayer;
}

function asTransferSolSource(signer: WalletKitSigner): TransferSolSource {
  return signer as TransferSolSource;
}

function asTransferAuthority(signer: WalletKitSigner): TransferAuthority {
  return signer as TransferAuthority;
}

function asCloseAccountOwner(signer: WalletKitSigner): CloseAccountOwner {
  return signer as CloseAccountOwner;
}

export type { WalletKitSigner };

const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
export const TOKEN_ACCOUNT_SIZE = 165;

export function isWrappedSolMint(mint: PublicKey | string) {
  const address = typeof mint === "string" ? mint : mint.toBase58();
  return address === WRAPPED_SOL_MINT;
}

export function getWsolMint() {
  return new PublicKey(WRAPPED_SOL_MINT);
}

export function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey = getWsolMint()) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function isAccountNotFoundError(error: unknown) {
  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return message.includes("could not find account") || message.includes("account does not exist");
}

export type WsolBalanceSnapshot = {
  wsolRaw: bigint;
  nativeSolRaw: bigint;
  combinedRaw: bigint;
  ataExists: boolean;
  ata: PublicKey;
};

export async function fetchWsolBalanceSnapshot(
  connection: Connection,
  owner: PublicKey,
  commitment: Commitment = "confirmed"
): Promise<WsolBalanceSnapshot> {
  const mint = getWsolMint();
  const ata = getAssociatedTokenAddress(owner, mint);
  const nativeSolRaw = BigInt(await connection.getBalance(owner, commitment));

  let wsolRaw = BigInt(0);
  let ataExists = false;

  try {
    const balance = await connection.getTokenAccountBalance(ata, commitment);
    wsolRaw = BigInt(balance.value.amount);
    ataExists = true;
  } catch (error) {
    if (!isAccountNotFoundError(error)) {
      throw error;
    }
  }

  return {
    wsolRaw,
    nativeSolRaw,
    combinedRaw: wsolRaw + nativeSolRaw,
    ataExists,
    ata,
  };
}

export function formatTokenAmountFromBaseUnits(amount: anchor.BN | string | bigint, decimals: number) {
  const raw = String(amount);
  if (decimals <= 0) return raw;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const padded = unsigned.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${fraction ? `${whole}.${fraction}` : whole}`;
}

export type StreamVestingSnapshot = {
  totalAmount: anchor.BN | bigint | number | string;
  vestingType: number;
  startTs: anchor.BN | bigint | number | string;
  cliffTs: anchor.BN | bigint | number | string;
  endTs: anchor.BN | bigint | number | string;
  unlockedMilestoneAmount?: anchor.BN | bigint | number | string;
};

export async function buildWsolWrapInstructions({
  connection,
  owner,
  walletSigner,
  amountBn,
  commitment = "confirmed",
}: {
  connection: Connection;
  owner: PublicKey;
  walletSigner: WalletKitSigner;
  amountBn: anchor.BN;
  commitment?: Commitment;
}): Promise<KitInstruction[]> {
  const mint = getWsolMint();
  const creatorTokenAccount = getAssociatedTokenAddress(owner, mint);
  const snapshot = await fetchWsolBalanceSnapshot(connection, owner, commitment);
  const existingAmount = new anchor.BN(snapshot.wsolRaw.toString());
  const topUpAmount = amountBn.sub(existingAmount);

  if (topUpAmount.lte(new anchor.BN(0))) {
    return [];
  }

  const rentLamports = snapshot.ataExists
    ? 0
    : await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, commitment);
  const requiredLamports = topUpAmount.add(new anchor.BN(String(rentLamports)));

  if (new anchor.BN(snapshot.nativeSolRaw.toString()).lt(requiredLamports)) {
    throw new Error(
      `Insufficient SOL balance to wrap ${formatTokenAmountFromBaseUnits(topUpAmount, 9)} WSOL${snapshot.ataExists ? "" : " and create the token account"}. Available ${formatTokenAmountFromBaseUnits(snapshot.combinedRaw.toString(), 9)} SOL (WSOL + native), need at least ${formatTokenAmountFromBaseUnits(requiredLamports, 9)} SOL.`
    );
  }

  return [
    await getCreateAssociatedTokenIdempotentInstruction({
      payer: asCreateAtaPayer(walletSigner),
      ata: creatorTokenAccount.toBase58(),
      owner: owner.toBase58(),
      mint: mint.toBase58(),
      systemProgram: SystemProgram.programId.toBase58(),
      tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    } as CreateAtaInput),
    getTransferSolInstruction({
      source: asTransferSolSource(walletSigner),
      destination: creatorTokenAccount.toBase58(),
      amount: BigInt(topUpAmount.toString()),
    } as TransferSolInput),
    getSyncNativeInstruction({
      account: creatorTokenAccount.toBase58(),
    } as SyncNativeInput),
  ];
}

export async function buildWsolUnwrapInstructions({
  connection,
  owner,
  walletSigner,
  amountBn,
  sourceAta,
  commitment = "confirmed",
}: {
  connection: Connection;
  owner: PublicKey;
  walletSigner: WalletKitSigner;
  amountBn: anchor.BN;
  sourceAta?: PublicKey;
  commitment?: Commitment;
}): Promise<KitInstruction[]> {
  if (amountBn.lte(new anchor.BN(0))) {
    return [];
  }

  const mint = getWsolMint();
  const wsolAta = sourceAta ?? getAssociatedTokenAddress(owner, mint);
  const tempSigner = await generateKeyPairSigner();
  const rentLamports = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, commitment);

  return [
    getCreateAccountInstruction({
      payer: asCreateAtaPayer(walletSigner),
      newAccount: tempSigner,
      lamports: BigInt(rentLamports),
      space: BigInt(TOKEN_ACCOUNT_SIZE),
      programAddress: TOKEN_PROGRAM_ID.toBase58(),
    } as unknown as CreateAccountInput),
    getInitializeAccount3Instruction({
      account: tempSigner.address,
      mint: mint.toBase58(),
      owner: owner.toBase58(),
    } as InitializeAccount3Input),
    getTransferInstruction({
      source: wsolAta.toBase58(),
      destination: tempSigner.address,
      authority: asTransferAuthority(walletSigner),
      amount: BigInt(amountBn.toString()),
    } as TransferInput),
    getCloseAccountInstruction({
      account: tempSigner.address,
      destination: owner.toBase58(),
      owner: asCloseAccountOwner(walletSigner),
    } as CloseAccountInput),
  ];
}

export function calculateVestedAmount(stream: StreamVestingSnapshot, nowTs: number) {
  const totalAmount = new anchor.BN(String(stream.totalAmount));
  const vestingType = Number(stream.vestingType);

  if (vestingType === 2) {
    return new anchor.BN(String(stream.unlockedMilestoneAmount || 0));
  }

  const startTs = Number(stream.startTs);
  const cliffTs = Number(stream.cliffTs);
  const endTs = Number(stream.endTs);

  if (nowTs < startTs) {
    return new anchor.BN(0);
  }

  if (vestingType === 1 && nowTs < cliffTs) {
    return new anchor.BN(0);
  }

  if (nowTs >= endTs) {
    return totalAmount;
  }

  const duration = Math.max(endTs - startTs, 1);
  const elapsed = Math.min(Math.max(nowTs - startTs, 0), duration);
  return totalAmount.mul(new anchor.BN(elapsed)).div(new anchor.BN(duration));
}

export function calculateCancelRefundToCreator(stream: StreamVestingSnapshot, nowTs: number) {
  const totalAmount = new anchor.BN(String(stream.totalAmount));
  const vested = calculateVestedAmount(stream, nowTs);
  const refund = totalAmount.sub(vested);
  return refund.isNeg() ? new anchor.BN(0) : refund;
}
