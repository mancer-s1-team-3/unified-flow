import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext, Clock } from "solana-bankrun";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SolanaProgram } from "../target/types/solana_program";
import IDL from "../target/idl/solana_program.json";
import { expect } from "chai";

// ─── Chainlink mock constants (must match lib.rs) ───────────────────────────

const SOL_USD_FEED = new PublicKey(
  "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"
);
const CHAINLINK_PROGRAM_ID = new PublicKey(
  "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
);

const FEED_DECIMALS_OFFSET = 0x8a; // 138
const FEED_TIMESTAMP_OFFSET = 0xd0; // 208
const FEED_ANSWER_OFFSET = 0xd8; // 216
const FEED_LEN = 248;

// $100.00 → raw = 10_000_000_000, decimals = 8
// fee = 99 * 1e9 * 1e8 / (100 * 10_000_000_000) = 9_900_000 lamports
const PRICE_DECIMALS = 8;
const PRICE_RAW = 10_000_000_000n;
const EXPECTED_FEE_LAMPORTS = 9_900_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Builds a 248-byte mock Chainlink feed account data buffer. */
function buildFeedData(
  priceRaw: bigint,
  decimals: number,
  updatedAt: number
): Buffer {
  const buf = Buffer.alloc(FEED_LEN, 0);
  buf.writeUInt8(decimals, FEED_DECIMALS_OFFSET);
  buf.writeUInt32LE(updatedAt >>> 0, FEED_TIMESTAMP_OFFSET);
  // i128 little-endian (two's complement for negatives)
  let p = priceRaw < 0n ? (1n << 128n) + priceRaw : priceRaw;
  for (let i = 0; i < 16; i++) {
    buf.writeUInt8(Number(p & 0xffn), FEED_ANSWER_OFFSET + i);
    p >>= 8n;
  }
  return buf;
}

/** Computes expected fee lamports for a given SOL price raw value. */
function computeFee(priceRaw: bigint, decimals: number): number {
  const factor = 10n ** BigInt(decimals);
  return Number((99n * 1_000_000_000n * factor) / (100n * priceRaw));
}

/** Sets the bankrun clock to the given Unix timestamp. */
async function setTime(context: ProgramTestContext, unixTs: number) {
  await context.setClock(new Clock(0n, 0n, 0n, 0n, BigInt(unixTs)));
}

/** Sends a set of instructions through bankrun's processTransaction. */
async function sendIx(
  context: ProgramTestContext,
  payer: Keypair,
  instructions: anchor.web3.TransactionInstruction[],
  extraSigners: Keypair[] = []
) {
  const tx = new Transaction();
  tx.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0];
  tx.feePayer = payer.publicKey;
  tx.add(...instructions);
  tx.sign(payer, ...extraSigners);
  await context.banksClient.processTransaction(tx);
}

/** Creates an SPL mint via bankrun (bypasses connection.sendTransaction). */
async function createTestMint(
  context: ProgramTestContext,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number
): Promise<PublicKey> {
  const mintKp = Keypair.generate();
  const rent = await context.banksClient.getRent();
  const lamports = rent.minimumBalance(BigInt(MINT_SIZE));
  await sendIx(
    context,
    payer,
    [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports: Number(lamports),
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mintKp.publicKey, decimals, mintAuthority, null),
    ],
    [mintKp]
  );
  return mintKp.publicKey;
}

/** Mints tokens to a destination ATA via bankrun. */
async function mintTokens(
  context: ProgramTestContext,
  payer: Keypair,
  mintPubkey: PublicKey,
  destination: PublicKey,
  authority: Keypair,
  amount: number
) {
  await sendIx(
    context,
    payer,
    [createMintToInstruction(mintPubkey, destination, authority.publicKey, amount)],
    authority.publicKey.equals(payer.publicKey) ? [] : [authority]
  );
}

