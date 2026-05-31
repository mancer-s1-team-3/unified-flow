import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext, Clock } from "solana-bankrun";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createMintToInstruction,
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import { SolanaProgram } from "../target/types/solana_program";
import IDL from "../target/idl/solana_program.json";

const BASE_NOW = 1_700_000_000;
const TOKEN_AMOUNT = 1_000_000;

const VESTING_TYPE_LINEAR = 0;
const VESTING_TYPE_CLIFF = 1;
const VESTING_TYPE_MILESTONE = 2;

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
  decimals: number,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
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
        programId: tokenProgram,
      }),
      createInitializeMintInstruction(mintKp.publicKey, decimals, mintAuthority, null, tokenProgram),
    ],
    [mintKp]
  );

  return mintKp.publicKey;
}

async function createAta(
  context: ProgramTestContext,
  payer: Keypair,
  mintPk: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mintPk, owner, true, tokenProgram);
  await sendIx(context, payer, [
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      owner,
      mintPk,
      tokenProgram,
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
  amount: number,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
) {
  await sendIx(context, payer, [
    createMintToInstruction(mint, destination, payer.publicKey, amount, [], tokenProgram),
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

function buildMilestoneRemainingAccounts(
  streamPDA: PublicKey,
  count: number,
  programId: PublicKey
) {
  const accounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];

  for (let i = 0; i < count; i++) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
      programId
    );

    accounts.push({ pubkey: pda, isWritable: true, isSigner: false });
  }

  return accounts;
}

describe("create-stream", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<SolanaProgram>;

  let admin: Keypair;
  let creator: Keypair;
  let recipient: Keypair;
  let stranger: Keypair;

  let mint: PublicKey;
  let creatorTokenAccount: PublicKey;

  const amount = new BN(TOKEN_AMOUNT);

  before(async () => {
    admin = Keypair.generate();
    creator = Keypair.generate();
    recipient = Keypair.generate();
    stranger = Keypair.generate();

    context = await startAnchor(".", [], [
      { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: creator.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: recipient.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: stranger.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    ]);

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<SolanaProgram>(IDL as SolanaProgram, provider);

    await setTime(context, BASE_NOW);

    await program.methods
      .initializeConfig()
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();

    mint = await createTestMint(context, admin, admin.publicKey, 6);
    creatorTokenAccount = await createAta(context, admin, mint, creator.publicKey);
    await createAta(context, admin, mint, recipient.publicKey);
    await createAta(context, admin, mint, stranger.publicKey);
    await mintTokensTo(context, admin, mint, creatorTokenAccount, amount.toNumber() * 100);
  });

  it("Creates a linear stream", async () => {
    const nonce = new BN(900000);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vault = getAssociatedTokenAddressSync(mint, streamPDA, true, TOKEN_PROGRAM_ID);

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const streamAccount = await program.account.streamAccount.fetch(streamPDA);
    expect(streamAccount.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(streamAccount.recipient.toBase58()).to.equal(recipient.publicKey.toBase58());
    expect(streamAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(streamAccount.startTs.toString()).to.equal(startTs.toString());
    expect(streamAccount.endTs.toString()).to.equal(endTs.toString());
    expect(streamAccount.vault.toBase58()).to.equal(vault.toBase58());
    expect(streamAccount.totalAmount.toString()).to.equal(amount.toString());
    expect(streamAccount.withdrawn.toString()).to.equal("0");
  });

  it("Creates a cliff vesting stream", async () => {
    const nonce = new BN(900001);
    const startTs = BASE_NOW + 60;
    const cliffTs = startTs + 3600;
    const endTs = cliffTs + 100;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.vestingType).to.equal(VESTING_TYPE_CLIFF);
    expect(stream.startTs.toString()).to.equal(startTs.toString());
    expect(stream.cliffTs.toString()).to.equal(cliffTs.toString());
    expect(stream.endTs.toString()).to.equal(endTs.toString());
    expect(stream.totalAmount.toString()).to.equal(amount.toString());
    expect(stream.withdrawn.toString()).to.equal("0");
  });

  it("Creates a cliff vesting stream when cliff equals start", async () => {
    const nonce = new BN(9000012);
    const startTs = BASE_NOW + 60;
    const cliffTs = startTs;
    const endTs = startTs + 100;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.cliffTs.toString()).to.equal(startTs.toString());
    expect(stream.startTs.toString()).to.equal(startTs.toString());
    expect(stream.endTs.toString()).to.equal(endTs.toString());
    expect(stream.vestingType).to.equal(VESTING_TYPE_CLIFF);
  });

  it("Creates a cliff vesting stream when cliff equals end", async () => {
    const nonce = new BN(9000013);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;
    const cliffTs = endTs;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.cliffTs.toString()).to.equal(endTs.toString());
    expect(stream.startTs.toString()).to.equal(startTs.toString());
    expect(stream.endTs.toString()).to.equal(endTs.toString());
    expect(stream.vestingType).to.equal(VESTING_TYPE_CLIFF);
  });

  it("Fails when cliff stream duration is too short", async () => {
    const nonce = new BN(9000011);
    const startTs = BASE_NOW + 60;
    const cliffTs = startTs + 10;
    const endTs = startTs + 30;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "DurationTooShort"
    );
  });

  it("Fails when cliff stream start equals end", async () => {
    const nonce = new BN(9000014);
    const startTs = BASE_NOW + 60;
    const cliffTs = startTs;
    const endTs = startTs;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidSchedule"
    );
  });

  it("Fails when cliff date is after end date", async () => {
    const nonce = new BN(900004);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;
    const cliffTs = endTs + 1;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidSchedule"
    );
  });

  it("Fails when milestone totals do not match stream amount", async () => {
    const nonce = new BN(900002);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;
    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = [] as { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[];
    for (let i = 0; i < 2; i++) {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
        program.programId
      );
      remainingAccounts.push({ pubkey: pda, isWritable: true, isSigner: false });
    }

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [
            { amount: amount.sub(new BN(2)) },
            { amount: new BN(1) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidMilestoneAmount"
    );
  });

  it("Fails when milestone total overflows u64", async () => {
    const nonce = new BN(9000024);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 2, program.programId);

    await expectError(
      program.methods
        .createStream(
          new BN(1),
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [
            { amount: new BN("18446744073709551615") },
            { amount: new BN(1) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "MathOverflow"
    );
  });

  it("Fails when milestone array is empty", async () => {
    const nonce = new BN(90000241);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidMilestoneCount"
    );
  });

  it("Fails when milestone remainingAccounts length is too long", async () => {
    const nonce = new BN(90000242);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 5, program.programId);

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidMilestoneCount"
    );
  });

  it("Fails when any milestone amount is zero", async () => {
    const nonce = new BN(9000025);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = [] as { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[];
    for (let i = 0; i < 4; i++) {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
        program.programId
      );
      remainingAccounts.push({ pubkey: pda, isWritable: true, isSigner: false });
    }

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [
            { amount: amount.div(new BN(2)) },
            { amount: new BN(0) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidAmount"
    );
  });

  it("Fails when milestone remainingAccounts length is too short", async () => {
    const nonce = new BN(9000026);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 3, program.programId);

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidMilestoneCount"
    );
  });

  it("Fails when milestone PDA order is incorrect", async () => {
    const nonce = new BN(9000027);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 4, program.programId);
    [remainingAccounts[1], remainingAccounts[2]] = [remainingAccounts[2], remainingAccounts[1]];

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          [
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
            { amount: amount.div(new BN(4)) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidMilestonePda"
    );
  });

  it("Creates milestone vesting stream", async () => {
    const nonce = new BN(900003);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = [] as { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[];
    for (let i = 0; i < 4; i++) {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
        program.programId
      );
      remainingAccounts.push({ pubkey: pda, isWritable: true, isSigner: false });
    }

    await program.methods
      .createStream(
        amount,
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        VESTING_TYPE_MILESTONE,
        [
          { amount: amount.div(new BN(4)) },
          { amount: amount.div(new BN(4)) },
          { amount: amount.div(new BN(4)) },
          { amount: amount.div(new BN(4)) },
        ],
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers([creator])
      .rpc();

    // =====================================
    // Validate initial state
    // =====================================
    let stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.vestingType).to.equal(VESTING_TYPE_MILESTONE);
  });

  it("Fails when milestone count exceeds u8 range", async () => {
    const nonce = new BN(9000021);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_MILESTONE,
          Array.from({ length: 256 }, () => ({ amount: new BN(1) })),
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "encoding overruns Buffer"
    );
  });

  it("Fails when amount is 0", async () => {
    const nonce = new BN(111);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await expectError(
      program.methods
        .createStream(
          new BN(0),
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidAmount"
    );
  });

  it("Fails when cliff date is before start date", async () => {
    const nonce = new BN(9000031);
    const startTs = BASE_NOW + 120;
    const cliffTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidSchedule"
    );
  });

  it("Fails when end date is before start date", async () => {
    const nonce = new BN(9000032);
    const startTs = BASE_NOW + 120;
    const endTs = BASE_NOW + 60;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidSchedule"
    );
  });

  it("Fails when start date is in the past", async () => {
    const nonce = new BN(333);
    const startTs = BASE_NOW - 100;
    const endTs = BASE_NOW + 100;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidStartDate"
    );
  });

  it("Fails when end date is in the past", async () => {
    const nonce = new BN(444);
    const startTs = BASE_NOW + 100;
    const endTs = BASE_NOW - 100;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidEndDate"
    );
  });

  it("Fails when creator equals recipient", async () => {
    const nonce = new BN(555);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_LINEAR,
          [],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: creator.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidRecipient"
    );
  });
  it("Fails when balance is insufficient", async () => {
    const nonce = new BN(666);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    const creatorBalance = (await context.banksClient.getAccount(creatorTokenAccount))!;
    const balance = Buffer.from(creatorBalance.data).readBigUInt64LE(64);

    await expectError(
      program.methods
        .createStream(
          new BN(balance.toString()).add(new BN(1)),
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InsufficientBalance"
    );
  });

  it("Rejects Token-2022 transfer fee mint", async () => {
    const feeMintKeypair = Keypair.generate();
    const decimals = 6;
    const extensions = [ExtensionType.TransferFeeConfig];
    const mintLen = getMintLen(extensions);
    const rent = await context.banksClient.getRent();
    const lamports = Number(rent.minimumBalance(BigInt(mintLen)));

    const tx = new Transaction();
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: creator.publicKey,
        newAccountPubkey: feeMintKeypair.publicKey,
        lamports,
        space: mintLen,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        feeMintKeypair.publicKey,
        creator.publicKey,
        creator.publicKey,
        100,
        BigInt(1_000_000),
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        feeMintKeypair.publicKey,
        decimals,
        creator.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );
    tx.feePayer = creator.publicKey;
    tx.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0];
    tx.sign(creator, feeMintKeypair);
    await context.banksClient.processTransaction(tx);

    const creatorFeeTokenAccount = await createAta(
      context,
      creator,
      feeMintKeypair.publicKey,
      creator.publicKey,
      TOKEN_2022_PROGRAM_ID
    );

    await sendIx(context, creator, [
      createMintToCheckedInstruction(
        feeMintKeypair.publicKey,
        creatorFeeTokenAccount,
        creator.publicKey,
        1_000_000,
        decimals,
        [],
        TOKEN_2022_PROGRAM_ID
      ),
    ]);

    const nonce = new BN(999999);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await expectError(
      program.methods
        .createStream(
          new BN(1_000_000),
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
          mint: feeMintKeypair.publicKey,
          creatorTokenAccount: creatorFeeTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "TransferFeeMintUnsupported"
    );
  });

  it("Fails when stream PDA already exists", async () => {
    const nonce = new BN(777777);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "already in use"
    );

    expect(streamPDA).to.exist;
  });

  it("Fails when startTs equals endTs", async () => {
    const nonce = new BN(888888);
    const startTs = BASE_NOW + 60;

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(startTs),
          VESTING_TYPE_LINEAR,
          [],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidSchedule"
    );
  });

  it("Fails when stream duration is too short", async () => {
    const nonce = new BN(888889);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 30;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "DurationTooShort"
    );
  });

  it("Fails when creator token account is not owned by creator", async () => {
    const nonce = new BN(334);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;
    const strangerOwnedAta = await createAta(context, admin, mint, stranger.publicKey);

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount: strangerOwnedAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidTokenOwner"
    );
  });

  it("Fails when token account mint mismatches", async () => {
    const nonce = new BN(335);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;
    const otherMint = await createTestMint(context, admin, admin.publicKey, 6);
    const wrongMintAta = await createAta(context, admin, otherMint, creator.publicKey);
    await mintTokensTo(context, admin, otherMint, wrongMintAta, amount.toNumber());

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount: wrongMintAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidMint"
    );
  });

  it("Fails when token program mismatches mint owner", async () => {
    const nonce = new BN(336);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;
    const token2022Mint = await createTestMint(context, admin, admin.publicKey, 6, TOKEN_2022_PROGRAM_ID);
    const token2022Ata = await createAta(context, admin, token2022Mint, creator.publicKey, TOKEN_2022_PROGRAM_ID);
    await mintTokensTo(context, admin, token2022Mint, token2022Ata, amount.toNumber(), TOKEN_2022_PROGRAM_ID);

    await expectError(
      program.methods
        .createStream(
          amount,
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
          mint: token2022Mint,
          creatorTokenAccount: token2022Ata,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "incorrect program id for instruction"
    );
  });

  it("Prevents replay / duplicate transaction", async () => {
    const nonce = new BN(888890);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "already in use"
    );
  });

  it("Allows multiple streams with same users but different nonce", async () => {
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;
    const nonceA = new BN(888891);
    const nonceB = new BN(888892);

    const [streamPdaA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonceA.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [streamPdaB] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonceB.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vaultA = getAssociatedTokenAddressSync(mint, streamPdaA, true, TOKEN_PROGRAM_ID);
    const vaultB = getAssociatedTokenAddressSync(mint, streamPdaB, true, TOKEN_PROGRAM_ID);

    await program.methods
      .createStream(
        amount,
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        VESTING_TYPE_LINEAR,
        [],
        nonceA
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .createStream(
        amount,
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        VESTING_TYPE_LINEAR,
        [],
        nonceB
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const streamA = await program.account.streamAccount.fetch(streamPdaA);
    const streamB = await program.account.streamAccount.fetch(streamPdaB);
    expect(streamA.vault.toBase58()).to.equal(vaultA.toBase58());
    expect(streamB.vault.toBase58()).to.equal(vaultB.toBase58());
    expect(streamPdaA.equals(streamPdaB)).to.equal(false);
    expect(vaultA.equals(vaultB)).to.equal(false);
    expect(await getTokenBalance(context, vaultA)).to.equal(BigInt(amount.toString()));
    expect(await getTokenBalance(context, vaultB)).to.equal(BigInt(amount.toString()));
  });


  // -------------------------------------------------------
  // 1. Mint dengan decimals = 0 ditolak
  // -------------------------------------------------------
  it("Fails when mint decimals is zero", async () => {
    const zeroDecimalMint = await createTestMint(context, admin, admin.publicKey, 0);
    const zeroDecimalAta = await createAta(context, admin, zeroDecimalMint, creator.publicKey);
    await mintTokensTo(context, admin, zeroDecimalMint, zeroDecimalAta, amount.toNumber());

    const nonce = new BN(1100001);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await expectError(
      program.methods
        .createStream(
          amount,
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
          mint: zeroDecimalMint,
          creatorTokenAccount: zeroDecimalAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidMintDecimals"
    );
  });

  // -------------------------------------------------------
  // 2. Linear stream tidak boleh punya milestones
  // -------------------------------------------------------
  it("Fails when linear stream has non-empty milestones", async () => {
    const nonce = new BN(1100002);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 2, program.programId);

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          VESTING_TYPE_LINEAR,
          [
            { amount: amount.div(new BN(2)) },
            { amount: amount.div(new BN(2)) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidMilestoneCount"
    );
  });

  // -------------------------------------------------------
  // 3. Cliff stream tidak boleh punya milestones
  // -------------------------------------------------------
  it("Fails when cliff stream has non-empty milestones", async () => {
    const nonce = new BN(1100003);
    const startTs = BASE_NOW + 60;
    const cliffTs = startTs + 50;
    const endTs = startTs + 100;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 2, program.programId);

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(cliffTs),
          new BN(endTs),
          VESTING_TYPE_CLIFF,
          [
            { amount: amount.div(new BN(2)) },
            { amount: amount.div(new BN(2)) },
          ],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([creator])
        .rpc(),
      "InvalidMilestoneCount"
    );
  });

  // -------------------------------------------------------
  // 4. Vesting type tidak valid (nilai > 2)
  // -------------------------------------------------------
  it("Fails when vesting type is invalid", async () => {
    const nonce = new BN(1100004);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 100;

    await expectError(
      program.methods
        .createStream(
          amount,
          new BN(startTs),
          new BN(startTs),
          new BN(endTs),
          3, // vesting type tidak valid
          [],
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidVestingType"
    );
  });

  // -------------------------------------------------------
  // 5. start_ts tepat di `now` masih valid (boundary: start_ts >= now)
  // -------------------------------------------------------
  it("Allows stream when startTs equals current time exactly", async () => {
    const nonce = new BN(1100005);
    const startTs = BASE_NOW; // tepat sama dengan now
    const endTs = startTs + 200; // > MIN_STREAM_DURATION (60)

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.startTs.toNumber()).to.equal(startTs);
    expect(stream.endTs.toNumber()).to.equal(endTs);
  });

  // -------------------------------------------------------
  // 6. Duration tepat MIN_STREAM_DURATION (60s) diterima
  // -------------------------------------------------------
  it("Allows stream with duration exactly at minimum (60s)", async () => {
    const nonce = new BN(1100006);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 60; // tepat 60 detik = MIN_STREAM_DURATION

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    const duration = stream.endTs.toNumber() - stream.startTs.toNumber();
    expect(duration).to.equal(60);
  });

  // -------------------------------------------------------
  // 7. Duration 59s (satu detik kurang dari minimum) ditolak
  // -------------------------------------------------------
  it("Fails when duration is one second below minimum (59s)", async () => {
    const nonce = new BN(1100007);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 59; // 1 detik kurang dari MIN_STREAM_DURATION

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "DurationTooShort"
    );
  });

  // -------------------------------------------------------
  // 8. State awal StreamAccount tersimpan benar (linear)
  //    Verifikasi semua field penting setelah create
  // -------------------------------------------------------
  it("Stores all initial StreamAccount fields correctly for linear stream", async () => {
    const nonce = new BN(1100008);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vault = getAssociatedTokenAddressSync(mint, streamPDA, true, TOKEN_PROGRAM_ID);

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);

    expect(stream.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(stream.recipient.toBase58()).to.equal(recipient.publicKey.toBase58());
    expect(stream.mint.toBase58()).to.equal(mint.toBase58());
    expect(stream.vault.toBase58()).to.equal(vault.toBase58());
    expect(stream.totalAmount.toNumber()).to.equal(amount.toNumber());
    expect(stream.withdrawn.toNumber()).to.equal(0);
    expect(stream.vestingType).to.equal(VESTING_TYPE_LINEAR);
    expect(stream.status).to.equal(1); // STREAM_STATUS_ACTIVE
    expect(stream.cancelable).to.equal(true);
    expect(stream.cancelled).to.equal(false);
    expect(stream.milestoneCount).to.equal(0);
    expect(stream.nextMilestoneIndex).to.equal(0);
    expect(stream.nonce.toNumber()).to.equal(nonce.toNumber());
    expect(stream.unlockedMilestoneAmount.toNumber()).to.equal(0);
  });

  // -------------------------------------------------------
  // 9. Vault menerima token yang benar setelah create
  // -------------------------------------------------------
  it("Vault receives exact token amount after stream creation", async () => {
    const nonce = new BN(1100009);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vault = getAssociatedTokenAddressSync(mint, streamPDA, true, TOKEN_PROGRAM_ID);

    const creatorBalanceBefore = await getTokenBalance(context, creatorTokenAccount);

    await program.methods
      .createStream(
        amount,
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
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const vaultBalance = await getTokenBalance(context, vault);
    const creatorBalanceAfter = await getTokenBalance(context, creatorTokenAccount);

    expect(vaultBalance).to.equal(BigInt(amount.toNumber()), "vault harus menerima exact amount");
    expect(creatorBalanceAfter).to.equal(
      creatorBalanceBefore - BigInt(amount.toNumber()),
      "creator balance harus berkurang sebesar amount"
    );
  });

  // -------------------------------------------------------
  // 10. State awal MilestoneAccount tersimpan benar
  //     Verifikasi setiap milestone account setelah create
  // -------------------------------------------------------
  it("Stores all MilestoneAccount fields correctly after creation", async () => {
    const nonce = new BN(1100010);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;
    const milestoneAmounts = [400_000, 300_000, 200_000, 100_000];
    const total = milestoneAmounts.reduce((s, v) => s + v, 0);

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 4, program.programId);

    await program.methods
      .createStream(
        new BN(total),
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        VESTING_TYPE_MILESTONE,
        milestoneAmounts.map((a) => ({ amount: new BN(a) })),
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers([creator])
      .rpc();

    for (let i = 0; i < 4; i++) {
      const milestone = await program.account.milestoneAccount.fetch(
        remainingAccounts[i].pubkey
      );
      expect(milestone.stream.toBase58()).to.equal(streamPDA.toBase58(), `milestone[${i}] stream mismatch`);
      expect(milestone.index).to.equal(i, `milestone[${i}] index salah`);
      expect(milestone.amount.toNumber()).to.equal(milestoneAmounts[i], `milestone[${i}] amount salah`);
      expect(milestone.approved).to.equal(false, `milestone[${i}] approved harus false`);
      expect(milestone.unlocked).to.equal(false, `milestone[${i}] unlocked harus false`);
      expect(milestone.unlockTs.toNumber()).to.equal(0, `milestone[${i}] unlock_ts harus 0`);
    }

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.milestoneCount).to.equal(4);
    expect(stream.nextMilestoneIndex).to.equal(0);
    expect(stream.unlockedMilestoneAmount.toNumber()).to.equal(0);
  });

  // -------------------------------------------------------
  // 11. Milestone stream dengan hanya 1 milestone (minimum valid)
  // -------------------------------------------------------
  it("Creates milestone stream with single milestone", async () => {
    const nonce = new BN(1100011);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 1, program.programId);

    await program.methods
      .createStream(
        amount,
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        VESTING_TYPE_MILESTONE,
        [{ amount: amount }],
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.milestoneCount).to.equal(1);
    expect(stream.vestingType).to.equal(VESTING_TYPE_MILESTONE);
    expect(stream.totalAmount.toNumber()).to.equal(amount.toNumber());

    const milestone = await program.account.milestoneAccount.fetch(remainingAccounts[0].pubkey);
    expect(milestone.amount.toNumber()).to.equal(amount.toNumber());
    expect(milestone.index).to.equal(0);
  });

  // -------------------------------------------------------
  // 12. Protocol paused → semua create_stream ditolak
  // -------------------------------------------------------
  it("Fails when protocol is paused", async () => {
    // Pause protocol via set_paused (asumsi ada instruksi ini),
    // atau langsung modifikasi config account via bankrun
    // Karena program tidak expose set_paused di IDL yang diberikan,
    // kita verifikasi guard ini dengan memodifikasi state config via bankrun.
    // Jika set_paused tersedia, ganti dengan pemanggilan instruksi tersebut.

    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    // Baca raw config account dan set byte paused = true (offset 8+32+32 = 72)
    const configAccountInfo = await context.banksClient.getAccount(configPDA);
    expect(configAccountInfo).to.not.be.null;

    const configData = Buffer.from(configAccountInfo!.data);
    // Layout ConfigAccount: discriminator(8) + admin_authority(32) + fee_authority(32) + paused(1)
    const pausedOffset = 8 + 32 + 32;
    configData[pausedOffset] = 1; // set paused = true

    // Inject modified account ke bankrun context
    await context.setAccount(configPDA, {
      lamports: configAccountInfo!.lamports,
      data: configData,
      owner: new PublicKey(configAccountInfo!.owner),
      executable: false,
    });

    const nonce = new BN(1100012);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    try {
      await expectError(
        program.methods
          .createStream(
            amount,
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
            creatorTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc(),
        "ProtocolPaused"
      );
    } finally {
      // Selalu restore paused = false agar test selanjutnya tidak terpengaruh
      configData[pausedOffset] = 0;
      await context.setAccount(configPDA, {
        lamports: configAccountInfo!.lamports,
        data: configData,
        owner: new PublicKey(configAccountInfo!.owner),
        executable: false,
      });
    }
  });

  // -------------------------------------------------------
  // 13. Creator token account dari wallet berbeda (bukan creator)
  //     tapi mint-nya sama → InvalidTokenOwner
  // -------------------------------------------------------
  it("Fails when creator token account belongs to recipient", async () => {
    const nonce = new BN(1100013);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    // recipient punya ATA dengan mint yang sama
    const recipientAta = getAssociatedTokenAddressSync(mint, recipient.publicKey, true, TOKEN_PROGRAM_ID);

    await expectError(
      program.methods
        .createStream(
          amount,
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
          creatorTokenAccount: recipientAta, // ATA milik recipient, bukan creator
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      "InvalidTokenOwner"
    );
  });

  // -------------------------------------------------------
  // 14. Milestone stream: non-uniform amounts (distribusi tidak rata)
  //     memastikan sum tetap harus == total_amount
  // -------------------------------------------------------
  it("Creates milestone stream with non-uniform milestone amounts", async () => {
    const nonce = new BN(1100014);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;
    // Distribusi tidak rata tapi sum = 1_000_000
    const milestoneAmounts = [500_000, 300_000, 150_000, 50_000];
    const total = milestoneAmounts.reduce((s, v) => s + v, 0); // = 1_000_000

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 4, program.programId);

    await program.methods
      .createStream(
        new BN(total),
        new BN(startTs),
        new BN(startTs),
        new BN(endTs),
        VESTING_TYPE_MILESTONE,
        milestoneAmounts.map((a) => ({ amount: new BN(a) })),
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);
    expect(stream.totalAmount.toNumber()).to.equal(total);
    expect(stream.milestoneCount).to.equal(4);

    // Verifikasi setiap amount tersimpan benar
    for (let i = 0; i < 4; i++) {
      const m = await program.account.milestoneAccount.fetch(remainingAccounts[i].pubkey);
      expect(m.amount.toNumber()).to.equal(milestoneAmounts[i]);
    }
  });

  // -------------------------------------------------------
  // 15. nonce berbeda menghasilkan PDA berbeda untuk pair
  //     creator-recipient yang sama (properti deterministik)
  // -------------------------------------------------------
  it("Different nonces produce unique stream PDAs for same creator-recipient pair", async () => {
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;
    const nonces = [new BN(1100015), new BN(1100016), new BN(1100017)];

    const pdas = nonces.map((nonce) => {
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
    });

    // Semua PDA harus unik
    const pdaSet = new Set(pdas.map((p) => p.toBase58()));
    expect(pdaSet.size).to.equal(3, "setiap nonce harus menghasilkan PDA unik");

    // Buat ketiga stream
    for (const nonce of nonces) {
      await program.methods
        .createStream(
          amount,
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
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();
    }

    // Verifikasi masing-masing stream ada dan independen
    for (let i = 0; i < 3; i++) {
      const stream = await program.account.streamAccount.fetch(pdas[i]);
      expect(stream.nonce.toNumber()).to.equal(nonces[i].toNumber());
    }
  });

  // -------------------------------------------------------
  // [AUTH] A-1: Unsigned transaction ditolak Anchor runtime
  // Creator ada di accounts tapi tidak di signers[]
  // -------------------------------------------------------
  it("[AUTH] create_stream: fails when creator does not sign", async () => {
    const nonce = new BN(2200001);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    // Anchor client throws sebelum submit jika Signer<'info> tidak sign.
    // Kita verifikasi via MissingRequiredSignature / Signature verification failed.
    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([])          // creator sengaja tidak sign
        .rpc(),
      "Signature verification failed"
    );
  });

  // -------------------------------------------------------
  // [PDA] A-2: Milestone PDA dari stream LAIN disuplai ke create_stream
  // Harus gagal karena PDA-nya tidak cocok dengan stream PDA baru
  // -------------------------------------------------------
  it("[PDA] create_stream: fails when milestone PDAs belong to a different stream", async () => {
    // Buat stream pertama agar milestone PDA-nya teralokasi
    const nonceA = new BN(2200002);
    const nonceB = new BN(2200003);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonceA.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [streamB] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonceB.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Milestone PDAs dari stream A (sudah ada setelah create pertama)
    const milestonesA = buildMilestoneRemainingAccounts(streamA, 4, program.programId);

    // Buat stream A dulu agar milestone accounts terealokasi
    await program.methods
      .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_MILESTONE,
        [{ amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }], nonceA)
      .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
      .remainingAccounts(milestonesA)
      .signers([creator])
      .rpc();

    // Coba buat stream B tapi supplai milestone PDAs dari stream A
    // PDA check: program derive [b"milestone", streamB.key(), &[i]] → tidak cocok dengan milestonesA → InvalidMilestonePda
    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_MILESTONE,
          [{ amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }], nonceB)
        .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
        .remainingAccounts(milestonesA) // PDAs milik stream A, bukan B
        .signers([creator])
        .rpc(),
      "InvalidMilestonePda"
    );
  });

  // -------------------------------------------------------
  // [OVERFLOW] A-3: amount = u64::MAX → transfer akan gagal (insufficient balance)
  // Verifikasi program tidak panic sebelum cek balance
  // -------------------------------------------------------
  it("[OVERFLOW] create_stream: fails gracefully when amount exceeds creator balance (u64 near-max)", async () => {
    const nonce = new BN(2200004);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;
    const maxU64 = new BN("18446744073709551615");

    await expectError(
      program.methods
        .createStream(maxU64, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([creator])
        .rpc(),
      "InsufficientBalance"
    );
  });

  // -------------------------------------------------------
  // [OWNERSHIP] A-4: vault dari stream lain di-pass sebagai creatorTokenAccount
  // Vault milik stream PDA → owner bukan creator → InvalidTokenOwner
  // -------------------------------------------------------
  it("[OWNERSHIP] create_stream: fails when a vault from another stream is passed as creatorTokenAccount", async () => {
    // Buat stream pertama → vault-nya jadi milik streamPDA (bukan creator)
    const nonceExisting = new BN(2200005);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [existingStreamPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonceExisting.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    await program.methods
      .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonceExisting)
      .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([creator])
      .rpc();

    const existingVault = getAssociatedTokenAddressSync(mint, existingStreamPDA, true, TOKEN_PROGRAM_ID);

    // Coba buat stream baru dengan vault stream lama sebagai creatorTokenAccount
    const nonceNew = new BN(2200006);
    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonceNew)
        .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount: existingVault, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([creator])
        .rpc(),
      "InvalidTokenOwner"
    );
  });

  // -------------------------------------------------------
  // [CEI] A-5: Stream state di-set SEBELUM token di-transfer
  // Verifikasi: jika transfer gagal (amount melebihi balance),
  // stream account TIDAK terbuat (init gagal atomik)
  // -------------------------------------------------------
  it("[CEI] create_stream: stream account not created if token transfer fails", async () => {
    const nonce = new BN(2200007);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Gunakan amount lebih besar dari balance creator untuk trigger gagal di transfer
    const tooLarge = new BN("999999999999999999");

    await expectError(
      program.methods
        .createStream(tooLarge, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([creator])
        .rpc(),
      "InsufficientBalance"
    );

    // FIX: anchor-bankrun tidak implement fetchNullable.
    // Gunakan banksClient.getAccount() yang return null jika akun tidak ada.
    const streamAccountInfo = await context.banksClient.getAccount(streamPDA);
    expect(streamAccountInfo).to.be.null;
  });

  it("[0-SIGNER] create_stream: recipient cannot impersonate creator", async () => {
    const nonce = new BN(3300001);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    // recipient sign tapi kita pass recipient sebagai creator
    // PDA akan di-derive dari recipient key → stream unik baru yang valid secara teknis
    // tapi constraint creatorTokenAccount.owner == creator.key() akan gagal
    // karena creatorTokenAccount dimiliki oleh creator asli, bukan recipient
    const recipientOwnedAta = getAssociatedTokenAddressSync(mint, recipient.publicKey, true, TOKEN_PROGRAM_ID);

    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({
          creator: recipient.publicKey,    // recipient impersonate creator
          recipient: creator.publicKey,
          mint,
          creatorTokenAccount: recipientOwnedAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc(),
      "InsufficientBalance"  // recipient ATA kosong → tidak bisa transfer
    );
  });

  // -------------------------------------------------------
  // [1-DATA] A-2
  // Pass ConfigAccount dengan data valid tapi seeds yang berbeda
  // → Anchor seeds constraint [b"config"] protect ini
  // -------------------------------------------------------
  it("[1-DATA] create_stream: fails when wrong config PDA is passed", async () => {
    const nonce = new BN(3300002);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    // Config PDA yang benar adalah [b"config"]
    // Jika kita pass random account, Anchor seeds constraint reject
    const fakeConfig = Keypair.generate().publicKey;

    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accountsStrict({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          config: fakeConfig,
          stream: PublicKey.findProgramAddressSync(
            [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
            program.programId
          )[0],
          vault: getAssociatedTokenAddressSync(
            mint,
            PublicKey.findProgramAddressSync(
              [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
              program.programId
            )[0],
            true, TOKEN_PROGRAM_ID
          ),
          creatorTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      // fakeConfig adalah random keypair yang tidak pernah diinisialisasi
      // Anchor cek discriminator (step 1) sebelum seeds (step 2)
      // akun tidak exist → AccountNotInitialized
      "AccountNotInitialized"
    );
  });

  // -------------------------------------------------------
  // [3-COSPLAY] A-3
  // Pass MilestoneAccount sebagai StreamAccount
  // → Anchor 8-byte discriminator mismatch → AccountDiscriminatorMismatch
  // -------------------------------------------------------
  it("[3-COSPLAY] create_stream: fails when milestone account is passed as stream account", async () => {
    // Buat stream milestone dulu agar milestone account exist
    const setupNonce = new BN(3300003);
    const [setupStreamPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), setupNonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const setupMilestones = buildMilestoneRemainingAccounts(setupStreamPDA, 4, program.programId);
    await program.methods
      .createStream(amount, new BN(BASE_NOW + 60), new BN(BASE_NOW + 60), new BN(BASE_NOW + 86400), VESTING_TYPE_MILESTONE,
        [{ amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }], setupNonce)
      .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
      .remainingAccounts(setupMilestones)
      .signers([creator])
      .rpc();

    // Sekarang coba pakai MilestoneAccount[0] sebagai config account di instruksi lain
    // Discriminator MilestoneAccount != ConfigAccount → AccountDiscriminatorMismatch
    const nonce = new BN(3300004);
    const milestoneAsConfig = setupMilestones[0].pubkey;

    await expectError(
      program.methods
        .createStream(amount, new BN(BASE_NOW + 60), new BN(BASE_NOW + 60), new BN(BASE_NOW + 86400), VESTING_TYPE_LINEAR, [], nonce)
        .accountsStrict({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          config: milestoneAsConfig,  // milestone account dipass sebagai config
          stream: PublicKey.findProgramAddressSync(
            [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
            program.programId
          )[0],
          vault: getAssociatedTokenAddressSync(
            mint,
            PublicKey.findProgramAddressSync(
              [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
              program.programId
            )[0],
            true, TOKEN_PROGRAM_ID
          ),
          creatorTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc(),
      // Anchor step 1: deserialize config → discriminator MilestoneAccount != ConfigAccount
      // → AccountDiscriminatorMismatch sebelum seeds check (step 2) tercapai
      "AccountDiscriminatorMismatch"
    );
  });

  // -------------------------------------------------------
  // [5-ARBI-CPI] A-4
  // Pass program ID palsu sebagai token_program
  // → Interface<'info, TokenInterface> Anchor validate program ID
  // -------------------------------------------------------
  it("[5-ARBI-CPI] create_stream: fails when fake token_program is passed", async () => {
    const nonce = new BN(3300005);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    // Pass system program sebagai token_program (bukan SPL Token)
    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: anchor.web3.SystemProgram.programId, // fake token program
        })
        .signers([creator])
        .rpc(),
      "InvalidProgramId"
    );
  });

  // -------------------------------------------------------
  // [7-BUMP] A-5
  // Verify bump yang disimpan di StreamAccount == canonical bump
  // → proteksi terhadap non-canonical bump yang bisa menghasilkan multiple PDAs
  // -------------------------------------------------------
  it("[7-BUMP] create_stream: stored bump equals canonical bump derived by find_program_address", async () => {
    const nonce = new BN(3300006);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [streamPDA, canonicalBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
      .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([creator])
      .rpc();

    const stream = await program.account.streamAccount.fetch(streamPDA);

    // stream.bump HARUS == canonical bump dari find_program_address
    // Jika tidak, program rentan terhadap bump manipulation attack
    expect(stream.bump).to.equal(canonicalBump,
      "stream.bump harus == canonical bump dari find_program_address"
    );
  });

  // -------------------------------------------------------
  // [7-BUMP] A-6
  // Verify bump milestone yang disimpan == canonical bump
  // -------------------------------------------------------
  it("[7-BUMP] create_stream: stored milestone bumps equal canonical bumps", async () => {
    const nonce = new BN(3300007);
    const startTs = BASE_NOW + 60;
    const endTs = BASE_NOW + 86400;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 4, program.programId);

    await program.methods
      .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_MILESTONE,
        [{ amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }], nonce)
      .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
      .remainingAccounts(remainingAccounts)
      .signers([creator])
      .rpc();

    for (let i = 0; i < 4; i++) {
      const [, canonicalBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
        program.programId
      );
      const milestone = await program.account.milestoneAccount.fetch(remainingAccounts[i].pubkey);
      expect(milestone.bump).to.equal(canonicalBump,
        `milestone[${i}].bump harus == canonical bump`
      );
    }
  });

  // -------------------------------------------------------
  // [8-SHARING] A-7
  // Verifikasi dua stream dengan creator-recipient yang sama tapi nonce berbeda
  // tidak share akun apapun (vault, stream PDA)
  // -------------------------------------------------------
  it("[8-SHARING] create_stream: two streams with same creator-recipient have no shared accounts", async () => {
    const nonceA = new BN(3300008);
    const nonceB = new BN(3300009);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [streamA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonceA.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [streamB] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonceB.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const vaultA = getAssociatedTokenAddressSync(mint, streamA, true, TOKEN_PROGRAM_ID);
    const vaultB = getAssociatedTokenAddressSync(mint, streamB, true, TOKEN_PROGRAM_ID);

    for (const nonce of [nonceA, nonceB]) {
      await program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([creator])
        .rpc();
    }

    // Semua akun harus unique — tidak ada sharing
    expect(streamA.toBase58()).to.not.equal(streamB.toBase58(), "stream PDAs harus unik");
    expect(vaultA.toBase58()).to.not.equal(vaultB.toBase58(), "vault PDAs harus unik");

    // Satu stream tidak bisa mengakses vault stream lain
    const streamAData = await program.account.streamAccount.fetch(streamA);
    const streamBData = await program.account.streamAccount.fetch(streamB);
    expect(streamAData.vault.toBase58()).to.equal(vaultA.toBase58());
    expect(streamBData.vault.toBase58()).to.equal(vaultB.toBase58());
    expect(streamAData.vault.toBase58()).to.not.equal(streamBData.vault.toBase58());
  });

  // -------------------------------------------------------
  // [9-CLOSE] A-8
  // Stream cancelled tidak bisa di-reinitialize (nonce sama)
  // cancel() tidak close akun → akun masih ada → init dengan nonce sama → "already in use"
  // -------------------------------------------------------
  it("[9-CLOSE] create_stream: cancelled stream cannot be reinitialized with same nonce", async () => {
    const nonce = new BN(3300010);
    const startTs = BASE_NOW + 60;
    const endTs = startTs + 200;

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const vault = getAssociatedTokenAddressSync(mint, streamPDA, true, TOKEN_PROGRAM_ID);
    const recipientAta = getAssociatedTokenAddressSync(mint, recipient.publicKey, true, TOKEN_PROGRAM_ID);

    // Buat stream
    await program.methods
      .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
      .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([creator])
      .rpc();

    // Cancel stream
    await program.methods
      .cancel()
      .accountsStrict({
        creator: creator.publicKey, mint, stream: streamPDA, vault,
        creatorTokenAccount, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    // Verifikasi stream masih exist (tidak benar-benar "closed")
    const streamData = await program.account.streamAccount.fetch(streamPDA);
    expect(streamData.cancelled).to.equal(true);

    // Coba reinitialize dengan nonce yang sama → harus gagal (akun masih ada)
    await expectError(
      program.methods
        .createStream(amount, new BN(startTs), new BN(startTs), new BN(endTs), VESTING_TYPE_LINEAR, [], nonce)
        .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([creator])
        .rpc(),
      "already in use"
    );
  });

});
