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

const VESTING_TYPE_LINEAR = 0;
const VESTING_TYPE_CLIFF = 1;
const VESTING_TYPE_MILESTONE = 2;

const BASE_NOW = 1_700_000_000;
const STREAM_DURATION = 1_000; // seconds
const TOKEN_AMOUNT = 1_000_000; // 1 token (6 decimals)

describe("cancel", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<SolanaProgram>;

  let admin: Keypair;
  let creator: Keypair;
  let recipient: Keypair;
  let stranger: Keypair;

  let mint: PublicKey;

  let nonceCounter = 0;

  // ─── Low-level helpers ──────────────────────────────────────────────────────

  async function sendIx(
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

  async function setTime(unixTs: number) {
    await context.setClock(new Clock(0n, 0n, 0n, 0n, BigInt(unixTs)));
  }

  async function createTestMint(payer: Keypair, decimals: number): Promise<PublicKey> {
    const mintKp = Keypair.generate();
    const rent = await context.banksClient.getRent();
    const lamports = rent.minimumBalance(BigInt(MINT_SIZE));
    await sendIx(
      payer,
      [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: mintKp.publicKey,
          space: MINT_SIZE,
          lamports: Number(lamports),
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mintKp.publicKey, decimals, payer.publicKey, null),
      ],
      [mintKp]
    );
    return mintKp.publicKey;
  }

  async function createAta(mintPk: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mintPk, owner, true, TOKEN_PROGRAM_ID);
    await sendIx(admin, [
      createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        ata,
        owner,
        mintPk,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
    ]);
    return ata;
  }

  async function mintTokensTo(destination: PublicKey, amount: number) {
    await sendIx(admin, [
      createMintToInstruction(mint, destination, admin.publicKey, amount),
    ]);
  }

  async function getTokenBalance(ata: PublicKey): Promise<bigint> {
    const account = await context.banksClient.getAccount(ata);
    if (!account) return 0n;
    return Buffer.from(account.data).readBigUInt64LE(64);
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
      expect(
        combined,
        `Error "${fragment}" not found in: ${combined.slice(0, 400)}`
      ).to.include(fragment);
    }
  }

  // ─── Stream setup helpers ───────────────────────────────────────────────────

  interface StreamSetup {
    streamPda: PublicKey;
    vaultAta: PublicKey;
    creatorAta: PublicKey;
    recipientAta: PublicKey;
    startTs: number;
    endTs: number;
    amount: number;
    nonce: BN;
  }

  async function setupLinearStream(
    opts: { startTs?: number; endTs?: number; amount?: number } = {}
  ): Promise<StreamSetup> {
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
    const creatorAta = await createAta(mint, creator.publicKey);
    const recipientAta = await createAta(mint, recipient.publicKey);
    await mintTokensTo(creatorAta, amount);

    await program.methods
      .createStream(
        new BN(amount),
        new BN(startTs),
        new BN(startTs), // cliffTs = startTs (no cliff for linear)
        new BN(endTs),
        VESTING_TYPE_LINEAR,
        [],
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, vaultAta, creatorAta, recipientAta, startTs, endTs, amount, nonce };
  }

  async function setupCliffStream(opts: {
    startTs?: number;
    cliffTs?: number;
    endTs?: number;
    amount?: number;
  } = {}): Promise<StreamSetup & { cliffTs: number }> {
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
    const creatorAta = await createAta(mint, creator.publicKey);
    const recipientAta = await createAta(mint, recipient.publicKey);
    await mintTokensTo(creatorAta, amount);

    await program.methods
      .createStream(
        new BN(amount),
        new BN(startTs),
        new BN(cliffTs),
        new BN(endTs),
        VESTING_TYPE_CLIFF,
        [],
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    return { streamPda, vaultAta, creatorAta, recipientAta, startTs, endTs, amount, nonce, cliffTs };
  }

  interface MilestoneStreamSetup extends StreamSetup {
    milestonePdas: PublicKey[];
  }

  async function setupMilestoneStream(
    milestoneAmounts: number[]
  ): Promise<MilestoneStreamSetup> {
    const nonce = new BN(nonceCounter++);
    const total = milestoneAmounts.reduce((a, b) => a + b, 0);

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
    const creatorAta = await createAta(mint, creator.publicKey);
    const recipientAta = await createAta(mint, recipient.publicKey);
    await mintTokensTo(creatorAta, total);

    const milestonePdas = milestoneAmounts.map((_, i) => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPda.toBuffer(), Buffer.from([i])],
        program.programId
      );
      return pda;
    });

    const remainingAccounts = milestonePdas.map((pubkey) => ({
      pubkey,
      isWritable: true,
      isSigner: false,
    }));

    await program.methods
      .createStream(
        new BN(total),
        new BN(BASE_NOW),
        new BN(BASE_NOW),
        new BN(BASE_NOW + STREAM_DURATION),
        VESTING_TYPE_MILESTONE,
        milestoneAmounts.map((a) => ({ amount: new BN(a) })),
        nonce
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

    return {
      streamPda, vaultAta, creatorAta, recipientAta,
      startTs: BASE_NOW, endTs: BASE_NOW + STREAM_DURATION,
      amount: total, nonce, milestonePdas,
    };
  }

  async function doCancel(
    streamPda: PublicKey,
    creatorAta: PublicKey,
    recipientAta: PublicKey,
    opts: { signer?: Keypair } = {}
  ) {
    const signer = opts.signer ?? creator;
    return program.methods
      .cancel()
      .accountsStrict({
        creator: signer.publicKey,
        mint,
        stream: streamPda,
        vault: getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID),
        creatorTokenAccount: creatorAta,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();
  }

  // ─── One-time setup ─────────────────────────────────────────────────────────

  before(async () => {
    admin = Keypair.generate();
    creator = Keypair.generate();
    recipient = Keypair.generate();
    stranger = Keypair.generate();

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
    ]);

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<SolanaProgram>(IDL as SolanaProgram, provider);

    await setTime(BASE_NOW);

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    await program.methods
      .initializeConfig()
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();

    mint = await createTestMint(admin, 6);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LINEAR — happy path
  // ══════════════════════════════════════════════════════════════════════════

  it("LINEAR: cancel at t=start (0% vested) → creator gets all tokens back", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, amount } = await setupLinearStream();

    // cancel exactly at start_ts — elapsed = 0 → vested = 0
    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    expect(creatorGain).to.equal(amount);
    expect(recipientGain).to.equal(0);
  });

  it("LINEAR: cancel at 50% vested → even split between creator and recipient", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, startTs, endTs, amount } =
      await setupLinearStream();

    const midTs = startTs + Math.floor((endTs - startTs) / 2);
    await setTime(midTs);

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);
    const expected50pct = Math.floor(amount / 2);

    expect(creatorGain).to.be.closeTo(expected50pct, 1);
    expect(recipientGain).to.be.closeTo(expected50pct, 1);
    expect(creatorGain + recipientGain).to.equal(amount);
  });

  it("LINEAR: cancel at 25% vested → 25% to recipient, 75% to creator", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, startTs, endTs, amount } =
      await setupLinearStream();

    const ts25 = startTs + Math.floor((endTs - startTs) * 0.25);
    await setTime(ts25);

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    expect(recipientGain).to.be.closeTo(Math.floor(amount * 0.25), 1);
    expect(creatorGain).to.be.closeTo(Math.floor(amount * 0.75), 1);
    expect(creatorGain + recipientGain).to.equal(amount);
  });

  it("LINEAR: stream state is cancelled=true, status=3 after cancel", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta } = await setupLinearStream();

    await doCancel(streamPda, creatorAta, recipientAta);

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.cancelled).to.equal(true);
    expect(stream.status).to.equal(3); // STREAM_STATUS_CANCELLED
  });

  it("LINEAR: vault is empty after cancel (no tokens left)", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, vaultAta, startTs, endTs } =
      await setupLinearStream();

    await setTime(startTs + Math.floor((endTs - startTs) / 3));
    await doCancel(streamPda, creatorAta, recipientAta);

    const vaultBalance = await getTokenBalance(vaultAta);
    expect(Number(vaultBalance)).to.equal(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CLIFF — happy path
  // ══════════════════════════════════════════════════════════════════════════

  it("CLIFF: cancel before cliff → creator gets all tokens back (vested=0)", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, cliffTs, amount } =
      await setupCliffStream();

    // Set time just before cliff
    await setTime(cliffTs - 1);

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    expect(creatorGain).to.equal(amount);
    expect(recipientGain).to.equal(0);
  });

  it("CLIFF: cancel after cliff (75% elapsed) → proportional split based on elapsed from start", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, startTs, endTs, amount } =
      await setupCliffStream();

    // 75% through the vesting period (past cliff at 50%)
    const ts75 = startTs + Math.floor((endTs - startTs) * 0.75);
    await setTime(ts75);

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    // vested = total * 75% (elapsed from start_ts)
    expect(recipientGain).to.be.closeTo(Math.floor(amount * 0.75), 1);
    expect(creatorGain).to.be.closeTo(Math.floor(amount * 0.25), 1);
    expect(creatorGain + recipientGain).to.equal(amount);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MILESTONE — happy path
  // ══════════════════════════════════════════════════════════════════════════

  it("MILESTONE: cancel with 0/4 milestones unlocked → creator gets all tokens back", async () => {
    await setTime(BASE_NOW);
    const perMilestone = TOKEN_AMOUNT / 4;
    const { streamPda, creatorAta, recipientAta, amount } =
      await setupMilestoneStream([perMilestone, perMilestone, perMilestone, perMilestone]);

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    expect(creatorGain).to.equal(amount);
    expect(recipientGain).to.equal(0);
  });

  it("MILESTONE: cancel with 1/4 milestones unlocked → 25% to recipient, 75% to creator", async () => {
    await setTime(BASE_NOW);
    const perMilestone = TOKEN_AMOUNT / 4;
    const milestoneAmounts = [perMilestone, perMilestone, perMilestone, perMilestone];
    const { streamPda, creatorAta, recipientAta, milestonePdas, amount } =
      await setupMilestoneStream(milestoneAmounts);

    // Unlock only the first milestone
    await program.methods
      .unlockMilestone()
      .accountsStrict({
        creator: creator.publicKey,
        stream: streamPda,
        milestone: milestonePdas[0],
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    expect(recipientGain).to.equal(perMilestone); // 1 unlocked milestone
    expect(creatorGain).to.equal(amount - perMilestone); // remaining 3 milestones
    expect(creatorGain + recipientGain).to.equal(amount);
  });

  it("MILESTONE: cancel with 2/4 milestones unlocked → 50% to recipient, 50% to creator", async () => {
    await setTime(BASE_NOW);
    const perMilestone = TOKEN_AMOUNT / 4;
    const milestoneAmounts = [perMilestone, perMilestone, perMilestone, perMilestone];
    const { streamPda, creatorAta, recipientAta, milestonePdas, amount } =
      await setupMilestoneStream(milestoneAmounts);

    // Unlock first two milestones (must be sequential)
    for (let i = 0; i < 2; i++) {
      await program.methods
        .unlockMilestone()
        .accountsStrict({
          creator: creator.publicKey,
          stream: streamPda,
          milestone: milestonePdas[i],
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    }

    const creatorBefore = await getTokenBalance(creatorAta);
    const recipientBefore = await getTokenBalance(recipientAta);

    await doCancel(streamPda, creatorAta, recipientAta);

    const creatorGain = Number((await getTokenBalance(creatorAta)) - creatorBefore);
    const recipientGain = Number((await getTokenBalance(recipientAta)) - recipientBefore);

    expect(recipientGain).to.equal(perMilestone * 2);
    expect(creatorGain).to.equal(perMilestone * 2);
    expect(creatorGain + recipientGain).to.equal(amount);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Error cases
  // ══════════════════════════════════════════════════════════════════════════

  it("fails with AlreadyCancelled when cancelling a stream twice", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta } = await setupLinearStream();

    await doCancel(streamPda, creatorAta, recipientAta);

    // Advance clock so bankrun generates a different blockhash for the second tx
    await setTime(BASE_NOW + 1);

    await expectError(
      doCancel(streamPda, creatorAta, recipientAta),
      "AlreadyCancelled"
    );
  });

  it("fails with FullyVested when cancelling after end_ts", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, endTs } = await setupLinearStream();

    await setTime(endTs + 1);

    await expectError(
      doCancel(streamPda, creatorAta, recipientAta),
      "FullyVested"
    );
  });

  it("fails with FullyVested when cancelling exactly at end_ts", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, endTs } = await setupLinearStream();

    await setTime(endTs);

    await expectError(
      doCancel(streamPda, creatorAta, recipientAta),
      "FullyVested"
    );
  });

  it("fails with Unauthorized when non-creator (recipient) tries to cancel", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta } = await setupLinearStream();

    const recipientAta2 = await createAta(mint, recipient.publicKey);

    await expectError(
      program.methods
        .cancel()
        .accountsStrict({
          creator: recipient.publicKey, // wrong signer
          mint,
          stream: streamPda,
          vault: getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID),
          creatorTokenAccount: creatorAta,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  it("fails with Unauthorized when stranger tries to cancel", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta } = await setupLinearStream();

    const strangerAta = await createAta(mint, stranger.publicKey);

    await expectError(
      program.methods
        .cancel()
        .accountsStrict({
          creator: stranger.publicKey,
          mint,
          stream: streamPda,
          vault: getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID),
          creatorTokenAccount: strangerAta,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([stranger])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  it("CLIFF: fails with FullyVested when cancelling after end_ts", async () => {
    await setTime(BASE_NOW);
    const { streamPda, creatorAta, recipientAta, endTs } = await setupCliffStream();

    await setTime(endTs + 1);

    await expectError(
      doCancel(streamPda, creatorAta, recipientAta),
      "FullyVested"
    );
  });
});
