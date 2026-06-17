import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, VersionedTransaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { createWalletTransactionSigner, transactionToBase64 } from "@solana/client";
import type { WalletSession } from "@solana/client";
import { Buffer } from "buffer";
import type { UnifiedFlow } from "./types";
import { getConfigPDA, getFeeVaultPDA, getMilestonePDA, getStreamPDA, getVaultATA } from "./pda";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHAINLINK_PROGRAM_ID = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
export const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

export interface MilestoneInput {
  amount: anchor.BN;
}

export type TxProgressPhase = "wallet_approval" | "sending" | "confirming";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAnchorWallet(session: WalletSession) {
  return {
    publicKey: new PublicKey(session.account.address.toString()),
    signTransaction: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(
      transaction: T
    ): Promise<T> => {
      if (session.signTransaction) {
        return (await session.signTransaction(transaction as never)) as unknown as T;
      }
      return transaction;
    },
    signAllTransactions: async <
      T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction
    >(
      transactions: T[]
    ): Promise<T[]> => {
      if (session.signTransaction) {
        return (await Promise.all(
          transactions.map((tx) => session.signTransaction!(tx as never))
        )) as unknown as T[];
      }
      return transactions;
    },
  };
}

/**
 * Build, sign, and send a kit transaction message.
 * Mirrors the walletSignerMode pattern from withdraw.ts.
 */
