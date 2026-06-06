import { Program, BN, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { UnifiedFlow } from "./types";
import { getConfigPDA, getFeeVaultPDA, getMilestonePDA, getStreamPDA, getVaultATA } from "./pda";

export const CHAINLINK_PROGRAM_ID = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
export const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

export interface MilestoneInput {
  amount: BN;
}

export class UnifiedFlowClient {
  constructor(public readonly program: Program<UnifiedFlow>) {}

  /**
   * Helper to derive the config PDA
   */
  public getConfigPDA(): PublicKey {
    return getConfigPDA(this.program.programId)[0];
  }

  /**
   * Create a new stream (Linear, Cliff, or Milestone)
   */
  public async createStream(
    creator: PublicKey,
    recipient: PublicKey,
    mint: PublicKey,
    amount: BN,
    startTs: BN,
    cliffTs: BN,
    endTs: BN,
    vestingType: number,
    milestones: MilestoneInput[],
    nonce: BN
  ) {
    const config = this.getConfigPDA();
    const stream = getStreamPDA(creator, recipient, nonce, this.program.programId)[0];
    const vault = getVaultATA(mint, stream);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    const builder = this.program.methods
      .createStream(amount, startTs, cliffTs, endTs, vestingType, milestones, nonce)
      .accounts({
        creator,
        recipient,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

    if (vestingType === 2 && milestones.length > 0) { // VESTING_TYPE_MILESTONE = 2
      const remainingAccounts = milestones.map((_, i) => ({
        pubkey: getMilestonePDA(stream, i, this.program.programId)[0],
        isWritable: true,
        isSigner: false,
      }));
      builder.remainingAccounts(remainingAccounts);
    }

    return builder;
  }

  /**
   * Withdraw unlocked/vested tokens from a stream
   */
  public async withdraw(
    streamPDA: PublicKey,
    recipient: PublicKey,
    mint: PublicKey
  ) {
    const config = this.getConfigPDA();
    const vault = getVaultATA(mint, streamPDA);
    const recipientAta = getAssociatedTokenAddressSync(mint, recipient, true);
    const feeVault = getFeeVaultPDA(this.program.programId)[0];

    return this.program.methods
      .withdraw()
      .accounts({
        recipient,
        stream: streamPDA,
        recipientAta,
        chainlinkFeed: SOL_USD_FEED,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any);
  }

  /**
   * Cancel an active stream and return remaining tokens to the creator
   */
  public async cancel(
    streamPDA: PublicKey,
    creator: PublicKey,
    recipient: PublicKey,
    mint: PublicKey
  ) {
    const config = this.getConfigPDA();
    const vault = getVaultATA(mint, streamPDA);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);
    const recipientTokenAccount = getAssociatedTokenAddressSync(mint, recipient, true);

    return this.program.methods
      .cancel()
      .accounts({
        creator,
        stream: streamPDA,
        creatorTokenAccount,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any);
  }

  /**
   * Unlock a specific milestone
   */
  public async unlockMilestone(
    streamPDA: PublicKey,
    creator: PublicKey,
    milestoneIndex: number
  ) {
    const milestonePDA = getMilestonePDA(streamPDA, milestoneIndex, this.program.programId)[0];

    return this.program.methods
      .unlockMilestone()
      .accounts({
        stream: streamPDA,
        milestone: milestonePDA,
      } as any);
  }

  /**
   * Edit a milestone's amount (increase or decrease)
   */
  public async editMilestone(
    streamPDA: PublicKey,
    creator: PublicKey,
    mint: PublicKey,
    milestoneIndex: number,
    newAmount: BN
  ) {
    const milestonePDA = getMilestonePDA(streamPDA, milestoneIndex, this.program.programId)[0];
    const vault = getVaultATA(mint, streamPDA);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    return this.program.methods
      .editMilestone(newAmount)
      .accounts({
        stream: streamPDA,
        milestone: milestonePDA,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any);
  }

  /**
   * Edit the cliff timestamp of a cliff vesting stream
   */
  public async editCliff(
    streamPDA: PublicKey,
    creator: PublicKey,
    newCliffTs: BN
  ) {
    const config = this.getConfigPDA();

    return this.program.methods
      .editCliff(newCliffTs)
      .accounts({
        stream: streamPDA,
      } as any);
  }

  /**
   * Edit a linear stream's end timestamp and/or top up tokens
   */
  public async editLinear(
    streamPDA: PublicKey,
    creator: PublicKey,
    mint: PublicKey,
    newEndTs: BN,
    topupAmount: BN
  ) {
    const config = this.getConfigPDA();
    const vault = getVaultATA(mint, streamPDA);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator, true);

    return this.program.methods
      .editLinear(newEndTs, topupAmount)
      .accounts({
        stream: streamPDA,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any);
  }
}
