"use client";

import * as anchor from "@coral-xyz/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
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

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

const CREATE_STREAM_IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: {
    name: "solana_program",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "create_stream",
      discriminator: [71, 188, 111, 127, 108, 40, 229, 158],
      accounts: [
        { name: "creator" },
        { name: "recipient" },
        { name: "mint" },
        { name: "config" },
        { name: "stream" },
        { name: "vault" },
        { name: "creator_token_account" },
        { name: "system_program" },
        { name: "token_program" },
        { name: "associated_token_program" },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "start_ts", type: "i64" },
        { name: "cliff_ts", type: "i64" },
        { name: "end_ts", type: "i64" },
        { name: "vesting_type", type: "u8" },
        {
          name: "milestones",
          type: {
            vec: {
              defined: {
                name: "MilestoneInput",
              },
            },
          },
        },
        { name: "nonce", type: "u64" },
      ],
    },
  ],
  types: [
    {
      name: "MilestoneInput",
      type: {
        kind: "struct",
        fields: [{ name: "amount", type: "u64" }],
      },
    },
  ],
} as const;

export type CreateStreamInput = {
  recipient: string;
  amount: string;
  mint: string;
  type: string;
  duration: string;
  cliffDuration?: string;
  milestoneCount?: string;
  milestoneAmounts: string[];
  cancelable?: boolean;
};

export type CreateStreamResult = {
  signature: string;
  streamAddress: string;
  vaultAddress: string;
  explorerUrl: string;
  simulationLogs: string[];
};

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

function buildMilestones(type: string, amount: string, milestoneAmounts: string[], decimals: number) {
  if (type !== "2") {
    return [] as { amount: anchor.BN }[];
  }

  const parsedMilestones = milestoneAmounts.map((item, index) => parseTokenAmount(item || "0", decimals, `Milestone #${index + 1} amount`));
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

export async function createStreamOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: CreateStreamInput;
}): Promise<CreateStreamResult> {
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

  const nonce = new anchor.BN(Date.now());
  const nowTs = Math.floor(Date.now() / 1000);
  const startTs = toBn(nowTs + 10);
  const durationSecs = Number(input.duration || 0);

  if (!Number.isFinite(durationSecs) || durationSecs <= 0) {
    throw new Error("Duration must be a positive number of seconds.");
  }

  const endTs = toBn(nowTs + 10 + durationSecs);
  const cliffTs =
    vestingType === 1
      ? toBn(nowTs + 10 + Number(input.cliffDuration || 0))
      : startTs;

  if (vestingType === 1 && Number(input.cliffDuration || 0) <= 0) {
    throw new Error("Cliff duration must be a positive number of seconds.");
  }

  const milestones = buildMilestones(input.type, input.amount, input.milestoneAmounts, mintDecimals);
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

  const transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
    appendTransactionMessageInstruction(
      kitInstruction as any,
      setTransactionMessageFeePayerSigner(
        kitSigner as any,
        createTransactionMessage({ version: 0 })
      )
    )
  );

  let simulationLogs: string[] = [];
  let signature: string;

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

  await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, commitment);

  return {
    signature,
    streamAddress: streamAddress.toBase58(),
    vaultAddress: vaultAddress.toBase58(),
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getExplorerCluster(endpoint)}`,
    simulationLogs,
  };
}

function getExplorerCluster(endpoint: string) {
  if (endpoint.includes("devnet")) return "devnet";
  if (endpoint.includes("testnet")) return "testnet";
  if (endpoint.includes("mainnet")) return "mainnet-beta";
  return "custom";
}
