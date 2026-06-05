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
import { UnifiedFlow } from "../target/types/unified_flow";
import IDL from "../target/idl/unified_flow.json";
import { expect } from "chai";

// ─── Chainlink mock constants (must match lib.rs) — needed for withdraw ──────

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

const PRICE_DECIMALS = 8;
const PRICE_RAW = 10_000_000_000n; // $100.00

const VESTING_TYPE_LINEAR = 0;
const VESTING_TYPE_CLIFF = 1;

const BASE_NOW = 1_700_000_000;
const STREAM_DURATION = 1_000;
const TOKEN_AMOUNT = 1_000_000;

const U64_MAX = 18_446_744_073_709_551_615n;
const I64_MAX = new BN("9223372036854775807");
const I64_MIN = new BN("-9223372036854775808");

// StreamAccount field byte offsets (8-byte discriminator + packed borsh fields).
// creator(32) recipient(32) mint(32) vault(32) total_amount(u64) withdrawn(u64) ...
const STREAM_TOTAL_AMOUNT_OFFSET = 8 + 32 * 4; // 136
const STREAM_WITHDRAWN_OFFSET = STREAM_TOTAL_AMOUNT_OFFSET + 8; // 144

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
  let p = priceRaw < 0n ? (1n << 128n) + priceRaw : priceRaw;
  for (let i = 0; i < 16; i++) {
    buf.writeUInt8(Number(p & 0xffn), FEED_ANSWER_OFFSET + i);
    p >>= 8n;
  }
  return buf;
}

async function setTime(context: ProgramTestContext, unixTs: number) {
  await context.setClock(new Clock(0n, 0n, 0n, 0n, BigInt(unixTs)));
}

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

