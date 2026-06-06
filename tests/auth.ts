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

describe("auth", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<UnifiedFlow>;

  let admin: Keypair;
  let creator: Keypair;
  let recipient: Keypair;
  let stranger: Keypair;

  let mint: PublicKey;
  let configPda: PublicKey;
  let feeVaultPda: PublicKey;

  let nonceCounter = 0;

  before(async () => {
    admin = Keypair.generate();
    creator = Keypair.generate();
    recipient = Keypair.generate();
    stranger = Keypair.generate();

    const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, BASE_NOW);

    context = await startAnchor(".", [], [
      { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: creator.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: recipient.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: stranger.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
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

    const vaultAta = getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID);
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

    return { streamPda, creatorAta, vaultAta, recipientAta, startTs, cliffTs, endTs, amount };
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
    topup: number,
    signer: Keypair
  ) {
    return program.methods
      .editLinear(new BN(newEndTs), new BN(topup))
      .accountsStrict({
        creator: signer.publicKey,
        mint,
        config: configPda,
        stream: streamPda,
        vault: vaultAta,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();
  }

  function editCliff(streamPda: PublicKey, newCliffTs: number, signer: Keypair) {
    return program.methods
      .editCliff(new BN(newCliffTs))
      .accounts({
        creator: signer.publicKey,
        stream: streamPda,
      })
      .signers([signer])
      .rpc();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // withdraw — only the stream recipient may withdraw
  // ══════════════════════════════════════════════════════════════════════════

  describe("withdraw", () => {
    it("[AUTH] withdraw: a random signer (not the recipient) is rejected with Unauthorized", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, endTs } = await setupLinearStream();

      await setTime(context, endTs + 1);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

      const strangerAta = await createAta(context, admin, mint, stranger.publicKey);

      await expectError(withdraw(streamPda, strangerAta, stranger), "Unauthorized");
    });

    it("[AUTH] withdraw: the creator cannot withdraw the recipient's funds → Unauthorized", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, endTs } = await setupLinearStream();

      await setTime(context, endTs + 1);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

      const creatorAta = await createAta(context, admin, mint, creator.publicKey);

      await expectError(withdraw(streamPda, creatorAta, creator), "Unauthorized");
    });

    it("[AUTH] withdraw: the legitimate recipient is authorized and succeeds", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, recipientAta, endTs } = await setupLinearStream();

      await setTime(context, endTs + 1);
      updateFeed(PRICE_RAW, PRICE_DECIMALS, endTs + 1);

      // Must not throw — recipient is the authorized party.
      await withdraw(streamPda, recipientAta, recipient);

      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.withdrawn.toNumber()).to.be.greaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_cliff — only the stream creator may edit the cliff
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_cliff", () => {
    it("[AUTH] edit_cliff: a random signer (not the creator) is rejected with Unauthorized", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, endTs } = await setupCliffStream();

      await setTime(context, BASE_NOW + 10);

      await expectError(editCliff(streamPda, endTs - 200, stranger), "Unauthorized");
    });

    it("[AUTH] edit_cliff: the recipient cannot edit the cliff", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, endTs } = await setupCliffStream();

      await setTime(context, BASE_NOW + 10);

      await expectError(editCliff(streamPda, endTs - 200, recipient), "Unauthorized");
    });

    it("[AUTH] edit_cliff: the legitimate creator is authorized and succeeds", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, endTs } = await setupCliffStream();

      const newCliffTs = endTs - 200;
      await setTime(context, BASE_NOW + 10);

      // Must not throw — creator is the authorized party.
      await editCliff(streamPda, newCliffTs, creator);

      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.cliffTs.toNumber()).to.equal(newCliffTs);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // edit_linear — only the stream creator may edit the linear schedule
  // ══════════════════════════════════════════════════════════════════════════

  describe("edit_linear", () => {
    it("[AUTH] edit_linear: a random signer (not the creator) is rejected with Unauthorized", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, vaultAta, endTs } = await setupLinearStream();

      await setTime(context, BASE_NOW + 10);

      // Give the stranger an ATA so the only failing constraint is the auth check.
      const strangerAta = await createAta(context, admin, mint, stranger.publicKey);

      await expectError(
        editLinear(streamPda, vaultAta, strangerAta, endTs + 500, 0, stranger),
        "Unauthorized"
      );
    });

    it("[AUTH] edit_linear: the recipient cannot edit the linear schedule", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, vaultAta, recipientAta, endTs } = await setupLinearStream();

      await setTime(context, BASE_NOW + 10);

      await expectError(
        editLinear(streamPda, vaultAta, recipientAta, endTs + 500, 0, recipient),
        "Unauthorized"
      );
    });

    it("[AUTH] edit_linear: the legitimate creator is authorized and succeeds", async () => {
      await setTime(context, BASE_NOW);
      const { streamPda, vaultAta, creatorAta, endTs } = await setupLinearStream();

      const newEndTs = endTs + 500;
      await setTime(context, BASE_NOW + 10);

      // Must not throw — creator is the authorized party (no topup, schedule edit only).
      await editLinear(streamPda, vaultAta, creatorAta, newEndTs, 0, creator);

      const stream = await program.account.streamAccount.fetch(streamPda);
      expect(stream.endTs.toNumber()).to.equal(newEndTs);
    });
  });
});
