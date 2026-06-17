"use client";

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  getCreateAssociatedTokenIdempotentInstruction,
  getSyncNativeInstruction,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import { type Commitment, Connection, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  createWalletTransactionSigner,
  transactionToBase64,
} from "@solana/client";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type { WalletSession } from "@solana/client";
import idl from "../../../../backend/src/idl/unified_flow.json";
import { getExplorerClusterParam, getProgramIdForEndpoint } from "@/lib/solana/network-config";

const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_ACCOUNT_SIZE = 165;

const CREATE_STREAM_IDL = idl;

export type CreateStreamInput = {
  recipient: string;
  amount: string;
  mint: string;
  type: string;
  startDate?: string;
  duration: string;
  cliffDuration?: string;
  milestoneCount?: string;
  milestoneAmounts: string[];
  nonce?: string | number | bigint;
};

export type CreateStreamResult = {
  signature: string;
  streamAddress: string;
  vaultAddress: string;
  explorerUrl: string;
  simulationLogs: string[];
};

export type BulkCreateStreamBatchResult = {
  signature: string;
  streamAddresses: string[];
  vaultAddresses: string[];
  explorerUrl: string;
  simulationLogs: string[];
};

export type BulkCreateStreamResult = {
  batches: BulkCreateStreamBatchResult[];
  streamAddresses: string[];
  vaultAddresses: string[];
};

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

function toBn(value: string | number | bigint) {
  return new anchor.BN(String(value));
}

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

function buildMilestones(
  type: string,
  amount: string,
  milestoneAmounts: string[],
  decimals: number,
  milestoneCount?: string
) {
  if (type !== "2") {
    return [] as { amount: anchor.BN }[];
  }

  const requestedCount = Number(milestoneCount || milestoneAmounts.length || 0);
  const normalizedCount = Number.isFinite(requestedCount) && requestedCount > 0 ? Math.floor(requestedCount) : milestoneAmounts.length;
  const normalizedMilestoneAmounts = Array.from({ length: normalizedCount }, (_, index) => milestoneAmounts[index] ?? "0");

  const parsedMilestones = normalizedMilestoneAmounts.map((item, index) =>
    parseTokenAmount(item || "0", decimals, `Milestone #${index + 1} amount`)
  );

  if (parsedMilestones.some((item) => item.lte(new anchor.BN(0)))) {
    throw new Error("Each milestone amount must be greater than zero.");
  }

  const totalMilestones = parsedMilestones.reduce((sum, item) => sum.add(item), new anchor.BN(0));
  const totalAmount = parseTokenAmount(amount || "0", decimals, "Total amount");

  if (!totalMilestones.eq(totalAmount)) {
    throw new Error(
      `Milestone total ${totalMilestones.toString()} must match total amount ${totalAmount.toString()}.`
    );
  }

  return parsedMilestones.map((item) => ({ amount: item }));
}

