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

async function getTokenBalance(context: ProgramTestContext, ata: PublicKey): Promise<bigint> {
  const account = await context.banksClient.getAccount(ata);
  if (!account) return 0n;
  return Buffer.from(account.data).readBigUInt64LE(64);
}

/** Runs a promise expected to reject; returns true if it threw. */
async function didThrow(promise: Promise<any>): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch {
    return true;
  }
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

describe("cei", () => {
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

  // ─── stream setup helpers ───────────────────────────────────────────────────

  async function setupLinearStream(opts: { endTs?: number; amount?: number; recipientOverride?: Keypair } = {}) {
    const nonce = new BN(nonceCounter++);
    const startTs = BASE_NOW;
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amount = opts.amount ?? TOKEN_AMOUNT;
    const rcpt = opts.recipientOverride ?? recipient;

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        rcpt.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vaultAta = getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID);
    const creatorAta = await createAta(context, admin, mint, creator.publicKey);
    await mintTokens(context, admin, mint, creatorAta, admin, amount);
    const recipientAta = await createAta(context, admin, mint, rcpt.publicKey);

    await program.methods
      .createStream(new BN(amount), new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
      .accounts({
        creator: creator.publicKey,
        recipient: rcpt.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, creatorAta, vaultAta, recipientAta, startTs, endTs, amount };
  }

  async function setupCliffStream(opts: { cliffTs?: number; endTs?: number; amount?: number } = {}) {
    const nonce = new BN(nonceCounter++);
    const startTs = BASE_NOW;
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

  function withdraw(streamPda: PublicKey, recipientAta: PublicKey, signer: Keypair) {
    return program.methods
      .withdraw()
      .accounts({
        recipient: signer.publicKey,
        stream: streamPda,
        recipientAta,
        feeVault: feeVaultPda,
        chainlinkFeed: SOL_USD_FEED,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([signer])
      .rpc();
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
  // withdraw — effects (withdrawn/status) committed before interactions (CPIs)
  // ══════════════════════════════════════════════════════════════════════════

  describe("withdraw", () => {
    it("[CEI] withdraw: the withdrawn/status effect is rolled back atomically when the fee-transfer interaction fails", async () => {
      // Recipient with only 1 lamport cannot pay the ~9.9M lamport SOL fee, so the
      // system_program::transfer (the first interaction, after the state effect) fails.
      const poor = Keypair.generate();
      context.setAccount(poor.publicKey, {
        lamports: 1,
        data: Buffer.alloc(0),
        owner: SystemProgram.programId,
        executable: false,
      });

      await setTime(context, BASE_NOW);
      const { streamPda, endTs } = await setupLinearStream({ recipientOverride: poor });
      const poorAta = await createAta(context, admin, mint, poor.publicKey);

      const now = endTs + 1;
      await setTime(context, now);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

      const threw = await didThrow(withdraw(streamPda, poorAta, poor));
      expect(threw, "withdraw should fail when the fee transfer cannot be paid").to.be.true;

      // Effect must NOT persist: no partial state from the reverted transaction.
      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.withdrawn.toNumber()).to.equal(0);
      expect(stream.status).to.equal(1); // still ACTIVE, not COMPLETED
      expect(await getTokenBalance(context, poorAta)).to.equal(0n); // no tokens moved
    });

    it("[CEI] withdraw: the withdrawn effect is committed before the interaction, so a repeat withdraw cannot double-claim → NothingToWithdraw", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, recipientAta, endTs, amount } = await setupLinearStream();

      const now = endTs + 1;
      await setTime(context, now);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, now);

      // First withdraw claims everything and commits the effect.
      await withdraw(streamPda, recipientAta, recipient);
      const afterFirst = await getTokenBalance(context, recipientAta);
      const s1 = await program.account.streamAccount.fetch(streamPda);
      expect(s1.withdrawn.toNumber()).to.equal(amount);
      expect(s1.status).to.equal(2); // COMPLETED

      // Second withdraw cannot re-claim — the committed effect guards against it.
      await expectError(withdraw(streamPda, recipientAta, recipient), "NothingToWithdraw");

      // Balance did not double.
      expect(await getTokenBalance(context, recipientAta)).to.equal(afterFirst);
    });

    it("[CEI] withdraw: on success the committed effect equals the transferred amount (effect/interaction consistency)", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, recipientAta, startTs, endTs } = await setupLinearStream();

      // 50% vested.
      const mid = startTs + Math.floor((endTs - startTs) / 2);
      await setTime(context, mid);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, mid);

      const before = await getTokenBalance(context, recipientAta);
      await withdraw(streamPda, recipientAta, recipient);
      const after = await getTokenBalance(context, recipientAta);

      const stream = await program.account.streamAccount.fetch(streamPda);
      // The persisted effect (withdrawn) exactly matches the tokens actually transferred.
      expect(Number(after - before)).to.equal(stream.withdrawn.toNumber());
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_linear — end-date effect is staged before the top-up interaction (CPI)
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_linear", () => {
    it("[CEI] edit_linear: a failing top-up rolls back the already-staged end-date effect → InsufficientBalance, end_ts & total unchanged", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, vaultAta, creatorAta, endTs, amount } = await setupLinearStream();

      await setTime(context, BASE_NOW + 10);

      // new_end_ts > end_ts stages the end-date effect in-memory; then the top-up
      // (creator holds 0 tokens) fails the balance check, reverting the whole tx.
      const newEndTs = endTs + 500;
      await expectError(
        editLinear(streamPda, vaultAta, creatorAta, newEndTs, 1),
        "InsufficientBalance"
      );

      // Neither effect persisted — atomic rollback.
      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.endTs.toNumber()).to.equal(endTs);
      expect(stream.totalAmount.toNumber()).to.equal(amount);
    });

    it("[CEI] edit_linear: a valid combined edit commits the end-date and top-up effects together atomically", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, vaultAta, creatorAta, endTs, amount } = await setupLinearStream();

      const topup = 250_000;
      await mintTokens(context, admin, mint, creatorAta, admin, topup);

      const vaultBefore = await getTokenBalance(context, vaultAta);
      const newEndTs = endTs + 500;
      await setTime(context, BASE_NOW + 10);

      await editLinear(streamPda, vaultAta, creatorAta, newEndTs, topup);

      // Both the end-date effect and the top-up interaction landed.
      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.endTs.toNumber()).to.equal(newEndTs);
      expect(stream.totalAmount.toNumber()).to.equal(amount + topup);
      expect(await getTokenBalance(context, vaultAta)).to.equal(vaultBefore + BigInt(topup));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_cliff — no external interaction; a rejected edit writes no partial state
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_cliff", () => {
    it("[CEI] edit_cliff: a rejected edit persists no partial state → StreamExpired, cliff_ts unchanged", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, cliffTs, endTs } = await setupCliffStream();

      // Past end_ts ⇒ edit_cliff is rejected with StreamExpired before any write.
      await setTime(context, endTs + 1);

      await expectError(editCliff(streamPda, endTs - 100), "StreamExpired");

      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.cliffTs.toNumber()).to.equal(cliffTs); // unchanged
    });
  });
});
