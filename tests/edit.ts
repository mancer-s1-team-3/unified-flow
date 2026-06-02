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

const VESTING_TYPE_LINEAR = 0;
const VESTING_TYPE_CLIFF = 1;

const BASE_NOW = 1_700_000_000;
const STREAM_DURATION = 1_000;
const TOKEN_AMOUNT = 1_000_000;

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

async function setTime(context: ProgramTestContext, unixTs: number) {
  await context.setClock(new Clock(0n, 0n, 0n, 0n, BigInt(unixTs)));
}

async function createTestMint(
  context: ProgramTestContext,
  payer: Keypair,
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
      createInitializeMintInstruction(mintKp.publicKey, decimals, payer.publicKey, null),
    ],
    [mintKp]
  );
  return mintKp.publicKey;
}

async function createAta(
  context: ProgramTestContext,
  payer: Keypair,
  mintPk: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mintPk, owner, true, TOKEN_PROGRAM_ID);
  await sendIx(context, payer, [
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      owner,
      mintPk,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
  ]);
  return ata;
}

async function mintTokensTo(
  context: ProgramTestContext,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  amount: number
) {
  await sendIx(context, payer, [
    createMintToInstruction(mint, destination, payer.publicKey, amount),
  ]);
}

async function getTokenBalance(context: ProgramTestContext, tokenAccount: PublicKey): Promise<bigint> {
  const account = await context.banksClient.getAccount(tokenAccount);
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
    expect(combined, `Error "${fragment}" not found in: ${combined.slice(0, 400)}`).to.include(fragment);
  }
}

describe("edit", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<UnifiedFlow>;

  let admin: Keypair;
  let creator: Keypair;
  let recipient: Keypair;

  let mint: PublicKey;
  let nonceCounter = 0;

  interface StreamSetup {
    streamPda: PublicKey;
    creatorAta: PublicKey;
    vaultAta: PublicKey;
    endTs: number;
  }

  interface MilestoneStreamSetup extends StreamSetup {
    milestonePdas: PublicKey[];
  }

  async function setupLinearStream(opts: { startTs?: number; endTs?: number; amount?: number } = {}): Promise<StreamSetup> {
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
    await mintTokensTo(context, admin, mint, creatorAta, amount);

    await program.methods
      .createStream(
        new BN(amount),
        new BN(startTs),
        new BN(startTs),
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

    return { streamPda, creatorAta, vaultAta, endTs };
  }

  async function setupCliffStream(opts: { startTs?: number; cliffTs?: number; endTs?: number; amount?: number } = {}): Promise<StreamSetup> {
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
    await mintTokensTo(context, admin, mint, creatorAta, amount);

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

    return { streamPda, creatorAta, vaultAta, endTs };
  }

  async function setupMilestoneStream(opts: { startTs?: number; endTs?: number; amounts?: number[] } = {}): Promise<MilestoneStreamSetup> {
    const nonce = new BN(nonceCounter++);
    const startTs = opts.startTs ?? BASE_NOW;
    const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
    const amounts = opts.amounts ?? [250_000, 250_000, 250_000, 250_000];
    const total = amounts.reduce((sum, value) => sum + value, 0);

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
    await mintTokensTo(context, admin, mint, creatorAta, total);

    const milestonePdas = amounts.map((_, index) => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPda.toBuffer(), Buffer.from([index])],
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
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        2,
        amounts.map((amount) => ({ amount: new BN(amount) })),
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

    return { streamPda, creatorAta, vaultAta, endTs, milestonePdas };
  }

  before(async () => {
    admin = Keypair.generate();
    creator = Keypair.generate();
    recipient = Keypair.generate();

    context = await startAnchor(".", [], [
      { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: creator.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: recipient.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    ]);

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

    await setTime(context, BASE_NOW);

    await program.methods
      .initializeConfig()
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();

    mint = await createTestMint(context, admin, 6);
  });

  it("fails with StreamExpired when editing a linear stream after end_ts", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, creatorAta, vaultAta, endTs } = await setupLinearStream();

    await setTime(context, endTs + 1);

    await expectError(
      program.methods
        .editLinear(new BN(endTs + 100), new BN(0))
        .accountsStrict({
          creator: creator.publicKey,
          mint,
          stream: streamPda,
          vault: vaultAta,
          creatorTokenAccount: creatorAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "StreamExpired"
    );
  });

  it("fails with StreamExpired when editing a cliff stream after end_ts", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, endTs } = await setupCliffStream();

    await setTime(context, endTs + 1);

    await expectError(
      program.methods
        .editCliff(new BN(endTs + 100))
        .accountsStrict({
          creator: creator.publicKey,
          stream: streamPda,
        })
        .signers([creator])
        .rpc(),
      "StreamExpired"
    );
  });

  it("edits a linear stream before end_ts", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, creatorAta, vaultAta, endTs } = await setupLinearStream();

    const creatorBefore = await getTokenBalance(context, creatorAta);
    const vaultBefore = await getTokenBalance(context, vaultAta);

    const newEndTs = endTs + 500;
    const topupAmount = new BN(250_000);

    await mintTokensTo(context, admin, mint, creatorAta, topupAmount.toNumber());
    const creatorAfterMint = await getTokenBalance(context, creatorAta);

    await setTime(context, BASE_NOW + 10);

    await program.methods
      .editLinear(new BN(newEndTs), topupAmount)
      .accountsStrict({
        creator: creator.publicKey,
        mint,
        stream: streamPda,
        vault: vaultAta,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.endTs.toNumber()).to.equal(newEndTs);
    expect(stream.totalAmount.toNumber()).to.equal(TOKEN_AMOUNT + topupAmount.toNumber());
    expect(creatorAfterMint).to.equal(creatorBefore + BigInt(topupAmount.toNumber()));
    expect(await getTokenBalance(context, creatorAta)).to.equal(creatorAfterMint - BigInt(topupAmount.toNumber()));
    expect(await getTokenBalance(context, vaultAta)).to.equal(vaultBefore + BigInt(topupAmount.toNumber()));
  });

  it("edits a cliff stream before end_ts", async () => {
    await setTime(context, BASE_NOW);
    const { streamPda, endTs } = await setupCliffStream();

    const newCliffTs = endTs - 200;

    await setTime(context, BASE_NOW + 10);

    await program.methods
      .editCliff(new BN(newCliffTs))
      .accountsStrict({
        creator: creator.publicKey,
        stream: streamPda,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPda);
    expect(stream.cliffTs.toNumber()).to.equal(newCliffTs);
  });
});
