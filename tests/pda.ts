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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFeedData(priceRaw: bigint, decimals: number, updatedAt: number): Buffer {
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
    expect(combined, `Error "${fragment}" not found in: ${combined.slice(0, 500)}`).to.include(fragment);
  }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("pda", () => {
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

  function updateFeed(priceRaw: bigint, decimals: number, updatedAt: number) {
    context.setAccount(SOL_USD_FEED, {
      lamports: 1e9,
      data: buildFeedData(priceRaw, decimals, updatedAt),
      owner: CHAINLINK_PROGRAM_ID,
      executable: false,
    });
  }

  /** Derives the canonical stream PDA for (creator, recipient, nonce). */
  function deriveStreamPda(nonce: BN): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    return pda;
  }

  /**
   * Copies a real, valid stream account byte-for-byte to a fresh, non-canonical
   * address. The stored seeds (creator, recipient, nonce, bump) still resolve to
   * the *original* PDA, so any instruction validating `seeds`/`bump` against this
   * forged address must reject it with ConstraintSeeds.
   */
  async function forgeStreamCopy(realPda: PublicKey): Promise<PublicKey> {
    const raw = await context.banksClient.getAccount(realPda);
    if (!raw) throw new Error("stream account not found");
    const forged = Keypair.generate().publicKey;
    context.setAccount(forged, {
      lamports: Number(raw.lamports),
      data: Buffer.from(raw.data),
      owner: program.programId,
      executable: false,
    });
    return forged;
  }

  // ─── stream setup helpers (return the nonce so callers can re-derive PDAs) ───

  async function setupLinearStream(opts: { endTs?: number; amount?: number } = {}) {
    const nonce = new BN(nonceCounter++);
    const startTs = BASE_NOW;
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;

    const streamPda = deriveStreamPda(nonce);
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

    return { nonce, streamPda, creatorAta, vaultAta, recipientAta, startTs, endTs, amount };
  }

  async function setupCliffStream(opts: { cliffTs?: number; endTs?: number; amount?: number } = {}) {
    const nonce = new BN(nonceCounter++);
    const startTs = BASE_NOW;
    const cliffTs = opts.cliffTs ?? BASE_NOW + Math.floor(STREAM_DURATION / 2);
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;

    const streamPda = deriveStreamPda(nonce);
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

    return { nonce, streamPda, creatorAta, recipientAta, startTs, cliffTs, endTs, amount };
  }

  // ─── instruction call helpers ───────────────────────────────────────────────

  function withdraw(streamPda: PublicKey, recipientAta: PublicKey, vaultOverride?: PublicKey) {
    const accounts: any = {
      recipient: recipient.publicKey,
      stream: streamPda,
      recipientAta,
      feeVault: feeVaultPda,
      chainlinkFeed: SOL_USD_FEED,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
    if (vaultOverride) accounts.vault = vaultOverride;
    return program.methods.withdraw().accounts(accounts).signers([recipient]).rpc();
  }

  function editLinear(
    streamPda: PublicKey,
    vaultAta: PublicKey,
    creatorTokenAccount: PublicKey,
    newEndTs: number,
    topup: number
  ) {
    return program.methods
      .editLinear(new BN(newEndTs), new BN(topup))
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

  function editCliff(streamPda: PublicKey, newCliffTs: number) {
    return program.methods
      .editCliff(new BN(newCliffTs))
      .accounts({ creator: creator.publicKey, stream: streamPda })
      .signers([creator])
      .rpc();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // withdraw — vault is bound to the stream PDA (associated_token::authority)
  // ══════════════════════════════════════════════════════════════════════════

  describe("withdraw", () => {
    it("[PDA] withdraw: a vault belonging to a different stream is rejected with ConstraintTokenOwner (cross-stream vault)", async () => {
      await setTime(context, BASE_NOW);
      const streamA = await setupLinearStream();
      const streamB = await setupLinearStream();

      const now = streamA.endTs + 1;
      await setTime(context, now);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

      // Operate on stream A but inject stream B's vault (ATA of a different PDA).
      await expectError(
        withdraw(streamA.streamPda, streamA.recipientAta, streamB.vaultAta),
        "ConstraintTokenOwner"
      );
    });

    it("[PDA] withdraw: sibling streams (same creator+recipient, different nonce) derive distinct PDAs and withdraw is isolated", async () => {
      await setTime(context, BASE_NOW);
      const streamA = await setupLinearStream();
      const streamB = await setupLinearStream();

      // Seed uniqueness: only the nonce differs, yet the PDAs are distinct.
      expect(streamA.streamPda.toBase58()).to.not.equal(streamB.streamPda.toBase58());

      const now = streamA.endTs + 1;
      await setTime(context, now);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

      // Fully withdraw from A only.
      await withdraw(streamA.streamPda, streamA.recipientAta);

      const a = await program.account.streamAccount.fetch(streamA.streamPda);
      const b = await program.account.streamAccount.fetch(streamB.streamPda);
      expect(a.withdrawn.toNumber()).to.equal(streamA.amount);
      expect(a.status).to.equal(2); // COMPLETED
      // Sibling stream is completely untouched.
      expect(b.withdrawn.toNumber()).to.equal(0);
      expect(b.status).to.equal(1); // ACTIVE
    });

    it("[PDA] withdraw: a forged stream account placed at a non-canonical address is rejected with ConstraintSeeds", async () => {
      await setTime(context, BASE_NOW);
      const real = await setupLinearStream();
      const forged = await forgeStreamCopy(real.streamPda);

      const now = real.endTs + 1;
      await setTime(context, now);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

      // Pass the real vault explicitly; the stream seeds check is validated first.
      await expectError(withdraw(forged, real.recipientAta, real.vaultAta), "ConstraintSeeds");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_linear — vault is bound to the stream PDA (associated_token::authority)
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_linear", () => {
    it("[PDA] edit_linear: a vault belonging to a different stream is rejected with ConstraintTokenOwner (cross-stream vault)", async () => {
      await setTime(context, BASE_NOW);
      const streamA = await setupLinearStream();
      const streamB = await setupLinearStream();

      await setTime(context, BASE_NOW + 10);

      // Edit stream A but inject stream B's vault.
      await expectError(
        editLinear(streamA.streamPda, streamB.vaultAta, streamA.creatorAta, streamA.endTs + 500, 0),
        "ConstraintTokenOwner"
      );
    });

    it("[PDA] edit_linear: sibling streams derive distinct PDAs; editing one leaves the other untouched", async () => {
      await setTime(context, BASE_NOW);
      const streamA = await setupLinearStream();
      const streamB = await setupLinearStream();

      expect(streamA.streamPda.toBase58()).to.not.equal(streamB.streamPda.toBase58());

      const newEndTs = streamA.endTs + 500;
      await setTime(context, BASE_NOW + 10);

      await editLinear(streamA.streamPda, streamA.vaultAta, streamA.creatorAta, newEndTs, 0);

      const a = await program.account.streamAccount.fetch(streamA.streamPda);
      const b = await program.account.streamAccount.fetch(streamB.streamPda);
      expect(a.endTs.toNumber()).to.equal(newEndTs);
      // Sibling stream's schedule is unchanged.
      expect(b.endTs.toNumber()).to.equal(streamB.endTs);
    });

    it("[PDA] edit_linear: a forged stream account placed at a non-canonical address is rejected with ConstraintSeeds", async () => {
      await setTime(context, BASE_NOW);
      const real = await setupLinearStream();
      const forged = await forgeStreamCopy(real.streamPda);

      await setTime(context, BASE_NOW + 10);

      // Pass the real vault/creator ATA explicitly; the stream seeds check is validated first.
      await expectError(
        editLinear(forged, real.vaultAta, real.creatorAta, real.endTs + 500, 0),
        "ConstraintSeeds"
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_cliff — stream PDA uniqueness / cross-stream isolation
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_cliff", () => {
    it("[PDA] edit_cliff: sibling cliff streams derive distinct PDAs; editing one leaves the other's cliff untouched", async () => {
      await setTime(context, BASE_NOW);
      const streamA = await setupCliffStream();
      const streamB = await setupCliffStream();

      expect(streamA.streamPda.toBase58()).to.not.equal(streamB.streamPda.toBase58());

      const newCliffTs = streamA.endTs - 200;
      await setTime(context, BASE_NOW + 10);

      await editCliff(streamA.streamPda, newCliffTs);

      const a = await program.account.streamAccount.fetch(streamA.streamPda);
      const b = await program.account.streamAccount.fetch(streamB.streamPda);
      expect(a.cliffTs.toNumber()).to.equal(newCliffTs);
      // Sibling stream's cliff is unchanged.
      expect(b.cliffTs.toNumber()).to.equal(streamB.cliffTs);
    });

    it("[PDA] edit_cliff: the canonical (creator, recipient, nonce) PDA is the one the program validates", async () => {
      await setTime(context, BASE_NOW);
      const streamA = await setupCliffStream();

      // The PDA the test re-derives must equal the account the program accepts.
      expect(streamA.streamPda.toBase58()).to.equal(deriveStreamPda(streamA.nonce).toBase58());

      const newCliffTs = streamA.endTs - 100;
      await setTime(context, BASE_NOW + 10);

      // Editing through the canonical PDA succeeds.
      await editCliff(streamA.streamPda, newCliffTs);

      const a = await program.account.streamAccount.fetch(streamA.streamPda);
      expect(a.cliffTs.toNumber()).to.equal(newCliffTs);
    });

    it("[PDA] edit_cliff: a forged stream account placed at a non-canonical address is rejected with ConstraintSeeds", async () => {
      await setTime(context, BASE_NOW);
      const real = await setupCliffStream();
      const forged = await forgeStreamCopy(real.streamPda);

      await setTime(context, BASE_NOW + 10);

      await expectError(editCliff(forged, real.endTs - 200), "ConstraintSeeds");
    });
  });
});
