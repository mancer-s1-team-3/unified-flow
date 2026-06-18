"use client";

import * as anchor from "@coral-xyz/anchor";
import idl from "../../../../backend/src/idl/unified_flow.json";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { Buffer } from "buffer";
import { createWalletTransactionSigner, transactionToBase64 } from "@solana/client";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { type Commitment, Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { WalletSession } from "@solana/client";
import { getExplorerClusterParam, getProgramIdForEndpoint } from "@/lib/solana/network-config";
import {
  buildWsolUnwrapInstructions,
  buildWsolWrapInstructions,
  isWrappedSolMint,
} from "@/lib/solana/wsol";

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
  withdrawn: anchor.BN | bigint | number | string;
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
  newCliffDuration?: string;
  topupAmount?: string;
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

type InstructionSpec = {
  data: Uint8Array | Buffer | number[];
  accounts: { address: string; role: AccountRole; signer?: any }[];
};

async function executeInstructions({
  connection,
  commitment,
  walletSignerMode,
  walletSigner,
  instructions,
  programId,
  onStatus,
  preInstructions = [],
  postInstructions = [],
}: {
  connection: Connection;
  commitment: Commitment;
  walletSignerMode: string;
  walletSigner: any;
  instructions: InstructionSpec[];
  programId: PublicKey;
  onStatus?: (phase: TxProgressPhase) => void;
  preInstructions?: any[];
  postInstructions?: any[];
}) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  const kitSigner = walletSigner as any;

  const kitInstructionPayload = [
    ...preInstructions.map((instruction) => instruction as any),
    ...instructions.map((instruction) => ({
      programAddress: programId.toBase58(),
      accounts: instruction.accounts,
      data: instruction.data,
    })),
    ...postInstructions.map((instruction) => instruction as any),
  ];

  // All instructions are bundled into one transaction so they execute
  // atomically — either every instruction lands or none do (single signature).
  const transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
    appendTransactionMessageInstructions(
      kitInstructionPayload as any,
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

async function executeInstruction({
  anchorInstructionData,
  accounts,
  preInstructions = [],
  postInstructions = [],
  ...rest
}: ExecuteInstructionParams & {
  preInstructions?: any[];
  postInstructions?: any[];
}) {
  return executeInstructions({
    ...rest,
    preInstructions,
    postInstructions,
    instructions: [{ data: anchorInstructionData, accounts }],
  });
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

  const preInstructions = isWrappedSolMint(mint) && parsedTopupAmount.gt(new anchor.BN(0))
    ? await buildWsolWrapInstructions({
      connection,
      owner: creator,
      walletSigner,
      amountBn: parsedTopupAmount,
      commitment,
    })
    : [];

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
    preInstructions,
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

  const startTs = new anchor.BN(String(streamState.startTs || "0"));
  const endTs = new anchor.BN(String(streamState.endTs || "0"));
  const currentCliffTs = new anchor.BN(String(streamState.cliffTs || "0"));
  const withdrawn = new anchor.BN(String(streamState.withdrawn || "0"));
  const mint = streamState.mint as PublicKey;
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

  // ── Resolve top-up intent ───────────────────────────────────────────────
  // Top-up reuses the edit_linear instruction, which the program also accepts
  // for cliff streams. We pass the current end timestamp so only the balance
  // changes (no schedule extension).
  const topupRaw = input.topupAmount?.trim() ?? "";
  let topupAmountBn = new anchor.BN(0);
  if (topupRaw !== "" && topupRaw !== "0") {
    const mintDecimals = await getMintDecimals(connection, mint, commitment);
    topupAmountBn = parseTokenAmount(topupRaw, mintDecimals, "Top-up amount");
  }
  const hasTopup = topupAmountBn.gt(new anchor.BN(0));

  // ── Resolve cliff-edit intent ───────────────────────────────────────────
  const newCliffDurationRaw = (input.newCliffDuration ?? "").trim();
  let wantsCliffEdit = false;
  let newCliffBn = currentCliffTs;
  if (newCliffDurationRaw !== "") {
    if (!/^\d+$/.test(newCliffDurationRaw)) {
      throw new Error("New cliff duration must be a valid integer.");
    }
    newCliffBn = startTs.add(new anchor.BN(newCliffDurationRaw));
    // When the user is only topping up, an unchanged cliff value (e.g. the
    // prefilled current duration) must NOT emit a cliff edit — that would
    // needlessly trip the on-chain withdrawn==0 guard.
    wantsCliffEdit = !newCliffBn.eq(currentCliffTs) || !hasTopup;
  }

  if (!wantsCliffEdit && !hasTopup) {
    throw new Error("Nothing to update: change the cliff duration or enter a positive top-up amount.");
  }

  const instructions: InstructionSpec[] = [];

  // ── Cliff edit instruction ──────────────────────────────────────────────
  if (wantsCliffEdit) {
    if (!withdrawn.isZero()) {
      throw new Error("Cliff can no longer be changed because tokens have already been withdrawn from this stream. You can still top up.");
    }
    if (newCliffBn.lt(startTs) || newCliffBn.gt(endTs)) {
      throw new Error(`Cliff timestamp must be between stream start time (${startTs.toString()}) and end time (${endTs.toString()}).`);
    }

    const cliffInstruction = await program.methods
      .editCliff(newCliffBn)
      .accounts({
        creator,
        config: configPda,
        stream: streamAddress,
      })
      .instruction();

    instructions.push({
      data: cliffInstruction.data,
      accounts: [
        { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: walletSigner as any },
        { address: configPda.toBase58(), role: AccountRole.READONLY },
        { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      ],
    });
  }

  // ── Top-up instruction (edit_linear with end unchanged) ─────────────────
  if (hasTopup) {
    const creatorTokenAccount = PublicKey.findProgramAddressSync(
      [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];

    const topupInstruction = await program.methods
      .editLinear(endTs, topupAmountBn)
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

    instructions.push({
      data: topupInstruction.data,
      accounts: [
        { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: walletSigner as any },
        { address: mint.toBase58(), role: AccountRole.READONLY },
        { address: configPda.toBase58(), role: AccountRole.READONLY },
        { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
        { address: streamState.vault.toBase58(), role: AccountRole.WRITABLE },
        { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
        { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      ],
    });
  }

  const preInstructions =
    hasTopup && isWrappedSolMint(mint)
      ? await buildWsolWrapInstructions({
        connection,
        owner: creator,
        walletSigner,
        amountBn: topupAmountBn,
        commitment,
      })
      : [];

  const { signature, simulationLogs } = await executeInstructions({
    connection,
    commitment,
    walletSignerMode,
    walletSigner,
    instructions,
    preInstructions,
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

  const oldAmount = milestoneAmounts[milestoneIndex];
  const topUpDiff = newAmount.gt(oldAmount) ? newAmount.sub(oldAmount) : new anchor.BN(0);
  const refundDiff = newAmount.lt(oldAmount) ? oldAmount.sub(newAmount) : new anchor.BN(0);

  const preInstructions =
    isWrappedSolMint(mint) && topUpDiff.gt(new anchor.BN(0))
      ? await buildWsolWrapInstructions({
        connection,
        owner: creator,
        walletSigner,
        amountBn: topUpDiff,
        commitment,
      })
      : [];

  const postInstructions =
    isWrappedSolMint(mint) && refundDiff.gt(new anchor.BN(0))
      ? await buildWsolUnwrapInstructions({
        connection,
        owner: creator,
        walletSigner,
        amountBn: refundDiff,
        sourceAta: creatorTokenAccount,
        commitment,
      })
      : [];

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
    preInstructions,
    postInstructions,
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
      const startTs = new anchor.BN(String(streamState.startTs || "0"));
      const currentEndTs = new anchor.BN(String(streamState.endTs || "0"));

      // On-chain edit_cliff enforces new_cliff_ts <= end_ts, so a cliff can never
      // be pushed past the stream's CURRENT end. When the same row also extends
      // the duration (and/or tops up), apply that via edit_linear FIRST — the
      // program accepts edit_linear for cliff streams and leaves cliff_ts intact
      // — THEN move the cliff, which re-fetches the now-extended end and passes
      // its guard. This automates the manual "edit linear duration first, then
      // the cliff" workaround so a single CSV row can do both.
      const wantsExtend =
        hasDuration && startTs.add(new anchor.BN(durationRaw)).gt(currentEndTs);

      if (wantsExtend || hasAmount) {
        const linearResult = await editLinearOnChain({
          wallet,
          endpoint,
          commitment,
          onStatus,
          input: {
            streamAddress,
            newEndDuration: wantsExtend ? durationRaw : undefined,
            topupAmount: hasAmount ? amountRaw : "0",
          },
        });
        signatures.push(linearResult.signature);
        streamAddresses.push(streamAddress);
      }

      // Only move the cliff when it actually changes — an unchanged value would
      // needlessly trip the on-chain withdrawn==0 guard and waste a transaction.
      const currentCliffDuration = new anchor.BN(String(streamState.cliffTs || "0")).sub(startTs);
      if (hasCliffDuration && !new anchor.BN(cliffRaw).eq(currentCliffDuration)) {
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
      }
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
