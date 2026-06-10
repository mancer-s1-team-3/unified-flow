"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "../../../../backend/src/idl/unified_flow.json";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
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
import { type Commitment, Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { WalletSession } from "@solana/client";
import { getExplorerClusterParam, getProgramIdForEndpoint } from "@/lib/solana/network-config";

const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

const EDIT_IDL = idl as unknown as anchor.Idl;

type StreamAccountView = {
  creator: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  milestoneCount: number;
  totalAmount: anchor.BN | bigint | number | string;
  startTs: anchor.BN | bigint | number | string;
  endTs: anchor.BN | bigint | number | string;
  cliffTs: anchor.BN | bigint | number | string;
  status: number;
  vestingType: number;
  nonce: anchor.BN | bigint | number | string;
};

type MilestoneAccountView = {
  amount: anchor.BN | bigint | number | string;
  index: number;
  stream: PublicKey;
};

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

type ExecuteInstructionParams = {
  connection: Connection;
  commitment: Commitment;
  walletSignerMode: string;
  walletSigner: any;
  anchorInstructionData: Uint8Array | Buffer | number[];
  accounts: { address: string; role: AccountRole; signer?: any }[];
  programId: PublicKey;
  onStatus?: (phase: TxProgressPhase) => void;
};

export type EditLinearInput = Readonly<{
  streamAddress: string;
  newEndDuration?: string;
  topupAmount?: string;
}>;

export type EditCliffInput = Readonly<{
  streamAddress: string;
  newCliffDuration: string;
}>;

export type EditMilestoneInput = Readonly<{
  streamAddress: string;
  milestoneIndex: string | number;
  newAmount: string;
}>;

export type EditStreamResult = Readonly<{
  signature: string;
  explorerUrl: string;
  simulationLogs: string[];
}>;

export type BatchEditCsvInput = Readonly<{
  id: string;
  amount?: string | number;
  duration?: string | number;
  cliffDuration?: string | number;
  milestones?: string;
}>;

export type BatchEditCsvResult = Readonly<{
  signatures: string[];
  streamAddresses: string[];
}>;

function parsePublicKey(value: string, label: string) {
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function parseTokenAmount(value: string, decimals: number, label: string) {
  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(`${label} is required.`);
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label} must be a valid decimal number.`);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");

  if (fractionPart.length > decimals) {
    throw new Error(`${label} supports at most ${decimals} decimal places for this mint.`);
  }

  const normalized = `${wholePart}${fractionPart.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return new anchor.BN(normalized || "0");
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

async function executeInstruction({
  connection,
  commitment,
  walletSignerMode,
  walletSigner,
  anchorInstructionData,
  accounts,
  programId,
  onStatus,
}: ExecuteInstructionParams) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  const kitSigner = walletSigner as any;

  const transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
    appendTransactionMessageInstruction(
      {
        programAddress: programId.toBase58(),
        accounts,
        data: anchorInstructionData,
      } as any,
      setTransactionMessageFeePayerSigner(
        kitSigner,
        createTransactionMessage({ version: 0 })
      )
    )
  );

  let simulationLogs: string[] = [];
  let signature: string;

  onStatus?.("wallet_approval");

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
      throw new Error(simulationLogs.length > 0 ? simulationLogs.slice(-6).join("\n") : "Transaction simulation failed.");
    }

    onStatus?.("sending");

    signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 3,
      preflightCommitment: commitment,
    });
  }

  onStatus?.("confirming");

  await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, commitment);

  return { signature, simulationLogs };
}

async function getStreamProgram(wallet: WalletSession, endpoint: string, commitment: Commitment) {
  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(EDIT_IDL, provider);
  return { connection, program, provider };
}

async function getMintDecimals(connection: Connection, mint: PublicKey, commitment: Commitment) {
  const mintInfo = await connection.getParsedAccountInfo(mint, commitment);
  const parsedMintData = mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const mintDecimals = parsedMintData?.parsed?.info?.decimals;

  if (typeof mintDecimals !== "number") {
    throw new Error("Unable to read mint decimals. Make sure the mint exists and is initialized.");
  }

  return mintDecimals;
}

async function getMilestoneAmounts(program: any, streamAddress: PublicKey, milestoneCount: number, programId: PublicKey) {
  const milestoneAmounts: anchor.BN[] = [];

  for (let index = 0; index < milestoneCount; index += 1) {
    const [milestoneAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), streamAddress.toBuffer(), Buffer.from([index])],
      programId
    );

    const milestoneState = await program.account.milestoneAccount.fetch(milestoneAddress) as MilestoneAccountView;
    milestoneAmounts.push(new anchor.BN(String(milestoneState.amount)));
  }

  return milestoneAmounts;
}

