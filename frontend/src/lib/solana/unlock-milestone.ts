"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "@/lib/idl/unified_flow.json";
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

const UNLOCK_IDL = idl as unknown as anchor.Idl;

interface StreamAccountView {
  vestingType: number;
  creator: PublicKey;
  nextMilestoneIndex: number;
  milestoneCount: number;
}

export type UnlockMilestoneInput = Readonly<{
  streamAddress: string;
}>;

export type UnlockMilestoneResult = Readonly<{
  signature: string;
  explorerUrl: string;
  simulationLogs: string[];
  unlockedMilestoneIndex: number;
  milestoneAddress: string;
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

export async function unlockMilestoneOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: UnlockMilestoneInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<UnlockMilestoneResult> {
  onStatus?.("wallet_approval");
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const creator = new PublicKey(wallet.account.address.toString());
  const streamAddress = parsePublicKey(input.streamAddress, "stream address");
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;

  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(UNLOCK_IDL, provider) as anchor.Program<anchor.Idl> & {
    account: {
      streamAccount: {
        fetch(address: PublicKey): Promise<StreamAccountView>;
      };
    };
  };

  const streamState = await program.account.streamAccount.fetch(streamAddress);

  if (streamState.vestingType !== 2) {
    throw new Error("This stream is not a milestone vesting stream.");
  }

  if (streamState.creator.toBase58() !== creator.toBase58()) {
    throw new Error("Connected wallet is not the creator for this stream.");
  }

  const nextIndex = Number(streamState.nextMilestoneIndex);
  if (nextIndex >= Number(streamState.milestoneCount)) {
    throw new Error("All milestones have already been unlocked.");
  }

  const [milestoneAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), streamAddress.toBuffer(), Buffer.from([nextIndex])],
    PROGRAM_ID
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  const anchorInstruction = await program.methods
    .unlockMilestone()
    .accountsStrict({
      creator,
      config: configPda,
      stream: streamAddress,
      milestone: milestoneAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: configPda.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: milestoneAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ],
    data: anchorInstruction.data,
  } as unknown as Parameters<typeof appendTransactionMessageInstruction>[0];

  const blockhashLifetime = {
    blockhash,
    lastValidBlockHeight: BigInt(lastValidBlockHeight),
  } as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0];

  const transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
    blockhashLifetime,
    appendTransactionMessageInstruction(
      kitInstruction,
      setTransactionMessageFeePayerSigner(
        kitSigner,
        createTransactionMessage({ version: 0 })
      )
    )
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
        "Unlock milestone simulation failed.",
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
    unlockedMilestoneIndex: nextIndex,
    milestoneAddress: milestoneAddress.toBase58(),
  };
}