/** Asserts that a promise rejects with an error matching the given fragment. */
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
    expect(combined, `Error "${fragment}" not found in: ${combined.slice(0, 400)}`).to.include(fragment);
  }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("overflow", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<UnifiedFlow>;

  let admin: Keypair;
  let creator: Keypair;
  let recipient: Keypair;

  let mint: PublicKey;
  let configPda: PublicKey;
  let feeVaultPda: PublicKey;

  let nonceCounter = 0;

  before(async () => {
    admin = Keypair.generate();
    creator = Keypair.generate();
    recipient = Keypair.generate();

    const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, BASE_NOW);

    context = await startAnchor(".", [], [
      { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: creator.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: recipient.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: SOL_USD_FEED, info: { lamports: 1e9, data: feedData, owner: CHAINLINK_PROGRAM_ID, executable: false } },
    ]);

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

    await setTime(context, BASE_NOW);

    [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
    [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], program.programId);

    await program.methods
      .initializeConfig()
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();

    mint = await createTestMint(context, admin, admin.publicKey, 6);
  });

  /** Updates the mock Chainlink feed account in-place. */
  function updateFeed(priceRaw: bigint, decimals: number, updatedAt: number) {
    context.setAccount(SOL_USD_FEED, {
      lamports: 1e9,
      data: buildFeedData(priceRaw, decimals, updatedAt),
      owner: CHAINLINK_PROGRAM_ID,
      executable: false,
    });
  }

  /** Overwrites a u64 LE field inside the raw StreamAccount data via bankrun. */
  async function patchStreamU64(streamPda: PublicKey, offset: number, value: bigint) {
    const raw = await context.banksClient.getAccount(streamPda);
    if (!raw) throw new Error("stream account not found");
    const data = Buffer.from(raw.data);
    data.writeBigUInt64LE(value, offset);
    context.setAccount(streamPda, {
      lamports: Number(raw.lamports),
      data,
      owner: program.programId,
      executable: false,
    });
  }

  // ─── stream setup helpers ───────────────────────────────────────────────────

  async function setupLinearStream(opts: { startTs?: number; endTs?: number; amount?: number } = {}) {
    const nonce = new BN(nonceCounter++);
    const startTs = opts.startTs ?? BASE_NOW;
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vaultAta = getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID);
    const creatorAta = await createAta(context, admin, mint, creator.publicKey);
    await mintTokens(context, admin, mint, creatorAta, admin, amount);
    const recipientAta = await createAta(context, admin, mint, recipient.publicKey);

    await program.methods
      .createStream(new BN(amount), new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, creatorAta, vaultAta, recipientAta, startTs, endTs, amount };
  }

  async function setupCliffStream(opts: { startTs?: number; cliffTs?: number; endTs?: number; amount?: number } = {}) {
    const nonce = new BN(nonceCounter++);
    const startTs = opts.startTs ?? BASE_NOW;
    const cliffTs = opts.cliffTs ?? BASE_NOW + Math.floor(STREAM_DURATION / 2);
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const creatorAta = await createAta(context, admin, mint, creator.publicKey);
    await mintTokens(context, admin, mint, creatorAta, admin, amount);
    const recipientAta = await createAta(context, admin, mint, recipient.publicKey);

    await program.methods
      .createStream(new BN(amount), new BN(startTs), new BN(cliffTs), new BN(endTs), VESTING_TYPE_CLIFF, [], nonce)
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, creatorAta, recipientAta, startTs, cliffTs, endTs, amount };
  }

  // ─── instruction call helpers ───────────────────────────────────────────────

  function withdraw(streamPda: PublicKey, recipientAta: PublicKey) {
    return program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        stream: streamPda,
        recipientAta,
        feeVault: feeVaultPda,
        chainlinkFeed: SOL_USD_FEED,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([recipient])
      .rpc();
  }

  function editLinear(
    streamPda: PublicKey,
    vaultAta: PublicKey,
    creatorTokenAccount: PublicKey,
    newEndTs: number,
    topup: bigint
  ) {
    return program.methods
      .editLinear(new BN(newEndTs), new BN(topup.toString()))
      .accounts({
        creator: creator.publicKey,
        mint,
        stream: streamPda,
        vault: vaultAta,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();
  }

  function editCliff(streamPda: PublicKey, newCliffTs: BN) {
    return program.methods
      .editCliff(newCliffTs)
      .accounts({
        creator: creator.publicKey,
        stream: streamPda,
      })
      .signers([creator])
      .rpc();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // withdraw — checked arithmetic guarded by MathOverflow
  // ══════════════════════════════════════════════════════════════════════════

  describe("withdraw", () => {
    it("[OVERFLOW] withdraw: oracle decimals=39 makes 10^decimals overflow u128 → MathOverflow", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, recipientAta, endTs } = await setupLinearStream();

      const now = endTs + 1;
      await setTime(context, now);
      // decimals_factor = 10u128.checked_pow(39) overflows u128 (max ~3.4e38).
      updateFeed(PRICE_RAW, 39, now);

      await expectError(withdraw(streamPda, recipientAta), "MathOverflow");
    });

    it("[OVERFLOW] withdraw: withdrawn > vested makes claimable subtraction underflow → MathOverflow", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, recipientAta, endTs, amount } = await setupLinearStream();

      // Fully vested (now >= end_ts ⇒ vested = total_amount). Force withdrawn past total
      // so `vested.checked_sub(withdrawn)` underflows.
      await patchStreamU64(streamPda, STREAM_WITHDRAWN_OFFSET, BigInt(amount) + 1n);

      const now = endTs + 1;
      await setTime(context, now);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

      await expectError(withdraw(streamPda, recipientAta), "MathOverflow");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_linear — total_amount.checked_add(topup_amount) guarded by MathOverflow
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_linear", () => {
    it("[OVERFLOW] edit_linear: total_amount at u64::MAX + topup overflows → MathOverflow", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, vaultAta, creatorAta, endTs } = await setupLinearStream();

      // Drive total_amount to u64::MAX so any positive top-up overflows the checked_add.
      await patchStreamU64(streamPda, STREAM_TOTAL_AMOUNT_OFFSET, U64_MAX);

      // Creator must hold >= topup so the balance check passes and we reach the checked_add.
      await mintTokens(context, admin, mint, creatorAta, admin, 100);

      await setTime(context, BASE_NOW + 10);

      // new_end_ts == end_ts (no extend) → only the top-up path runs.
      await expectError(editLinear(streamPda, vaultAta, creatorAta, endTs, 1n), "MathOverflow");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_cliff — no checked arithmetic; assert extreme i64 inputs are safe
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_cliff", () => {
    it("[OVERFLOW] edit_cliff: i64::MAX cliff is safely rejected (no overflow/panic) → InvalidCliff", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda } = await setupCliffStream();

      await setTime(context, BASE_NOW + 10);

      // new_cliff_ts > end_ts ⇒ validated, not a panic/overflow.
      await expectError(editCliff(streamPda, I64_MAX), "InvalidCliff");
    });

    it("[OVERFLOW] edit_cliff: i64::MIN cliff is safely rejected (no overflow/panic) → InvalidCliff", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda } = await setupCliffStream();

      await setTime(context, BASE_NOW + 10);

      // new_cliff_ts < start_ts ⇒ validated, not a panic/overflow.
      await expectError(editCliff(streamPda, I64_MIN), "InvalidCliff");
    });
  });
});