/** Creates an ATA via bankrun (idempotent — safe to call even if ATA already exists). */
async function createAta(
  context: ProgramTestContext,
  payer: Keypair,
  mintPubkey: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mintPubkey, owner, true, TOKEN_PROGRAM_ID);
  await sendIx(context, payer, [
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      owner,
      mintPubkey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
  ]);
  return ata;
}

/** Returns SOL balance as bigint via banksClient (works with bankrun). */
async function getSolBalance(context: ProgramTestContext, pubkey: PublicKey): Promise<bigint> {
  return context.banksClient.getBalance(pubkey);
}

/** Reads token balance from raw account data (offset 64 = amount u64 LE). */
async function getTokenBalance(context: ProgramTestContext, ata: PublicKey): Promise<bigint> {
  const account = await context.banksClient.getAccount(ata);
  if (!account) return 0n;
  return Buffer.from(account.data).readBigUInt64LE(64);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("withdraw", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<SolanaProgram>;

  let admin: Keypair;
  let creator: Keypair;
  let recipient: Keypair;
  let stranger: Keypair;

  let mint: PublicKey;
  let configPda: PublicKey;
  let feeVaultPda: PublicKey;

  // Fixed timestamp so create_stream's `start_ts >= now` always holds
  const BASE_NOW = 1_700_000_000;
  const STREAM_DURATION = 1_000; // seconds
  const TOKEN_AMOUNT = 1_000_000; // 1 token (6 decimals)

  let nonceCounter = 0;
  let withdrawCallCounter = 0; // ensures unique tx signatures across withdraw calls

  // ─── one-time setup ────────────────────────────────────────────────────────

  before(async () => {
    admin = Keypair.generate();
    creator = Keypair.generate();
    recipient = Keypair.generate();
    stranger = Keypair.generate();

    const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, BASE_NOW);

    context = await startAnchor(".", [], [
      {
        address: admin.publicKey,
        info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
      },
      {
        address: creator.publicKey,
        info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
      },
      {
        address: recipient.publicKey,
        info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
      },
      {
        address: stranger.publicKey,
        info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
      },
      {
        address: SOL_USD_FEED,
        info: { lamports: 1e9, data: feedData, owner: CHAINLINK_PROGRAM_ID, executable: false },
      },
    ]);

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<SolanaProgram>(IDL as SolanaProgram, provider);

    await setTime(context, BASE_NOW);

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_vault")],
      program.programId
    );

    // Initialize config — auto-resolved: config PDA, systemProgram
    await program.methods.initializeConfig()
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();

    // Create SPL mint with 6 decimals (via bankrun directly)
    mint = await createTestMint(context, admin, admin.publicKey, 6);
  });

  // ─── helpers ──────────────────────────────────────────────────────────────

  /**
   * Sets up a fresh stream. Returns everything needed to call withdraw.
   * clock must already be set to startTs (or before) when calling this.
   */
  async function setupStream(opts: {
    startTs?: number;
    endTs?: number;
    amount?: number;
    recipientOverride?: Keypair;
  } = {}): Promise<{
    streamPda: PublicKey;
    vaultAta: PublicKey;
    recipientAta: PublicKey;
    startTs: number;
    endTs: number;
    amount: number;
    nonce: bigint;
  }> {
    const nonce = BigInt(nonceCounter++);
    const startTs = opts.startTs ?? BASE_NOW;
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;
    const rcpt = opts.recipientOverride ?? recipient;

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        rcpt.publicKey.toBuffer(),
        Buffer.from(new BN(nonce.toString()).toArrayLike(Buffer, "le", 8)),
      ],
      program.programId
    );
    const vaultAta = getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID);

    // Fund creator with tokens
    const creatorAta = await createAta(context, admin, mint, creator.publicKey);
    await mintTokens(context, admin, mint, creatorAta, admin, amount);

    const recipientAta = await createAta(context, admin, mint, rcpt.publicKey);

    // createStream — auto-resolved: config (PDA), stream (PDA via creator+recipient+nonce arg),
    //                               vault (ATA), systemProgram, associatedTokenProgram
    await program.methods
      .createStream(new BN(amount), new BN(startTs), new BN(startTs), new BN(endTs), 0, [], new BN(nonce.toString()))
      .accounts({
        creator: creator.publicKey,
        recipient: rcpt.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, vaultAta, recipientAta, startTs, endTs, amount, nonce };
  }

  /**
   * Sets up a milestone stream with four equal unlocks.
   * Returns the stream PDA, recipient ATA, and milestone PDAs.
   */
  async function setupMilestoneStream(): Promise<{
    streamPda: PublicKey;
    recipientAta: PublicKey;
    milestonePdas: PublicKey[];
    amount: number;
  }> {
    const nonce = BigInt(nonceCounter++);
    const startTs = BASE_NOW;
    const endTs = BASE_NOW + STREAM_DURATION;
    const amount = TOKEN_AMOUNT;
    const milestoneAmount = Math.floor(amount / 4);

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        Buffer.from(new BN(nonce.toString()).toArrayLike(Buffer, "le", 8)),
      ],
      program.programId
    );

    const milestonePdas = [] as PublicKey[];
    const remainingAccounts = [] as { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[];
    for (let i = 0; i < 4; i++) {
      const [milestonePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPda.toBuffer(), Buffer.from([i])],
        program.programId
      );
      milestonePdas.push(milestonePda);
      remainingAccounts.push({ pubkey: milestonePda, isWritable: true, isSigner: false });
    }

    const creatorAta = await createAta(context, admin, mint, creator.publicKey);
    await mintTokens(context, admin, mint, creatorAta, admin, amount);

    const recipientAta = await createAta(context, admin, mint, recipient.publicKey);

    await program.methods
      .createStream(
        new BN(amount),
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        2,
        [
          { amount: new BN(milestoneAmount) },
          { amount: new BN(milestoneAmount) },
          { amount: new BN(milestoneAmount) },
          { amount: new BN(milestoneAmount) },
        ],
        new BN(nonce.toString())
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers([creator])
      .rpc();

    return { streamPda, recipientAta, milestonePdas, amount };
  }

  async function setupCliffStream(opts: {
    startTs?: number;
    cliffTs?: number;
    endTs?: number;
    amount?: number;
  } = {}): Promise<{
    streamPda: PublicKey;
    recipientAta: PublicKey;
    startTs: number;
    cliffTs: number;
    endTs: number;
    amount: number;
  }> {
    const nonce = BigInt(nonceCounter++);
    const startTs = opts.startTs ?? BASE_NOW;
    const cliffTs = opts.cliffTs ?? BASE_NOW + Math.floor(STREAM_DURATION / 2);
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        Buffer.from(new BN(nonce.toString()).toArrayLike(Buffer, "le", 8)),
      ],
      program.programId
    );

    const creatorAta = await createAta(context, admin, mint, creator.publicKey);
    await mintTokens(context, admin, mint, creatorAta, admin, amount);
    const recipientAta = await createAta(context, admin, mint, recipient.publicKey);

    await program.methods
      .createStream(new BN(amount), new BN(startTs), new BN(cliffTs), new BN(endTs), 1, [], new BN(nonce.toString()))
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, recipientAta, startTs, cliffTs, endTs, amount };
  }

  /**
   * Calls withdraw with the given accounts.
   * Auto-resolved: mint (has_one stream), config (PDA), vault (ATA), systemProgram.
   */
  async function doWithdraw(
    streamPda: PublicKey,
    recipientAta: PublicKey,
    opts: {
      signer?: Keypair;
      feedAccount?: PublicKey;
      feeVaultOverride?: PublicKey;
    } = {}
  ): Promise<string> {
    const signer = opts.signer ?? recipient;
    const feedAccount = opts.feedAccount ?? SOL_USD_FEED;
    const feeVault = opts.feeVaultOverride ?? feeVaultPda;

    // `stream` is typed as auto-resolved (circular PDA seeds) but must be supplied at runtime.
    // Unique counter in _amount_to_withdraw (ignored by program) avoids duplicate tx signatures.
    return program.methods
      .withdraw(new BN(withdrawCallCounter++))
      .accounts({
        recipient: signer.publicKey,
        stream: streamPda,
        recipientAta,
        feeVault,
        chainlinkFeed: feedAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([signer])
      .rpc();
  }

  async function doCancel(streamPda: PublicKey, recipientAta: PublicKey) {
    const creatorAta = getAssociatedTokenAddressSync(mint, creator.publicKey, true, TOKEN_PROGRAM_ID);

    return program.methods
      .cancel()
      .accountsStrict({
        creator: creator.publicKey,
        mint,
        stream: streamPda,
        vault: getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID),
        creatorTokenAccount: creatorAta,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();
  }

  /** Updates the mock Chainlink feed account in-place via bankrun's setAccount. */
  function updateFeed(priceRaw: bigint, decimals: number, updatedAt: number) {
    const data = buildFeedData(priceRaw, decimals, updatedAt);
    context.setAccount(SOL_USD_FEED, {
      lamports: 1e9,
      data,
      owner: CHAINLINK_PROGRAM_ID,
      executable: false,
    });
  }

  /** Asserts that a promise rejects with an error matching the given fragment.
   *  Checks errorCode.code (e.g. "Unauthorized"), errorMessage, logs, and raw message. */
  async function expectError(promise: Promise<any>, fragment: string) {
    try {
      await promise;
      expect.fail("Expected transaction to fail, but it succeeded");
    } catch (err: any) {
      const code = err?.error?.errorCode?.code ?? "";
      const msg = err?.error?.errorMessage ?? "";
      const logs = (err?.logs ?? []).join("\n");
      const raw = err?.message ?? String(err);
      const combined = `${code} ${msg} ${logs} ${raw}`;
      expect(combined, `Error "${fragment}" not found in: ${combined.slice(0, 300)}`).to.include(fragment);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Happy path
  // ══════════════════════════════════════════════════════════════════════════

  it("partial withdraw: 50% vested → correct token amount transferred", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, startTs, endTs, amount } = await setupStream();

    const midTs = startTs + Math.floor((endTs - startTs) / 2);
    await setTime(context, midTs);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, midTs);

    const feeBalanceBefore = await getSolBalance(context, feeVaultPda);
    const solBalanceBefore = await getSolBalance(context, recipient.publicKey);

    const tokenBefore = await getTokenBalance(context, recipientAta);
    await doWithdraw(streamPda, recipientAta);
    const tokenAfter = await getTokenBalance(context, recipientAta);

    // Token delta ≈ 50% of total
    const expectedRaw = Math.floor(amount / 2);
    expect(Number(tokenAfter - tokenBefore)).to.be.closeTo(expectedRaw, 1);

    // Fee in SOL
    const feeBalanceAfter = await getSolBalance(context, feeVaultPda);
    expect(Number(feeBalanceAfter - feeBalanceBefore)).to.equal(EXPECTED_FEE_LAMPORTS);

    // Recipient's SOL decreased by at least the fee
    const solBalanceAfter = await getSolBalance(context, recipient.publicKey);
    expect(Number(solBalanceBefore - solBalanceAfter)).to.be.gte(EXPECTED_FEE_LAMPORTS);

    // Stream state: withdrawn ~50%, status still ACTIVE
    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.withdrawn.toNumber()).to.be.closeTo(expectedRaw, 1);
    expect(stream.status).to.equal(1); // ACTIVE
  });

  it("full withdraw: all tokens claimed, stream status → COMPLETED (2)", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs, amount } = await setupStream();

    await setTime(context, endTs + 1);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

    const tokenBefore2 = await getTokenBalance(context, recipientAta);
    await doWithdraw(streamPda, recipientAta);
    const tokenAfter2 = await getTokenBalance(context, recipientAta);

    expect(Number(tokenAfter2 - tokenBefore2)).to.equal(amount);

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.withdrawn.toNumber()).to.equal(amount);
    expect(stream.status).to.equal(2); // COMPLETED
  });

  it("sequential withdraws: accumulate withdrawn amount correctly", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, startTs, endTs, amount } = await setupStream();
    const duration = endTs - startTs;

    // First withdraw at 30%
    const ts1 = startTs + Math.floor(duration * 0.3);
    await setTime(context, ts1);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, ts1);
    await doWithdraw(streamPda, recipientAta);

    const after1 = await program.account.streamAccount.fetch(streamPda);
    const w1 = after1.withdrawn.toNumber();
    expect(w1).to.be.closeTo(Math.floor(amount * 0.3), 2);
    expect(after1.status).to.equal(1); // still ACTIVE

    // Second withdraw at 80%
    const ts2 = startTs + Math.floor(duration * 0.8);
    await setTime(context, ts2);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, ts2);
    await doWithdraw(streamPda, recipientAta);

    const after2 = await program.account.streamAccount.fetch(streamPda);
    const w2 = after2.withdrawn.toNumber();
    expect(w2).to.be.closeTo(Math.floor(amount * 0.8), 2);
    expect(w2).to.be.gt(w1);
    expect(after2.status).to.equal(1);

    // Full withdraw past end
    await setTime(context, endTs + 100);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 100);
    await doWithdraw(streamPda, recipientAta);

    const after3 = await program.account.streamAccount.fetch(streamPda);
    expect(after3.withdrawn.toNumber()).to.equal(amount);
    expect(after3.status).to.equal(2); // COMPLETED
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Vesting percentage checks: 0%, 25%, 50%, 100%
  // ══════════════════════════════════════════════════════════════════════════

  it("vesting 0%: at stream start elapsed=0, vested=0, NothingToWithdraw", async () => {
    const futureStart = BASE_NOW + 200;

    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta } = await setupStream({
      startTs: futureStart,
      endTs: futureStart + STREAM_DURATION,
    });

    // Set clock exactly at startTs — elapsed = 0 → vested = 0
    await setTime(context, futureStart);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, futureStart);

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.withdrawn.toNumber()).to.equal(0);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "NothingToWithdraw"
    );
  });

  it("vesting 25%: at 25% elapsed, correct token amount transferred", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, startTs, endTs, amount } = await setupStream();

    const ts25 = startTs + Math.floor((endTs - startTs) * 0.25);
    await setTime(context, ts25);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, ts25);

    const tokenBefore = await getTokenBalance(context, recipientAta);
    await doWithdraw(streamPda, recipientAta);
    const tokenAfter = await getTokenBalance(context, recipientAta);

    const expected25 = Math.floor(amount * 0.25);
    expect(Number(tokenAfter - tokenBefore)).to.be.closeTo(expected25, 1);

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.withdrawn.toNumber()).to.be.closeTo(expected25, 1);
    expect(stream.status).to.equal(1); // still ACTIVE
  });

  it("fee is proportional to SOL price: $200 SOL → ~half the lamports", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const highPrice = 20_000_000_000n; // $200.00
    await setTime(context, endTs + 1);
    updateFeed(highPrice, PRICE_DECIMALS, endTs + 1);

    const before = await getSolBalance(context, feeVaultPda);
    await doWithdraw(streamPda, recipientAta);
    const feeReceived = Number((await getSolBalance(context, feeVaultPda)) - before);

    const expectedFee = computeFee(highPrice, PRICE_DECIMALS);
    expect(feeReceived).to.equal(expectedFee);
    expect(feeReceived).to.be.lt(EXPECTED_FEE_LAMPORTS); // fewer lamports at higher SOL price
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Access control
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with Unauthorized when non-recipient tries to withdraw", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, endTs } = await setupStream();

    await setTime(context, endTs + 1);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

    const strangerAta = await createAta(context, admin, mint, stranger.publicKey);

    await expectError(
      program.methods.withdraw(new BN(0))
        .accounts({
          recipient: stranger.publicKey,
          stream: streamPda,
          recipientAta: strangerAta,
          feeReceiver: admin.publicKey,
          chainlinkFeed: SOL_USD_FEED,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([stranger])
        .rpc(),
      "Unauthorized"
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // NothingToWithdraw
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with NothingToWithdraw before vesting has started", async () => {
    const futureStart = BASE_NOW + 500;

    await setTime(context, BASE_NOW); // create at BASE_NOW (start_ts is in future)
    const { streamPda, recipientAta } = await setupStream({
      startTs: futureStart,
      endTs: futureStart + STREAM_DURATION,
    });

    // Rewind to before stream start
    await setTime(context, futureStart - 1);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, futureStart - 1);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "NothingToWithdraw"
    );
  });

  it("fails with NothingToWithdraw in same slot as stream start (0 elapsed)", async () => {
    const futureStart = BASE_NOW + 600;

    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta } = await setupStream({
      startTs: futureStart,
      endTs: futureStart + STREAM_DURATION,
    });

    await setTime(context, futureStart); // exactly at start → 0 elapsed → 0 vested
    updateFeed(PRICE_RAW, PRICE_DECIMALS, futureStart);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "NothingToWithdraw"
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // StreamNotActive
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with StreamNotActive after stream reaches COMPLETED status", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    await setTime(context, endTs + 1);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

    // First call completes the stream
    await doWithdraw(streamPda, recipientAta);

    // Second call must fail
    await expectError(
      doWithdraw(streamPda, recipientAta),
      "NothingToWithdraw"
    );
  });

  it("fails with StreamNotActive after the stream is cancelled", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta } = await setupStream();

    await doCancel(streamPda, recipientAta);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "StreamNotActive"
    );
  });

  it("allows withdraw after a milestone stream is fully unlocked and marked COMPLETED", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, milestonePdas, amount } = await setupMilestoneStream();

    for (const milestonePda of milestonePdas) {
      await program.methods
        .unlockMilestone()
        .accountsStrict({
          creator: creator.publicKey,
          stream: streamPda,
          milestone: milestonePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    }

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.status).to.equal(2); // COMPLETED

    const beforeBalance = await getTokenBalance(context, recipientAta);
    await doWithdraw(streamPda, recipientAta);

    const afterBalance = await getTokenBalance(context, recipientAta);
    expect((afterBalance - beforeBalance).toString()).to.equal(amount.toString());
  });

  it("MILESTONE: NothingToWithdraw when no milestones are unlocked yet", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta } = await setupMilestoneStream();

    updateFeed(PRICE_RAW, PRICE_DECIMALS, BASE_NOW);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "NothingToWithdraw"
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ProtocolPaused
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with ProtocolPaused when config.paused = true", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    await setTime(context, endTs + 1);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

    // ConfigAccount layout: 8 discriminator + 32 adminAuthority + 32 feeAuthority + 1 paused
    // paused bool is at offset 72
    const PAUSED_BYTE_OFFSET = 72;
    const configRaw = await context.banksClient.getAccount(configPda);
    const configData = Buffer.from(configRaw!.data);
    const lamports = Number(configRaw!.lamports);

    // Flip paused = true
    configData.writeUInt8(1, PAUSED_BYTE_OFFSET);
    context.setAccount(configPda, {
      lamports,
      data: configData,
      owner: program.programId,
      executable: false,
    });

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "ProtocolPaused"
    );

    // Restore paused = false
    configData.writeUInt8(0, PAUSED_BYTE_OFFSET);
    context.setAccount(configPda, {
      lamports,
      data: configData,
      owner: program.programId,
      executable: false,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Oracle staleness
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with StaleOraclePrice when feed timestamp is > 3600s old", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, now - 3_601); // 1 second past the window

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "StaleOraclePrice"
    );
  });

  it("succeeds when feed is exactly 3599 seconds old (within staleness window)", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, now - 3_599);

    // Must not throw
    await doWithdraw(streamPda, recipientAta);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Oracle invalid price
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with InvalidOraclePrice when answer = 0", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(0n, PRICE_DECIMALS, now);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "InvalidOraclePrice"
    );
  });

  it("fails with InvalidOraclePrice when answer is negative (i128 < 0)", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(-1n, PRICE_DECIMALS, now); // helper handles two's complement

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "InvalidOraclePrice"
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Wrong feed address
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with InvalidOracleFeed when a different account is passed as chainlink_feed", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

    const wrongFeed = Keypair.generate().publicKey;

    await expectError(
      doWithdraw(streamPda, recipientAta, { feedAccount: wrongFeed }),
      "InvalidOracleFeed"
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Wrong fee receiver
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with ConstraintSeeds when wrong fee_vault address is passed", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, endTs } = await setupStream();

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

    await expectError(
      doWithdraw(streamPda, recipientAta, { feeVaultOverride: stranger.publicKey }),
      "ConstraintSeeds"
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Insufficient SOL for fee
  // ══════════════════════════════════════════════════════════════════════════

  it("fails when recipient has insufficient SOL to pay the fee", async () => {
    const poorRecipient = Keypair.generate();

    // Give poor recipient just 1 lamport — cannot pay the ~9.9M lamport fee
    context.setAccount(poorRecipient.publicKey, {
      lamports: 1,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    await setTime(context, BASE_NOW);
    const { streamPda, endTs } = await setupStream({
      recipientOverride: poorRecipient,
    });

    const poorAta = await createAta(context, admin, mint, poorRecipient.publicKey);

    const now = endTs + 1;
    await setTime(context, now);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

    await expectError(
      program.methods.withdraw(new BN(0))
        .accounts({
          recipient: poorRecipient.publicKey,
          stream: streamPda,
          recipientAta: poorAta,
          feeReceiver: (await program.account.configAccount.fetch(configPda)).feeAuthority,
          chainlinkFeed: SOL_USD_FEED,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([poorRecipient])
        .rpc(),
      "0x1" // Solana generic "insufficient lamports" error
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Cliff vesting: withdraw behavior at different time points
  // ══════════════════════════════════════════════════════════════════════════

  it("CLIFF: withdraw before cliff → NothingToWithdraw", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, cliffTs } = await setupCliffStream();

    // Set time just before the cliff — vested = 0
    const justBeforeCliff = cliffTs - 1;
    await setTime(context, justBeforeCliff);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, justBeforeCliff);

    await expectError(
      doWithdraw(streamPda, recipientAta),
      "NothingToWithdraw"
    );
  });

  it("CLIFF: withdraw after cliff passes → tokens claimable proportionally from startTs", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, recipientAta, startTs, endTs, amount } = await setupCliffStream();

    // 75% elapsed from startTs (past cliff which is at 50%)
    const ts75 = startTs + Math.floor((endTs - startTs) * 0.75);
    await setTime(context, ts75);
    updateFeed(PRICE_RAW, PRICE_DECIMALS, ts75);

    const tokenBefore = await getTokenBalance(context, recipientAta);
    await doWithdraw(streamPda, recipientAta);
    const tokenAfter = await getTokenBalance(context, recipientAta);

    // vested = total * 75% (linear from startTs once cliff has passed)
    const expectedTokens = Math.floor(amount * 0.75);
    expect(Number(tokenAfter - tokenBefore)).to.be.closeTo(expectedTokens, 1);

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.withdrawn.toNumber()).to.be.closeTo(expectedTokens, 1);
    expect(stream.status).to.equal(1); // still ACTIVE
  });
});
