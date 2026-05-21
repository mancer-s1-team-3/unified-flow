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

  it("Creates and unlocks milestone vesting stream", async () => {
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

    // =====================================
    // Unlock milestone 0
    // =====================================
    await program.methods
      .unlockMilestone()
      .accountsStrict({
        creator: creator.publicKey,
        stream: streamPDA,
        milestone: remainingAccounts[0].pubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const milestone = await program.account.milestoneAccount.fetch(
      remainingAccounts[0].pubkey
    );
    expect(milestone.approved).to.equal(true);

    // =====================================
    // Unlock milestone 1 (Remaining accounts dihapus)
    // =====================================
    await program.methods
      .unlockMilestone()
      .accountsStrict({
        creator: creator.publicKey,
        stream: streamPDA,
        milestone: remainingAccounts[1].pubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const m1 = await program.account.milestoneAccount.fetch(
      remainingAccounts[1].pubkey
    );
    expect(m1.approved).to.equal(true);

    // =====================================
    // Unlock milestone 2 (Remaining accounts dihapus)
    // =====================================
    await program.methods
      .unlockMilestone()
      .accountsStrict({
        creator: creator.publicKey,
        stream: streamPDA,
        milestone: remainingAccounts[2].pubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const m2 = await program.account.milestoneAccount.fetch(
      remainingAccounts[2].pubkey
    );
    expect(m2.approved).to.equal(true);

    // =====================================
    // Unlock milestone 3 (Remaining accounts dihapus)
    // =====================================
    await program.methods
      .unlockMilestone()
      .accountsStrict({
        creator: creator.publicKey,
        stream: streamPDA,
        milestone: remainingAccounts[3].pubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const m3 = await program.account.milestoneAccount.fetch(
      remainingAccounts[3].pubkey
    );
    expect(m3.approved).to.equal(true);
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


});
