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
import { getExplorerClusterParam, getProgramIdForEndpoint, getNetworkByEndpoint } from "@/lib/solana/network-config";
import type { ClusterKey } from "@/lib/solana/network-config";

const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

// Chainlink SOL/USD feed per cluster. The on-chain program currently pins the
// devnet feed (programs/unified-flow/src/oracle.rs), so withdraw is devnet-only
// until that constant is made per-cluster and the program is redeployed. We map
// it explicitly here and fail loudly on clusters without a supported feed
// instead of surfacing an opaque on-chain constraint error.
const SOL_USD_FEEDS: Partial<Record<ClusterKey, string>> = {
  devnet: "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
  // mainnet / testnet: intentionally absent — see note above.
};

function resolveChainlinkFeed(endpoint: string): PublicKey {
  const cluster = getNetworkByEndpoint(endpoint)?.cluster ?? null;
  // Unknown/custom RPC (e.g. local validator forking devnet) → assume devnet feed.
  const feed = cluster ? SOL_USD_FEEDS[cluster] : SOL_USD_FEEDS.devnet;
  if (!feed) {
    throw new Error(
      `Withdraw is not available on ${cluster ?? "this network"} yet: the on-chain program pins the devnet SOL/USD Chainlink feed. ` +
      `Switch to devnet to withdraw, or upgrade & redeploy the program with a ${cluster ?? "matching"} oracle feed.`,
    );
  }
  return new PublicKey(feed);
}
const TOKEN_ACCOUNT_SIZE = 165;
const CHAINLINK_FEED_LEN = 248;
const CHAINLINK_FEED_DECIMALS_OFFSET = 0x8a;
const CHAINLINK_FEED_TIMESTAMP_OFFSET = 0xd0;
const CHAINLINK_FEED_ANSWER_OFFSET = 0xd8;

export type WithdrawStreamInput = Readonly<{
  streamAddress: string;
  amount?: string;
}>;

export type WithdrawStreamResult = Readonly<{
  signature: string;
  explorerUrl: string;
  simulationLogs: string[];
  withdrawnAmount: string;
}>;

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

const WITHDRAW_IDL = idl as unknown as anchor.Idl;

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

function parseChainlinkPrice(feedData: Buffer) {
  if (feedData.length < CHAINLINK_FEED_LEN) {
    throw new Error("Unable to read the SOL price feed.");
  }

  const decimals = feedData.readUInt8(CHAINLINK_FEED_DECIMALS_OFFSET);
  const updatedAt = feedData.readUInt32LE(CHAINLINK_FEED_TIMESTAMP_OFFSET);

  let rawPrice = BigInt(0);
  for (let i = 15; i >= 0; i--) {
    rawPrice = (rawPrice << BigInt(8)) | BigInt(feedData.readUInt8(CHAINLINK_FEED_ANSWER_OFFSET + i));
  }

  const signBit = BigInt(1) << BigInt(127);
  if ((rawPrice & signBit) !== BigInt(0)) {
    rawPrice -= BigInt(1) << BigInt(128);
  }

  return {
    decimals,
    updatedAt,
    rawPrice,
  };
}

function computeWithdrawFeeLamports(priceRaw: bigint, priceDecimals: number) {
  if (priceRaw <= BigInt(0)) {
    throw new Error("Unable to calculate the SOL withdrawal fee from the price feed.");
  }

  const factor = BigInt(10) ** BigInt(priceDecimals);
  return Number((BigInt(99) * BigInt(1_000_000_000) * factor) / (BigInt(100) * priceRaw));
}