function formatTokenAmountFromBaseUnits(amount: anchor.BN | string | bigint, decimals: number) {
  const raw = String(amount);
  if (decimals <= 0) return raw;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const padded = unsigned.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${fraction ? `${whole}.${fraction}` : whole}`;
}

function isWrappedSolMint(mint: PublicKey) {
  return mint.toBase58() === WRAPPED_SOL_MINT;
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

type PreparedCreateStream = {
  creator: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  streamAddress: PublicKey;
  vaultAddress: PublicKey;
  creatorTokenAccount: PublicKey;
  configAddress: PublicKey;
  preInstructions: any[];
  kitInstruction: any;
  remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[];
};

async function prepareCreateStreamInstruction({
  wallet,
  connection,
  provider,
  program,
  input,
  walletSigner,
  programId,
}: {
  wallet: WalletSession;
  connection: Connection;
  provider: anchor.AnchorProvider;
  program: anchor.Program;
  input: CreateStreamInput;
  walletSigner: any;
  programId: PublicKey;
}): Promise<PreparedCreateStream> {
  const PROGRAM_ID = programId;
  const creator = new PublicKey(wallet.account.address.toString());
  const recipient = parsePublicKey(input.recipient, "recipient address");
  const mint = parsePublicKey(input.mint, "mint address");
  const vestingType = Number(input.type);
  if (!walletSigner) {
    throw new Error("Wallet signer is required for CSV bulk create.");
  }

  if (!Number.isInteger(vestingType) || vestingType < 0 || vestingType > 2) {
    throw new Error("Invalid vesting type. Expected 0, 1, or 2.");
  }

  const mintInfo = await connection.getParsedAccountInfo(mint, provider.opts.commitment);
  const parsedMintData = mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const mintDecimals = parsedMintData?.parsed?.info?.decimals;

  if (typeof mintDecimals !== "number") {
    throw new Error("Unable to read mint decimals. Make sure the mint exists and is initialized.");
  }

  const nonce = new anchor.BN(String(input.nonce ?? Date.now()));
  const nowTs = Math.floor(Date.now() / 1000);
  const parsedStartTs = input.startDate ? Math.floor(new Date(input.startDate).getTime() / 1000) : nowTs + 10;
  if (!Number.isFinite(parsedStartTs)) {
    throw new Error("Start date is invalid.");
  }
  const startTs = toBn(Math.max(parsedStartTs, nowTs + 1));
  const durationSecs = Number(input.duration || 0);

  if (vestingType !== 2 && (!Number.isFinite(durationSecs) || durationSecs <= 0)) {
    throw new Error("Duration must be a positive number of seconds.");
  }

  const endTs = toBn(startTs.toNumber() + (durationSecs > 0 ? durationSecs : 1));
  const cliffTs = vestingType === 1 ? toBn(startTs.toNumber() + Number(input.cliffDuration || 0)) : startTs;

  if (vestingType === 1 && Number(input.cliffDuration || 0) <= 0) {
    throw new Error("Cliff duration must be a positive number of seconds.");
  }

  const milestones = buildMilestones(input.type, input.amount, input.milestoneAmounts, mintDecimals, input.milestoneCount);
  const amountBn = parseTokenAmount(input.amount, mintDecimals, "Total amount");
  const [configAddress] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [streamAddress] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stream"),
      creator.toBuffer(),
      recipient.toBuffer(),
      nonce.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
  const [vaultAddress] = PublicKey.findProgramAddressSync(
    [streamAddress.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [creatorTokenAccount] = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const creatorSolBalance = await connection.getBalance(creator, provider.opts.commitment);

  try {
    const balance = await connection.getTokenAccountBalance(creatorTokenAccount, provider.opts.commitment);
    const availableAmount = new anchor.BN(balance.value.amount);

    if (availableAmount.lt(amountBn)) {
      throw new Error(
        `Insufficient token balance in your creator ATA. Available ${formatTokenAmountFromBaseUnits(availableAmount, mintDecimals)} tokens, need ${formatTokenAmountFromBaseUnits(amountBn, mintDecimals)} tokens.`
      );
    }
  } catch (balanceError: any) {
    const notFound = String(balanceError?.message || balanceError).toLowerCase().includes("could not find account") ||
      String(balanceError?.message || balanceError).toLowerCase().includes("account does not exist");

    if (!notFound) {
      throw balanceError;
    }
  }

  const remainingAccounts =
    vestingType === 2
      ? milestones.map((_, index) => {
        const [milestoneAddress] = PublicKey.findProgramAddressSync(
          [Buffer.from("milestone"), streamAddress.toBuffer(), Buffer.from([index])],
          PROGRAM_ID
        );

        return {
          pubkey: milestoneAddress,
          isWritable: true,
          isSigner: false,
        };
      })
      : [];

  const preInstructions: any[] = [];

  if (isWrappedSolMint(mint)) {
    let existingAmount = new anchor.BN(0);
    let creatorAtaExists = true;

    try {
      const balance = await connection.getTokenAccountBalance(creatorTokenAccount, provider.opts.commitment);
      existingAmount = new anchor.BN(balance.value.amount);
    } catch (balanceError: any) {
      const notFound = String(balanceError?.message || balanceError).toLowerCase().includes("could not find account") ||
        String(balanceError?.message || balanceError).toLowerCase().includes("account does not exist");

      if (!notFound) {
        throw balanceError;
      }

      creatorAtaExists = false;
    }

    const topUpAmount = amountBn.sub(existingAmount);

    if (topUpAmount.gt(new anchor.BN(0))) {
      const rentLamports = creatorAtaExists ? 0 : await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, provider.opts.commitment);
      const requiredLamports = topUpAmount.add(new anchor.BN(String(rentLamports)));

      if (new anchor.BN(String(creatorSolBalance)).lt(requiredLamports)) {
        throw new Error(
          `Insufficient SOL balance to wrap ${formatTokenAmountFromBaseUnits(topUpAmount, mintDecimals)} WSOL${creatorAtaExists ? "" : " and create the token account"}. Available ${formatTokenAmountFromBaseUnits(String(creatorSolBalance), 9)} SOL, need at least ${formatTokenAmountFromBaseUnits(requiredLamports, 9)} SOL.`
        );
      }
    }

    if (topUpAmount.gt(new anchor.BN(0))) {
      preInstructions.push(
        await getCreateAssociatedTokenIdempotentInstruction({
          payer: walletSigner as any,
          ata: creatorTokenAccount.toBase58() as any,
          owner: creator.toBase58() as any,
          mint: mint.toBase58() as any,
          systemProgram: SystemProgram.programId.toBase58() as any,
          tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
        } as any)
      );

      preInstructions.push(
        getTransferSolInstruction({
          source: walletSigner as any,
          destination: creatorTokenAccount.toBase58() as any,
          amount: BigInt(topUpAmount.toString()),
        } as any)
      );

      preInstructions.push(
        getSyncNativeInstruction({
          account: creatorTokenAccount.toBase58() as any,
        } as any)
      );
    }
  }

  const anchorInstruction = await program.methods
    .createStream(amountBn, startTs, cliffTs, endTs, vestingType, milestones, nonce)
    .accounts({
      creator,
      recipient,
      mint,
      config: configAddress,
      stream: streamAddress,
      vault: vaultAddress,
      creatorTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  const kitSigner = walletSigner as any;
  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: recipient.toBase58(), role: AccountRole.READONLY },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: configAddress.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: vaultAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      ...remainingAccounts.map((account) => ({
        address: account.pubkey.toBase58(),
        role: account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
      })),
    ],
    data: anchorInstruction.data,
  } as const;

  return {
    creator,
    recipient,
    mint,
    streamAddress,
    vaultAddress,
    creatorTokenAccount,
    configAddress,
    preInstructions,
    kitInstruction,
    remainingAccounts,
  };
}

async function sendVersionedTransactionMessage({
  connection,
  transactionMessage,
  commitment,
  walletSignerMode,
  onStatus,
}: {
  connection: Connection;
  transactionMessage: any;
  commitment: Commitment;
  walletSignerMode: string;
  onStatus?: (phase: TxProgressPhase) => void;
}) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

  const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
    transactionMessage
  );

  let simulationLogs: string[] = [];
  let signature: string;

  onStatus?.("sending");
  if (walletSignerMode === "send") {
    const sentSignature = await signAndSendTransactionMessageWithSigners(messageWithLifetime as any);
    signature = sentSignature.toString();
  } else {
    const signedTransaction = await signTransactionMessageWithSigners(messageWithLifetime as any);
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
      throw new Error(
        [
          "Create stream simulation failed.",
          `Reason: ${typeof simulation.value.err === "string" ? simulation.value.err : JSON.stringify(simulation.value.err)}`,
          ...simulationLogs.slice(-6),
        ].filter(Boolean).join("\n")
      );
    }

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

export async function createStreamOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: CreateStreamInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<CreateStreamResult> {
  onStatus?.("wallet_approval");
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const creator = new PublicKey(wallet.account.address.toString());
  const recipient = parsePublicKey(input.recipient, "recipient address");
  const mint = parsePublicKey(input.mint, "mint address");
  const vestingType = Number(input.type);
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);

  if (!Number.isInteger(vestingType) || vestingType < 0 || vestingType > 2) {
    throw new Error("Invalid vesting type. Expected 0, 1, or 2.");
  }

  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(CREATE_STREAM_IDL as unknown as anchor.Idl, provider);

  const mintInfo = await connection.getParsedAccountInfo(mint, commitment);
  const parsedMintData = mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const mintDecimals = parsedMintData?.parsed?.info?.decimals;

  if (typeof mintDecimals !== "number") {
    throw new Error("Unable to read mint decimals. Make sure the mint exists and is initialized.");
  }

  const nonce = new anchor.BN(String(input.nonce ?? Date.now()));
  const nowTs = Math.floor(Date.now() / 1000);
  const startTs = toBn(nowTs + 10);
  const durationSecs = Number(input.duration || 0);

  if (vestingType !== 2 && (!Number.isFinite(durationSecs) || durationSecs <= 0)) {
    throw new Error("Duration must be a positive number of seconds.");
  }

  const endTs = toBn(nowTs + 10 + (durationSecs > 0 ? durationSecs : 1));
  const cliffTs =
    vestingType === 1
      ? toBn(nowTs + 10 + Number(input.cliffDuration || 0))
      : startTs;

  if (vestingType === 1 && Number(input.cliffDuration || 0) <= 0) {
    throw new Error("Cliff duration must be a positive number of seconds.");
  }

  const milestones = buildMilestones(input.type, input.amount, input.milestoneAmounts, mintDecimals, input.milestoneCount);
  const amountBn = parseTokenAmount(input.amount, mintDecimals, "Total amount");
  const [configAddress] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [streamAddress] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stream"),
      creator.toBuffer(),
      recipient.toBuffer(),
      nonce.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
  const [vaultAddress] = PublicKey.findProgramAddressSync(
    [streamAddress.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [creatorTokenAccount] = PublicKey.findProgramAddressSync(
    [creator.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const creatorSolBalance = await connection.getBalance(creator, commitment);

  try {
    const balance = await connection.getTokenAccountBalance(creatorTokenAccount, commitment);
    const availableAmount = new anchor.BN(balance.value.amount);

    if (availableAmount.lt(amountBn)) {
      throw new Error(
        `Insufficient token balance in your creator ATA. Available ${formatTokenAmountFromBaseUnits(availableAmount, mintDecimals)} tokens, need ${formatTokenAmountFromBaseUnits(amountBn, mintDecimals)} tokens.`
      );
    }
  } catch (balanceError: any) {
    const notFound = String(balanceError?.message || balanceError).toLowerCase().includes("could not find account") ||
      String(balanceError?.message || balanceError).toLowerCase().includes("account does not exist");

    if (!notFound) {
      throw balanceError;
    }
  }

  const remainingAccounts =
    vestingType === 2
      ? milestones.map((_, index) => {
        const [milestoneAddress] = PublicKey.findProgramAddressSync(
          [Buffer.from("milestone"), streamAddress.toBuffer(), Buffer.from([index])],
          PROGRAM_ID
        );

        return {
          pubkey: milestoneAddress,
          isWritable: true,
          isSigner: false,
        };
      })
      : [];

  const preInstructions: any[] = [];

  if (isWrappedSolMint(mint)) {
    let existingAmount = new anchor.BN(0);
    let creatorAtaExists = true;

    try {
      const balance = await connection.getTokenAccountBalance(creatorTokenAccount, commitment);
      existingAmount = new anchor.BN(balance.value.amount);
    } catch (balanceError: any) {
      const notFound = String(balanceError?.message || balanceError).toLowerCase().includes("could not find account") ||
        String(balanceError?.message || balanceError).toLowerCase().includes("account does not exist");

      if (!notFound) {
        throw balanceError;
      }

      creatorAtaExists = false;
    }

    const topUpAmount = amountBn.sub(existingAmount);

    if (topUpAmount.gt(new anchor.BN(0))) {
      const rentLamports = creatorAtaExists ? 0 : await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, commitment);
      const requiredLamports = topUpAmount.add(new anchor.BN(String(rentLamports)));

      if (new anchor.BN(String(creatorSolBalance)).lt(requiredLamports)) {
        throw new Error(
          `Insufficient SOL balance to wrap ${formatTokenAmountFromBaseUnits(topUpAmount, mintDecimals)} WSOL${creatorAtaExists ? "" : " and create the token account"}. Available ${formatTokenAmountFromBaseUnits(String(creatorSolBalance), 9)} SOL, need at least ${formatTokenAmountFromBaseUnits(requiredLamports, 9)} SOL.`
        );
      }
    }

    if (topUpAmount.gt(new anchor.BN(0))) {
      preInstructions.push(
        await getCreateAssociatedTokenIdempotentInstruction({
          payer: walletSigner as any,
          ata: creatorTokenAccount.toBase58() as any,
          owner: creator.toBase58() as any,
          mint: mint.toBase58() as any,
          systemProgram: SystemProgram.programId.toBase58() as any,
          tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
        } as any)
      );

      preInstructions.push(
        getTransferSolInstruction({
          source: walletSigner as any,
          destination: creatorTokenAccount.toBase58() as any,
          amount: BigInt(topUpAmount.toString()),
        } as any)
      );

      preInstructions.push(
        getSyncNativeInstruction({
          account: creatorTokenAccount.toBase58() as any,
        } as any)
      );
    }
  }

  const anchorInstruction = await program.methods
    .createStream(amountBn, startTs, cliffTs, endTs, vestingType, milestones, nonce)
    .accounts({
      creator,
      recipient,
      mint,
      config: configAddress,
      stream: streamAddress,
      vault: vaultAddress,
      creatorTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  const kitSigner = walletSigner as any;

  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: recipient.toBase58(), role: AccountRole.READONLY },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: configAddress.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: vaultAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      ...remainingAccounts.map((account) => ({
        address: account.pubkey.toBase58(),
        role: account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
      })),
    ],
    data: anchorInstruction.data,
  } as const;

  let transactionMessage: any = setTransactionMessageFeePayerSigner(
    kitSigner as any,
    createTransactionMessage({ version: 0 })
  );

  for (const instruction of preInstructions) {
    transactionMessage = appendTransactionMessageInstruction(instruction as any, transactionMessage);
  }

  transactionMessage = appendTransactionMessageInstruction(kitInstruction as any, transactionMessage);
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
      throw new Error(
        [
          "Create stream simulation failed.",
          `Reason: ${typeof simulation.value.err === "string" ? simulation.value.err : JSON.stringify(simulation.value.err)}`,
          ...simulationLogs.slice(-6),
        ].filter(Boolean).join("\n")
      );
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
    streamAddress: streamAddress.toBase58(),
    vaultAddress: vaultAddress.toBase58(),
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerClusterParam(endpoint)}`,
    simulationLogs,
  };
}

