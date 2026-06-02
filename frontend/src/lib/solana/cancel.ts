"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "../../../../backend/src/idl/unified_flow.json";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
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

const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

const CANCEL_IDL = idl as unknown as anchor.Idl;

export type CancelStreamInput = Readonly<{
  streamAddress: string;
}>;

export type CancelStreamResult = Readonly<{
  signature: string;
  explorerUrl: string;
  simulationLogs: string[];
}>;

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

function parsePublicKey(value: string, label: string) {
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
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

export async function cancelStreamOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: CancelStreamInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<CancelStreamResult> {
  onStatus?.("wallet_approval");
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const creator = new PublicKey(wallet.account.address.toString());
  const streamAddress = parsePublicKey(input.streamAddress, "stream address");
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;

  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(CANCEL_IDL, provider);
  const programAny = program as any;

  const streamState: any = await programAny.account.streamAccount.fetch(streamAddress);

  const isCancelled = Number(streamState.status) === 3 || Boolean(streamState.cancelled);

  if (isCancelled) {
    throw new Error("This stream has already been cancelled and cannot be cancelled again.");
  }

  if (streamState.creator.toBase58() !== creator.toBase58()) {
    throw new Error("Connected wallet is not the creator for this stream.");
  }

  if (!streamState.cancelable) {
    throw new Error("This stream is not cancelable.");
  }

  const mint = streamState.mint as PublicKey;
  const creatorTokenAccount = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
  const recipientTokenAccount = PublicKey.findProgramAddressSync(
    [streamState.recipient.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  const createCreatorAtaInstruction = await getCreateAssociatedTokenIdempotentInstruction({
    payer: walletSigner as any,
    ata: creatorTokenAccount.toBase58() as any,
    owner: creator.toBase58() as any,
    mint: mint.toBase58() as any,
    systemProgram: SystemProgram.programId.toBase58() as any,
    tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
  } as any);
  const createRecipientAtaInstruction = await getCreateAssociatedTokenIdempotentInstruction({
    payer: walletSigner as any,
    ata: recipientTokenAccount.toBase58() as any,
    owner: streamState.recipient.toBase58() as any,
    mint: mint.toBase58() as any,
    systemProgram: SystemProgram.programId.toBase58() as any,
    tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
  } as any);

  const anchorInstruction = await program.methods
    .cancel()
    .accounts({
      creator,
      mint,
      stream: streamAddress,
      vault: streamState.vault,
      creatorTokenAccount,
      recipientTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: streamState.vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: recipientTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ],
    data: anchorInstruction.data,
  } as any;

  let transactionMessage: any = setTransactionMessageFeePayerSigner(
    kitSigner,
    createTransactionMessage({ version: 0 })
  );
  transactionMessage = appendTransactionMessageInstruction(createCreatorAtaInstruction as any, transactionMessage);
  transactionMessage = appendTransactionMessageInstruction(createRecipientAtaInstruction as any, transactionMessage);
  transactionMessage = appendTransactionMessageInstruction(kitInstruction, transactionMessage);
  transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
    transactionMessage
  );

  let simulationLogs: string[] = [];
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

    const simulation = await connection.simulateTransaction(versionedTransaction, {
      commitment,
      sigVerify: false,
      replaceRecentBlockhash: false,
    });

    simulationLogs = simulation.value.logs ?? [];

    if (simulation.value.err) {
      throw new Error([
        "Cancel simulation failed.",
        ...simulationLogs.slice(-6),
      ].filter(Boolean).join("\n"));
    }

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
    simulationLogs,
  };
}