export async function editLinearOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: EditLinearInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<EditStreamResult> {
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const creator = new PublicKey(wallet.account.address.toString());
  const streamAddress = parsePublicKey(input.streamAddress, "stream address");
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const { connection, program } = await getStreamProgram(wallet, endpoint, commitment);
  const programAny = program as any;

  const streamState: StreamAccountView = await programAny.account.streamAccount.fetch(streamAddress);

  if (streamState.creator.toBase58() !== creator.toBase58()) {
    throw new Error("Connected wallet is not the creator for this stream.");
  }

  const mint = streamState.mint as PublicKey;
  const mintDecimals = await getMintDecimals(connection, mint, commitment);

  const startTs = new anchor.BN(String(streamState.startTs || "0"));
  const currentEndTs = new anchor.BN(String(streamState.endTs));

  const newEndDurationRaw = input.newEndDuration?.trim() ?? "";
  if (newEndDurationRaw !== "" && !/^\d+$/.test(newEndDurationRaw)) {
    throw new Error("New end duration must be a valid integer.");
  }

  const parsedNewEndTs = newEndDurationRaw !== ""
    ? startTs.add(new anchor.BN(newEndDurationRaw))
    : currentEndTs;

  const parsedTopupAmount = input.topupAmount?.trim()
    ? parseTokenAmount(input.topupAmount, mintDecimals, "Top-up amount")
    : new anchor.BN(0);

  if (parsedNewEndTs.lte(currentEndTs) && parsedTopupAmount.lte(new anchor.BN(0))) {
    throw new Error("Provide a later end timestamp, a positive top-up amount, or both.");
  }

  const creatorTokenAccount = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  const anchorInstruction = await program.methods
    .editLinear(parsedNewEndTs, parsedTopupAmount)
    .accounts({
      creator,
      mint,
      config: configPda,
      stream: streamAddress,
      vault: streamState.vault,
      creatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const { signature, simulationLogs } = await executeInstruction({
    connection,
    commitment,
    walletSignerMode,
    walletSigner,
    anchorInstructionData: anchorInstruction.data,
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: walletSigner as any },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: configPda.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: streamState.vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
    ],
    programId: PROGRAM_ID,
    onStatus,
  });

  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerClusterParam(endpoint)}`,
    simulationLogs,
  };
}

export async function editCliffOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: EditCliffInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<EditStreamResult> {
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const creator = new PublicKey(wallet.account.address.toString());
  const streamAddress = parsePublicKey(input.streamAddress, "stream address");
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const { connection, program } = await getStreamProgram(wallet, endpoint, commitment);
  const programAny = program as any;

  const streamState: StreamAccountView = await programAny.account.streamAccount.fetch(streamAddress);

  if (streamState.creator.toBase58() !== creator.toBase58()) {
    throw new Error("Connected wallet is not the creator for this stream.");
  }

  const newCliffDurationRaw = input.newCliffDuration.trim();
  if (!/^\d+$/.test(newCliffDurationRaw)) {
    throw new Error("New cliff duration must be a valid integer.");
  }

  const startTs = new anchor.BN(String(streamState.startTs || "0"));
  const endTs = new anchor.BN(String(streamState.endTs || "0"));

  const newCliffDurationBn = new anchor.BN(newCliffDurationRaw);
  const newCliffBn = startTs.add(newCliffDurationBn);

  if (newCliffBn.lt(startTs) || newCliffBn.gt(endTs)) {
    throw new Error(`Cliff timestamp must be between stream start time (${startTs.toString()}) and end time (${endTs.toString()}).`);
  }

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  const anchorInstruction = await program.methods
    .editCliff(newCliffBn)
    .accounts({
      creator,
      config: configPda,
      stream: streamAddress,
    })
    .instruction();

  const { signature, simulationLogs } = await executeInstruction({
    connection,
    commitment,
    walletSignerMode,
    walletSigner,
    anchorInstructionData: anchorInstruction.data,
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: walletSigner as any },
      { address: configPda.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
    ],
    programId: PROGRAM_ID,
    onStatus,
  });

  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerClusterParam(endpoint)}`,
    simulationLogs,
  };
}