export async function createStreamBatchOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  inputs,
  maxStreamsPerBatch = 2,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  inputs: CreateStreamInput[];
  maxStreamsPerBatch?: number;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<BulkCreateStreamResult> {
  onStatus?.("wallet_approval");
  if (!inputs.length) {
    throw new Error("At least one CSV row is required.");
  }

  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(CREATE_STREAM_IDL as unknown as anchor.Idl, provider);
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;

  const prepared = [] as PreparedCreateStream[];
  for (const input of inputs) {
    prepared.push(
      await prepareCreateStreamInstruction({
        wallet,
        connection,
        provider,
        program,
        input,
        walletSigner,
        programId: PROGRAM_ID,
      })
    );
  }

  const batches: BulkCreateStreamBatchResult[] = [];

  for (let index = 0; index < prepared.length; index += maxStreamsPerBatch) {
    const group = prepared.slice(index, index + maxStreamsPerBatch);
    let transactionMessage: any = setTransactionMessageFeePayerSigner(
      kitSigner as any,
      createTransactionMessage({ version: 0 })
    );

    for (const part of group) {
      for (const instruction of part.preInstructions) {
        transactionMessage = appendTransactionMessageInstruction(instruction as any, transactionMessage);
      }

      transactionMessage = appendTransactionMessageInstruction(part.kitInstruction as any, transactionMessage);
    }

    const { signature, simulationLogs } = await sendVersionedTransactionMessage({
      connection,
      transactionMessage,
      commitment,
      walletSignerMode,
      onStatus,
    });

    batches.push({
      signature,
      streamAddresses: group.map((part) => part.streamAddress.toBase58()),
      vaultAddresses: group.map((part) => part.vaultAddress.toBase58()),
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerClusterParam(endpoint)}`,
      simulationLogs,
    });
  }

  return {
    batches,
    streamAddresses: prepared.map((part) => part.streamAddress.toBase58()),
    vaultAddresses: prepared.map((part) => part.vaultAddress.toBase58()),
  };
}
