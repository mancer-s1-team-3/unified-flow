"use client";

import * as anchor from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import { createWalletTransactionSigner, transactionToBase64 } from "@solana/client";
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { type Commitment, Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { WalletSession } from "@solana/client";
import { getExplorerClusterParam } from "@/lib/solana/network-config";
import { buildWsolUnwrapInstructions, fetchWsolBalanceSnapshot, getAssociatedTokenAddress } from "@/lib/solana/wsol";

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

export async function fetchWsolBalanceRaw({
  endpoint,
  owner,
  commitment = "confirmed",
}: {
  endpoint: string;
  owner: string;
  commitment?: Commitment;
}): Promise<bigint> {
  const connection = new Connection(endpoint, commitment);
  const wsolAta = getAssociatedTokenAddress(new PublicKey(owner));
  const balance = await connection.getTokenAccountBalance(wsolAta, commitment);
  return BigInt(balance.value.amount);
}

export type UnwrapWsolResult = Readonly<{
  signature: string;
  explorerUrl: string;
  unwrappedRaw: string;
}>;

export async function unwrapWsolOnChain({
  wallet,
  endpoint,
  amountBaseUnits,
  commitment = "confirmed",
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  amountBaseUnits?: anchor.BN;
  commitment?: Commitment;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<UnwrapWsolResult> {
  onStatus?.("wallet_approval");

  const owner = new PublicKey(wallet.account.address.toString());
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;
  const connection = new Connection(endpoint, commitment);

  const snapshot = await fetchWsolBalanceSnapshot(connection, owner, commitment);
  const amount = amountBaseUnits ?? new anchor.BN(snapshot.wsolRaw.toString());
  if (amount.lte(new anchor.BN(0))) {
    throw new Error("No wSOL balance to unwrap.");
  }
  if (amount.gt(new anchor.BN(snapshot.wsolRaw.toString()))) {
    throw new Error("Unwrap amount exceeds your wSOL balance.");
  }

  const instructions = await buildWsolUnwrapInstructions({
    connection,
    owner,
    walletSigner,
    amountBn: amount,
    sourceAta: snapshot.ata,
    commitment,
  });
  if (instructions.length === 0) {
    throw new Error("Nothing to unwrap.");
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

  let transactionMessage: any = setTransactionMessageFeePayerSigner(
    kitSigner,
    createTransactionMessage({ version: 0 })
  );
  for (const ix of instructions) {
    transactionMessage = appendTransactionMessageInstruction(ix as any, transactionMessage);
  }
  transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
    transactionMessage
  );

  let signature: string;

  onStatus?.("sending");
  if (walletSignerMode === "send") {
    const sentSignature = await signAndSendTransactionMessageWithSigners(transactionMessage);
    signature = sentSignature.toString();
  } else {
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    const rawTransaction = Buffer.from(transactionToBase64(signedTransaction), "base64");
    VersionedTransaction.deserialize(rawTransaction);
    signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 3,
      preflightCommitment: commitment,
    });
  }

  onStatus?.("confirming");
  await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, commitment);

  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerClusterParam(endpoint)}`,
    unwrappedRaw: amount.toString(),
  };
}