export async function editMilestoneOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: EditMilestoneInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<EditStreamResult> {
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const creator = new PublicKey(wallet.account.address.toString());
  const streamAddress = parsePublicKey(input.streamAddress, "stream address");
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const { connection, program } = await getStreamProgram(wallet, endpoint, commitment);
  const programAny = program as any;

  const streamState: StreamAccountView = await programAny.account.streamAccount.fetch(streamAddress);

  if (streamState.creator.toBase58() !== creator.toBase58()) {
    throw new Error("Connected wallet is not the creator for this stream.");
  }

  const mint = streamState.mint as PublicKey;
  const mintDecimals = await getMintDecimals(connection, mint, commitment);
  const milestoneIndex = Number(input.milestoneIndex);

  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || milestoneIndex > 255) {
    throw new Error("Milestone index must be a valid integer between 0 and 255.");
  }

  const newAmount = parseTokenAmount(input.newAmount, mintDecimals, "New milestone amount");
  if (newAmount.lte(new anchor.BN(0))) {
    throw new Error("New milestone amount must be greater than zero.");
  }

  const milestoneCount = Number(streamState.milestoneCount || 0);
  if (!Number.isInteger(milestoneCount) || milestoneCount <= 0) {
    throw new Error("Milestone stream is missing milestone definitions.");
  }

  const milestoneAmounts = await getMilestoneAmounts(programAny, streamAddress, milestoneCount, PROGRAM_ID);
  if (milestoneIndex >= milestoneAmounts.length) {
    throw new Error("Milestone index is out of range for this stream.");
  }

  const currentTotalMilestones = milestoneAmounts.reduce((sum, amount) => sum.add(amount), new anchor.BN(0));
  const streamTotalAmount = new anchor.BN(String(streamState.totalAmount));

  if (!currentTotalMilestones.eq(streamTotalAmount)) {
    throw new Error(
      `Milestone allocations are out of sync with the stream total amount. Milestones sum to ${currentTotalMilestones.toString()}, stream total is ${streamTotalAmount.toString()}.`
    );
  }

  const [milestoneAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), streamAddress.toBuffer(), Buffer.from([milestoneIndex])],
    PROGRAM_ID
  );

  const creatorTokenAccount = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];

  const anchorInstruction = await program.methods
    .editMilestone(newAmount)
    .accounts({
      creator,
      stream: streamAddress,
      milestone: milestoneAddress,
      mint,
      vault: streamState.vault,
      creatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const { signature, simulationLogs } = await executeInstruction({
    connection,
    commitment,
    walletSignerMode,
    walletSigner,
    anchorInstructionData: anchorInstruction.data,
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: walletSigner as any },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: milestoneAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: streamState.vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
    ],
    programId: PROGRAM_ID,
    onStatus,
  });

  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerClusterParam(endpoint)}`,
    simulationLogs,
  };
}

export async function editStreamBatchOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  inputs,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  inputs: BatchEditCsvInput[];
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<BatchEditCsvResult> {
  const signatures: string[] = [];
  const streamAddresses: string[] = [];
  const { program } = await getStreamProgram(wallet, endpoint, commitment);
  const programAny = program as any;

  for (const item of inputs) {
    const streamAddress = String(item.id || "").trim();
    if (!streamAddress) continue;
    const streamPubkey = parsePublicKey(streamAddress, "stream address");
    const streamState: StreamAccountView = await programAny.account.streamAccount.fetch(streamPubkey);
    const vestingType = Number(streamState.vestingType);
    const durationRaw = String(item.duration ?? "").trim();
    const cliffRaw = String(item.cliffDuration ?? "").trim();
    const amountRaw = String(item.amount ?? "").trim();
    const hasDuration = durationRaw !== "" && durationRaw !== "0";
    const hasCliffDuration = cliffRaw !== "" && cliffRaw !== "0";
    const hasAmount = amountRaw !== "" && amountRaw !== "0";

    if (vestingType === 0) {
      if (!hasDuration && !hasAmount) {
        continue;
      }

      const startTs = new anchor.BN(String(streamState.startTs || "0"));
      const currentEndTs = new anchor.BN(String(streamState.endTs || "0"));
      const topupAmount = hasAmount ? amountRaw : "0";
      const targetEndTs = hasDuration
        ? startTs.add(new anchor.BN(durationRaw))
        : currentEndTs;

      if (hasDuration && !targetEndTs.gt(currentEndTs) && topupAmount === "0") {
        throw new Error(`Linear stream ${streamAddress}: new duration must extend end time, or amount must increase total allocation.`);
      }

      const linearResult = await editLinearOnChain({
        wallet,
        endpoint,
        commitment,
        onStatus,
        input: {
          streamAddress,
          newEndDuration: hasDuration ? durationRaw : undefined,
          topupAmount,
        }
      });
      signatures.push(linearResult.signature);
      streamAddresses.push(streamAddress);
      continue;
    }

    if (vestingType === 1) {
      if (!hasCliffDuration) {
        continue;
      }
      const cliffResult = await editCliffOnChain({
        wallet,
        endpoint,
        commitment,
        onStatus,
        input: {
          streamAddress,
          newCliffDuration: cliffRaw,
        },
      });
      signatures.push(cliffResult.signature);
      streamAddresses.push(streamAddress);
      continue;
    }

    if (vestingType === 2 && item.milestones && item.milestones.trim() !== "") {
      const amounts = item.milestones
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean);
      for (let index = 0; index < amounts.length; index += 1) {
        const milestoneResult = await editMilestoneOnChain({
          wallet,
          endpoint,
          commitment,
          onStatus,
          input: {
            streamAddress,
            milestoneIndex: index,
            newAmount: amounts[index],
          },
        });
        signatures.push(milestoneResult.signature);
      }
      streamAddresses.push(streamAddress);
      continue;
    }
  }

  return { signatures, streamAddresses };
}