async function signAndSend(
  transactionMessage: any,
  walletSignerMode: string,
  connection: Connection,
  commitment: anchor.web3.Commitment = "confirmed"
): Promise<string> {
  if (walletSignerMode === "send") {
    const sentSignature = await signAndSendTransactionMessageWithSigners(transactionMessage);
    return sentSignature.toString();
  }

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  const encodedTransaction = transactionToBase64(signedTransaction);
  const rawTransaction = Buffer.from(encodedTransaction, "base64");
  const versionedTransaction = VersionedTransaction.deserialize(rawTransaction);

  const simulation = await connection.simulateTransaction(versionedTransaction, {
    commitment,
    sigVerify: false,
    replaceRecentBlockhash: false,
  });

  if (simulation.value.err) {
    const logs = simulation.value.logs ?? [];
    throw new Error(["Transaction simulation failed.", ...logs.slice(-6)].filter(Boolean).join("\n"));
  }

  return connection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
    maxRetries: 3,
    preflightCommitment: commitment,
  });
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class UnifiedFlowClient {
  private readonly program: anchor.Program<UnifiedFlow>;
  private readonly wallet: WalletSession;
  private readonly connection: Connection;
  private readonly commitment: anchor.web3.Commitment;
  private readonly kitSigner: any;
  private readonly walletSignerMode: string;

  constructor(
    program: anchor.Program<UnifiedFlow>,
    wallet: WalletSession,
    connection: Connection,
    commitment: anchor.web3.Commitment = "confirmed"
  ) {
    this.program = program;
    this.wallet = wallet;
    this.connection = connection;
    this.commitment = commitment;

    const { signer, mode } = createWalletTransactionSigner(wallet);
    this.kitSigner = signer as any;
    this.walletSignerMode = mode;
  }

  public getConfigPDA(): PublicKey {
    return getConfigPDA(this.program.programId)[0];
  }

  // ─── createStream ───────────────────────────────────────────────────────────

  public async createStream(
    recipient: PublicKey,
    mint: PublicKey,
    amount: anchor.BN,
    startTs: anchor.BN,
    cliffTs: anchor.BN,
    endTs: anchor.BN,
    vestingType: number,
    milestones: MilestoneInput[],
    nonce: anchor.BN,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const creator = new PublicKey(this.wallet.account.address.toString());
    const config = this.getConfigPDA();
    const stream = getStreamPDA(creator, recipient, nonce, this.program.programId)[0];
    const vault = getVaultATA(mint, stream);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    let methodBuilder = this.program.methods
      .createStream(amount, startTs, cliffTs, endTs, vestingType, milestones, nonce)
      .accounts({
        creator,
        recipient,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

    if (vestingType === 2 && milestones.length > 0) {
      const remainingAccounts = milestones.map((_, i) => ({
        pubkey: getMilestonePDA(stream, i, this.program.programId)[0],
        isWritable: true,
        isSigner: false,
      }));
      methodBuilder = methodBuilder.remainingAccounts(remainingAccounts) as any;
    }

    const anchorIx = await methodBuilder.instruction();
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: recipient.toBase58(), role: AccountRole.READONLY },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: config.toBase58(), role: AccountRole.READONLY },
      { address: stream.toBase58(), role: AccountRole.WRITABLE },
      { address: vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── withdraw ───────────────────────────────────────────────────────────────

  public async withdraw(
    streamPDA: PublicKey,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const recipient = new PublicKey(this.wallet.account.address.toString());
    const config = this.getConfigPDA();
    const feeVault = getFeeVaultPDA(this.program.programId)[0];

    // Fetch stream state to get mint + vault
    const programAny = this.program as any;
    const streamState: any = await programAny.account.streamAccount.fetch(streamPDA);
    const mint = streamState.mint as PublicKey;
    const vault = streamState.vault as PublicKey;

    const recipientAta = getAssociatedTokenAddressSync(mint, recipient, true);

    const anchorIx = await this.program.methods
      .withdraw()
      .accounts({
        recipient,
        mint,
        config,
        stream: streamPDA,
        vault,
        recipientAta,
        feeReceiver: feeVault,
        chainlinkFeed: SOL_USD_FEED,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: recipient.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: config.toBase58(), role: AccountRole.READONLY },
      { address: streamPDA.toBase58(), role: AccountRole.WRITABLE },
      { address: vault.toBase58(), role: AccountRole.WRITABLE },
      { address: recipientAta.toBase58(), role: AccountRole.WRITABLE },
      { address: feeVault.toBase58(), role: AccountRole.WRITABLE },
      { address: SOL_USD_FEED.toBase58(), role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── cancel ─────────────────────────────────────────────────────────────────

  public async cancel(
    streamPDA: PublicKey,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const creator = new PublicKey(this.wallet.account.address.toString());
    const programAny = this.program as any;
    const streamState: any = await programAny.account.streamAccount.fetch(streamPDA);
    const mint = streamState.mint as PublicKey;
    const recipient = streamState.recipient as PublicKey;

    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);
    const recipientTokenAccount = getAssociatedTokenAddressSync(mint, recipient, true);
    const config = this.getConfigPDA();
    const vault = getVaultATA(mint, streamPDA);

    const anchorIx = await this.program.methods
      .cancel()
      .accounts({
        creator,
        mint,
        config: config,
        stream: streamPDA,
        vault: streamState.vault,
        creatorTokenAccount,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: config.toBase58(), role: AccountRole.READONLY },
      { address: streamPDA.toBase58(), role: AccountRole.WRITABLE },
      { address: vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: recipientTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── unlockMilestone ────────────────────────────────────────────────────────

  public async unlockMilestone(
    streamPDA: PublicKey,
    milestoneIndex: number,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const creator = new PublicKey(this.wallet.account.address.toString());
    const milestonePDA = getMilestonePDA(streamPDA, milestoneIndex, this.program.programId)[0];

    const anchorIx = await this.program.methods
      .unlockMilestone()
      .accounts({
        creator,
        stream: streamPDA,
        milestone: milestonePDA,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: streamPDA.toBase58(), role: AccountRole.WRITABLE },
      { address: milestonePDA.toBase58(), role: AccountRole.WRITABLE },
      { address: SystemProgram.programId.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── editMilestone ──────────────────────────────────────────────────────────

  public async editMilestone(
    streamPDA: PublicKey,
    milestoneIndex: number,
    newAmount: anchor.BN,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const creator = new PublicKey(this.wallet.account.address.toString());
    const milestonePDA = getMilestonePDA(streamPDA, milestoneIndex, this.program.programId)[0];
    const programAny = this.program as any;
    const streamState: any = await programAny.account.streamAccount.fetch(streamPDA);
    const mint = streamState.mint as PublicKey;
    const vault = getVaultATA(mint, streamPDA);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    const anchorIx = await this.program.methods
      .editMilestone(newAmount)
      .accounts({
        creator,
        stream: streamPDA,
        milestone: milestonePDA,
        mint,
        vault: streamState.vault,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: streamPDA.toBase58(), role: AccountRole.WRITABLE },
      { address: milestonePDA.toBase58(), role: AccountRole.WRITABLE },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── editCliff ──────────────────────────────────────────────────────────────

  public async editCliff(
    streamPDA: PublicKey,
    newCliffTs: anchor.BN,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const creator = new PublicKey(this.wallet.account.address.toString());
    const config = this.getConfigPDA();
    const programAny = this.program as any;
    const streamState: any = await programAny.account.streamAccount.fetch(streamPDA);
    const mint = streamState.mint as PublicKey;
    const vault = getVaultATA(mint, streamPDA);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    const anchorIx = await this.program.methods
      .editCliff(newCliffTs)
      .accounts({
        creator,
        mint,
        config: config,
        stream: streamPDA,
        vault: vault,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: config.toBase58(), role: AccountRole.READONLY },
      { address: streamPDA.toBase58(), role: AccountRole.WRITABLE },
      { address: vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── editLinear ─────────────────────────────────────────────────────────────

  public async editLinear(
    streamPDA: PublicKey,
    newEndTs: anchor.BN,
    topupAmount: anchor.BN,
    onStatus?: (phase: TxProgressPhase) => void
  ): Promise<{ signature: string }> {
    onStatus?.("wallet_approval");

    const creator = new PublicKey(this.wallet.account.address.toString());
    const config = this.getConfigPDA();
    const programAny = this.program as any;
    const streamState: any = await programAny.account.streamAccount.fetch(streamPDA);
    const mint = streamState.mint as PublicKey;
    const vault = getVaultATA(mint, streamPDA);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    const anchorIx = await this.program.methods
      .editLinear(newEndTs, topupAmount)
      .accounts({
        creator,
        mint,
        config: config,
        stream: streamPDA,
        vault: streamState.vault,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment
    );

    const kitIx = this._toKitInstruction(anchorIx, [
      { address: creator.toBase58(), role: AccountRole.WRITABLE_SIGNER, signer: this.kitSigner },
      { address: mint.toBase58(), role: AccountRole.READONLY },
      { address: config.toBase58(), role: AccountRole.READONLY },
      { address: streamPDA.toBase58(), role: AccountRole.WRITABLE },
      { address: vault.toBase58(), role: AccountRole.WRITABLE },
      { address: creatorTokenAccount.toBase58(), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ID.toBase58(), role: AccountRole.READONLY },
    ]);

    const txMsg = this._buildTxMessage(kitIx, blockhash, lastValidBlockHeight);

    onStatus?.("sending");
    const signature = await signAndSend(txMsg, this.walletSignerMode, this.connection, this.commitment);

    onStatus?.("confirming");
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, this.commitment);

    return { signature };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _toKitInstruction(
    anchorIx: anchor.web3.TransactionInstruction,
    accounts: { address: string; role: AccountRole; signer?: any }[]
  ) {
    return {
      programAddress: anchorIx.programId.toBase58(),
      accounts,
      data: anchorIx.data,
    } as any;
  }

  private _buildTxMessage(kitIx: any, blockhash: string, lastValidBlockHeight: number) {
    let txMsg: any = setTransactionMessageFeePayerSigner(
      this.kitSigner,
      createTransactionMessage({ version: 0 })
    );
    txMsg = appendTransactionMessageInstruction(kitIx, txMsg);
    txMsg = setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash as any, lastValidBlockHeight: BigInt(lastValidBlockHeight) },
      txMsg
    );
    return txMsg;
  }
}