function parseInsufficientLamportsFromLogs(logs: string[]) {
  const line = logs.find((log) => log.includes("insufficient lamports"));
  if (!line) return null;

  const match = line.match(/insufficient lamports\s+(\d+),\s+need\s+(\d+)/i);
  if (!match) return null;

  const available = BigInt(match[1]);
  const needed = BigInt(match[2]);
  const missing = needed > available ? needed - available : BigInt(0);

  return {
    available,
    needed,
    missing,
  };
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

function calculateClaimable(stream: any, nowTs: number) {
  const totalAmount = new anchor.BN(String(stream.totalAmount));
  const withdrawn = new anchor.BN(String(stream.withdrawn));
  const vestingType = Number(stream.vestingType);

  if (vestingType === 2) {
    const unlockedMilestoneAmount = new anchor.BN(String(stream.unlockedMilestoneAmount || 0));
    const claimable = unlockedMilestoneAmount.sub(withdrawn);
    return claimable.isNeg() ? new anchor.BN(0) : claimable;
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

  const duration = Math.max(endTs - startTs, 1);
  const elapsed = Math.min(Math.max(nowTs - startTs, 0), duration);
  const vested = totalAmount.mul(new anchor.BN(elapsed)).div(new anchor.BN(duration));
  const claimable = vested.sub(withdrawn);
  return claimable.isNeg() ? new anchor.BN(0) : claimable;
}

export async function withdrawFromStreamOnChain({
  wallet,
  endpoint,
  commitment = "confirmed",
  input,
  onStatus,
}: {
  wallet: WalletSession;
  endpoint: string;
  commitment?: Commitment;
  input: WithdrawStreamInput;
  onStatus?: (phase: TxProgressPhase) => void;
}): Promise<WithdrawStreamResult> {
  onStatus?.("wallet_approval");
  const PROGRAM_ID = getProgramIdForEndpoint(endpoint);
  // Resolve (and gate) the price feed before doing any work, so unsupported
  // clusters fail with a clear message rather than a cryptic on-chain error.
  const chainlinkFeed = resolveChainlinkFeed(endpoint);
  const recipient = new PublicKey(wallet.account.address.toString());
  const streamAddress = parsePublicKey(input.streamAddress, "stream address");
  const { signer: walletSigner, mode: walletSignerMode } = createWalletTransactionSigner(wallet);
  const kitSigner = walletSigner as any;

  const connection = new Connection(endpoint, commitment);
  const provider = new anchor.AnchorProvider(connection, getAnchorWallet(wallet), { commitment });
  const program = new anchor.Program(WITHDRAW_IDL, provider);
  const programAny = program as any;

  const streamState: any = await programAny.account.streamAccount.fetch(streamAddress);

  const isCancelled = Number(streamState.status) === 3 || Boolean(streamState.cancelled);

  if (isCancelled) {
    throw new Error("This stream has been cancelled and can no longer be withdrawn.");
  }

  if (streamState.recipient.toBase58() !== recipient.toBase58()) {
    throw new Error("Connected wallet is not the recipient for this stream.");
  }

  const mint = streamState.mint as PublicKey;
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const feeReceiver = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], PROGRAM_ID)[0];
  const recipientAta = PublicKey.findProgramAddressSync(
    [recipient.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
  const recipientSolBalance = await connection.getBalance(recipient, commitment);
  const recipientAtaInfo = await connection.getAccountInfo(recipientAta, commitment);
  const recipientAtaExists = recipientAtaInfo !== null;

  const mintInfo = await connection.getParsedAccountInfo(mint, commitment);
  const parsedMintData = mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const mintDecimals = parsedMintData?.parsed?.info?.decimals;

  if (typeof mintDecimals !== "number") {
    throw new Error("Unable to read mint decimals. Make sure the mint exists and is initialized.");
  }

  const nowTs = Math.floor(Date.now() / 1000);
  const claimableAmount = calculateClaimable(streamState, nowTs);

  if (claimableAmount.lte(new anchor.BN(0))) {
    throw new Error("No claimable tokens available for this stream yet.");
  }

  const requestedAmount = input.amount?.trim() ? parseTokenAmount(input.amount, mintDecimals, "Withdraw amount") : claimableAmount;

  if (requestedAmount.lte(new anchor.BN(0))) {
    throw new Error("Withdraw amount must be greater than zero.");
  }

  if (requestedAmount.gt(claimableAmount)) {
    throw new Error(
      `Requested withdraw amount exceeds claimable amount. Claimable ${formatTokenAmountFromBaseUnits(claimableAmount, mintDecimals)} tokens.`
    );
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

  const feedInfo = await connection.getAccountInfo(chainlinkFeed, commitment);
  if (!feedInfo?.data) {
    throw new Error("Unable to read the SOL price feed.");
  }

  const { decimals: feedDecimals, rawPrice } = parseChainlinkPrice(Buffer.from(feedInfo.data));
  const estimatedFeeLamports = computeWithdrawFeeLamports(rawPrice, feedDecimals);
  const estimatedAtaLamports = recipientAtaExists
    ? 0
    : await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, commitment);
  const estimatedTotalLamports = estimatedFeeLamports + estimatedAtaLamports;

  if (recipientSolBalance < estimatedTotalLamports) {
    const missingLamports = estimatedTotalLamports - recipientSolBalance;
    const estimatedFeeSol = formatTokenAmountFromBaseUnits(String(estimatedFeeLamports), 9);
    const estimatedAtaSol = formatTokenAmountFromBaseUnits(String(estimatedAtaLamports), 9);
    const missingSol = formatTokenAmountFromBaseUnits(String(missingLamports), 9);

    throw new Error(
      `Insufficient SOL balance for withdrawal. You need about ${estimatedFeeSol} SOL for the protocol fee${recipientAtaExists ? "" : ` and ${estimatedAtaSol} SOL to create the recipient token account`}. Missing approximately ${missingSol} SOL.`
    );
  }

  if (!recipientAtaExists) {
    const requiredLamports = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, commitment);

    if (recipientSolBalance < requiredLamports) {
      throw new Error(
        `Insufficient SOL balance to create the recipient token account for withdrawal. Available ${formatTokenAmountFromBaseUnits(String(recipientSolBalance), 9)} SOL, need at least ${formatTokenAmountFromBaseUnits(String(requiredLamports), 9)} SOL.`
      );
    }
  }

  const createRecipientAtaInstruction = await getCreateAssociatedTokenIdempotentInstruction({
    payer: walletSigner as any,
    ata: recipientAta.toBase58() as any,
    owner: recipient.toBase58() as any,
    mint: mint.toBase58() as any,
    systemProgram: SystemProgram.programId.toBase58() as any,
    tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
  } as any);

  const anchorInstruction = await program.methods
    .withdraw()
    .accounts({
      recipient,
      mint,
      config: configPda,
      stream: streamAddress,
      vault: streamState.vault,
      recipientAta,
      feeReceiver,
      chainlinkFeed,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const kitInstruction = {
    programAddress: PROGRAM_ID.toBase58(),
    accounts: [
      { address: recipient.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: kitSigner },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: configPda.toBase58(), role: AccountRole.READONLY },
      { address: streamAddress.toBase58(), role: AccountRole.WRITABLE },
      { address: streamState.vault.toBase58(), role: AccountRole.WRITABLE },
      { address: recipientAta.toBase58(), role: AccountRole.WRITABLE },
      { address: feeReceiver.toBase58(), role: AccountRole.WRITABLE },
      { address: chainlinkFeed.toBase58(), role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ],
    data: anchorInstruction.data,
  } as any;

  let transactionMessage: any = setTransactionMessageFeePayerSigner(
    kitSigner,
    createTransactionMessage({ version: 0 })
  );

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
      const insufficientLamports = parseInsufficientLamportsFromLogs(simulationLogs);
      if (insufficientLamports) {
        throw new Error(
          `Insufficient SOL balance for withdrawal. Available ${formatTokenAmountFromBaseUnits(insufficientLamports.available.toString(), 9)} SOL, need ${formatTokenAmountFromBaseUnits(insufficientLamports.needed.toString(), 9)} SOL. Missing ${formatTokenAmountFromBaseUnits(insufficientLamports.missing.toString(), 9)} SOL.`
        );
      }

      throw new Error([
        "Withdraw simulation failed.",
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
    withdrawnAmount: formatTokenAmountFromBaseUnits(requestedAmount, mintDecimals),
  };
}