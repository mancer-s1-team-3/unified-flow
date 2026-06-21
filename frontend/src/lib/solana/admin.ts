"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "@/lib/idl/unified_flow.json";
import { Buffer } from "buffer";
import { createWalletTransactionSigner, transactionToBase64 } from "@solana/client";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { type Commitment, Connection, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import type { WalletSession } from "@solana/client";
import { getExplorerClusterParam, getProgramIdForEndpoint } from "@/lib/solana/network-config";

const ADMIN_IDL = idl as unknown as anchor.Idl;

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

function parsePublicKey(value: string, label: string) {
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.message?.includes("429") || err?.status === 429;
      if (!is429 || i === retries - 1) {
        console.error("Failed after retries:", err);
        return null;
      }
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return null;
}
function getAnchorWallet(session: WalletSession) {
  return {
    publicKey: new PublicKey(session.account.address.toString()),
    signTransaction: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(transaction: T): Promise<T> => {
      if (session.signTransaction) {
        return (await session.signTransaction(transaction as never)) as unknown as T;
      }
      return transaction;
    },
    signAllTransactions: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(transactions: T[]): Promise<T[]> => {
      if (session.signTransaction) {
        return (await Promise.all(transactions.map((tx) => session.signTransaction!(tx as never)))) as unknown as T[];
      }
      return transactions;
    },
  };
}

export type AdminConfigData = {
  adminAuthority: string;
  feeAuthority: string;
  paused: boolean;
  withdrawFeeBps: number;
  feeVaultBalance: number;
};

export async function fetchAdminConfig({ endpoint, commitment = "confirmed" }: { endpoint: string; commitment?: Commitment }): Promise<AdminConfigData | null> {
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const connection = new Connection(endpoint, commitment);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], PROGRAM_ID);

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const dummyWallet = {
        publicKey: PublicKey.default,
        signTransaction: async () => { throw new Error("Read-only dummy wallet"); },
        signAllTransactions: async () => { throw new Error("Read-only dummy wallet"); },
      };
      const provider = new anchor.AnchorProvider(connection, dummyWallet, { commitment });
      const program = new anchor.Program(ADMIN_IDL, provider) as any;

      const configData = await program.account.configAccount.fetch(configPda);
      const feeVaultBalance = await connection.getBalance(feeVaultPda, commitment);

      return {
        adminAuthority: configData.adminAuthority.toString(),
        feeAuthority: configData.feeAuthority.toString(),
        paused: configData.paused,
        withdrawFeeBps: configData.withdrawFeeBps,
        feeVaultBalance,
      };
    } catch (err: any) {
      const is429 = err?.message?.includes("429");
      if (is429 && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); // 2s, 4s
        continue;
      }
      console.error("Failed to fetch admin config:", err);
      return null;
    }
  }
  return null;
}

export async function setPauseOnChain({
  wallet,
  endpoint,
  paused,
  commitment = "confirmed",
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  paused: boolean;
  commitment?: Commitment;
  onStatus?: (phase: TxProgressPhase) => void;
}) {
  onStatus?.("wallet_approval");
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const admin = new PublicKey(wallet.account.address.toString());
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;

  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(ADMIN_IDL, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  const anchorInstruction = await program.methods
    .setPause(paused)
    .accountsStrict({
      admin,
      config: configPda,
    })
    .instruction();

  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: admin.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: configPda.toBase58(), role: AccountRole.WRITABLE },
    ],
    data: anchorInstruction.data,
  } as any;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

  let transactionMessage: any = setTransactionMessageFeePayerSigner(
    kitSigner,
    createTransactionMessage({ version: 0 })
  );
  transactionMessage = appendTransactionMessageInstruction(kitInstruction, transactionMessage);
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
    const encodedTransaction = transactionToBase64(signedTransaction);
    const rawTransaction = Buffer.from(encodedTransaction, "base64");
    const versionedTransaction = VersionedTransaction.deserialize(rawTransaction);

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
  };
}

export async function withdrawFeesOnChain({
  wallet,
  endpoint,
  destination,
  amountBaseUnits,
  commitment = "confirmed",
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  destination: string;
  amountBaseUnits: number | bigint;
  commitment?: Commitment;
  onStatus?: (phase: TxProgressPhase) => void;
}) {
  onStatus?.("wallet_approval");
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const admin = new PublicKey(wallet.account.address.toString());
  const destPubkey = parsePublicKey(destination, "destination address");

  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;

  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(ADMIN_IDL, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], PROGRAM_ID);

  const anchorInstruction = await program.methods
    .withdrawFees(new anchor.BN(amountBaseUnits.toString()))
    .accountsStrict({
      admin,
      config: configPda,
      feeVault: feeVaultPda,
      destination: destPubkey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: admin.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: configPda.toBase58(), role: AccountRole.READONLY },
      { address: feeVaultPda.toBase58(), role: AccountRole.WRITABLE },
      { address: destPubkey.toBase58(), role: AccountRole.WRITABLE },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ],
    data: anchorInstruction.data,
  } as any;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

  let transactionMessage: any = setTransactionMessageFeePayerSigner(
    kitSigner,
    createTransactionMessage({ version: 0 })
  );
  transactionMessage = appendTransactionMessageInstruction(kitInstruction, transactionMessage);
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
    const encodedTransaction = transactionToBase64(signedTransaction);
    const rawTransaction = Buffer.from(encodedTransaction, "base64");
    const versionedTransaction = VersionedTransaction.deserialize(rawTransaction);

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
  };
}
