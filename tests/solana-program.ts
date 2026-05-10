import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaProgram } from "../target/types/solana_program";

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  getMintLen,
  mintToChecked,
} from "@solana/spl-token";
import { expect } from "chai";

import {
  PublicKey,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";

describe("solana-program", () => {
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program =
    anchor.workspace.SolanaProgram as Program<SolanaProgram>;

  const creator =
    (provider.wallet as anchor.Wallet).payer;

  const recipient = Keypair.generate();

  const stranger = Keypair.generate();

  let mint: PublicKey;

  let creatorTokenAccount: PublicKey;

  let recipientTokenAccount: PublicKey;

  let configPDA: PublicKey;

  const amount = new anchor.BN(1_000_000);

  before(async () => {
    // =====================================
    // Airdrop
    // =====================================

    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: recipient.publicKey,
        lamports: 100_000_000,
      }),

      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: stranger.publicKey,
        lamports: 100_000_000,
      })
    );

    await provider.sendAndConfirm(tx);

    // =====================================
    // Mint
    // =====================================

    mint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6
    );

    // =====================================
    // Token Accounts
    // =====================================

    creatorTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        mint,
        creator.publicKey
      )
    ).address;

    recipientTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        mint,
        recipient.publicKey
      )
    ).address;

    // =====================================
    // Mint Tokens
    // =====================================

    await mintTo(
      provider.connection,
      creator,
      mint,
      creatorTokenAccount,
      creator,
      amount.mul(new anchor.BN(100)).toNumber()
    );

    // =====================================
    // Config PDA
    // =====================================

    [configPDA] =
      PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        program.programId
      );

    // =====================================
    // Initialize Config
    // =====================================

    try {
      await program.methods
        .initializeConfig()
        .accounts({
          admin: creator.publicKey,
        })
        .rpc();
    } catch (_) {
      // already initialized
    }
  });

  // =========================================================
  // SUCCESS
  // =========================================================

  it("Creates a stream", async () => {
    const nonce = new anchor.BN(
      Math.floor(Math.random() * 1_000_000)
    );

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now + 60);

    const endTs = startTs.add(new anchor.BN(100));

    const [streamPDA] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("stream"),
          creator.publicKey.toBuffer(),
          recipient.publicKey.toBuffer(),
          nonce.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

    const vault =
      await anchor.utils.token.associatedAddress({
        mint,
        owner: streamPDA,
      });

    await program.methods
      .createStream(
        amount,
        startTs,
        endTs,
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const streamAccount =
      await program.account.streamAccount.fetch(
        streamPDA
      );

    expect(
      streamAccount.creator.toBase58()
    ).to.equal(creator.publicKey.toBase58());

    expect(
      streamAccount.recipient.toBase58()
    ).to.equal(recipient.publicKey.toBase58());

    expect(
      streamAccount.mint.toBase58()
    ).to.equal(mint.toBase58());

    expect(
      streamAccount.startTs.toString()
    ).to.equal(startTs.toString());

    expect(
      streamAccount.endTs.toString()
    ).to.equal(endTs.toString());

    expect(
      streamAccount.vault.toBase58()
    ).to.equal(vault.toBase58());

    expect(
      streamAccount.totalAmount.toString()
    ).to.equal(amount.toString());

    expect(
      streamAccount.withdrawn.toString()
    ).to.equal("0");

    const vaultAccount =
      await getAccount(
        provider.connection,
        vault
      );

    expect(
      vaultAccount.amount.toString()
    ).to.equal(amount.toString());

    expect(
      vaultAccount.owner.toBase58()
    ).to.equal(streamPDA.toBase58());

    expect(
      vaultAccount.mint.toBase58()
    ).to.equal(mint.toBase58());
  });

  // =========================================================
  // INVALID AMOUNT
  // =========================================================

  it("Fails when amount is 0", async () => {
    const nonce = new anchor.BN(111);

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now + 60);

    const endTs = startTs.add(new anchor.BN(100));

    try {
      await program.methods
        .createStream(
          new anchor.BN(0),
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with InvalidAmount"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "InvalidAmount"
      );
    }
  });

  // =========================================================
  // INVALID SCHEDULE
  // =========================================================

  it("Fails when end date is before start date", async () => {
    const nonce = new anchor.BN(222);

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now + 100);

    const endTs = new anchor.BN(now + 50);

    try {
      await program.methods
        .createStream(
          amount,
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with InvalidSchedule"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "InvalidSchedule"
      );
    }
  });

  // =========================================================
  // START DATE IN PAST
  // =========================================================

  it("Fails when start date is in the past", async () => {
    const nonce = new anchor.BN(333);

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now - 100);

    const endTs = new anchor.BN(now + 100);

    try {
      await program.methods
        .createStream(
          amount,
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with InvalidStartDate"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "InvalidStartDate"
      );
    }
  });

  // =========================================================
  // END DATE IN PAST
  // =========================================================

  it("Fails when end date is in the past", async () => {
    const nonce = new anchor.BN(444);

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now + 100);
    const endTs = new anchor.BN(now - 100);

    try {
      await program.methods
        .createStream(
          amount,
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with InvalidEndDate"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "InvalidEndDate"
      );
    }
  });

  // =========================================================
  // SELF STREAM
  // =========================================================

  it("Fails when creator equals recipient", async () => {
    const nonce = new anchor.BN(555);

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now + 60);

    const endTs = startTs.add(new anchor.BN(100));

    try {
      await program.methods
        .createStream(
          amount,
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: creator.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with InvalidRecipient"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "InvalidRecipient"
      );
    }
  });

  // =========================================================
  // INSUFFICIENT BALANCE
  // =========================================================

  it("Fails when balance is insufficient", async () => {
    const nonce = new anchor.BN(666);

    const now = Math.floor(Date.now() / 1000);

    const startTs = new anchor.BN(now + 60);

    const endTs = startTs.add(new anchor.BN(100));

    const creatorBalance = (
      await getAccount(
        provider.connection,
        creatorTokenAccount
      )
    ).amount;

    const hugeAmount = new anchor.BN(creatorBalance.toString()).add(new anchor.BN(1))
    try {
      await program.methods
        .createStream(
          hugeAmount,
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint,
          creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with InsufficientBalance"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "InsufficientBalance"
      );
    }
  });

  it("Rejects Token-2022 transfer fee mint", async () => {
    const feeMintKeypair = Keypair.generate();

    const decimals = 6;

    const extensions = [ExtensionType.TransferFeeConfig];

    const mintLen = getMintLen(extensions);

    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        mintLen
      );

    const tx = new anchor.web3.Transaction();

    // Create mint account
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: creator.publicKey,
        newAccountPubkey: feeMintKeypair.publicKey,
        lamports,
        space: mintLen,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );

    // Initialize transfer fee extension
    tx.add(
      createInitializeTransferFeeConfigInstruction(
        feeMintKeypair.publicKey,
        creator.publicKey,
        creator.publicKey,
        100, // 1%
        BigInt(1_000_000),
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Initialize mint
    tx.add(
      createInitializeMintInstruction(
        feeMintKeypair.publicKey,
        decimals,
        creator.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await provider.sendAndConfirm(tx, [feeMintKeypair]);

    // Creator ATA
    const creatorFeeTokenAccount =
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        feeMintKeypair.publicKey,
        creator.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

    // Mint tokens
    await mintToChecked(
      provider.connection,
      creator,
      feeMintKeypair.publicKey,
      creatorFeeTokenAccount.address,
      creator,
      1_000_000,
      decimals,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const nonce = new anchor.BN(999999);

    const startTs = new anchor.BN(
      Math.floor(Date.now() / 1000) + 10
    );

    const endTs = startTs.add(new anchor.BN(100));

    try {
      await program.methods
        .createStream(
          new anchor.BN(1_000_000),
          startTs,
          endTs,
          nonce
        )
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint: feeMintKeypair.publicKey,
          creatorTokenAccount:
            creatorFeeTokenAccount.address,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      expect.fail(
        "Should fail with TransferFeeMintUnsupported"
      );
    } catch (err: any) {
      expect(err.toString()).to.contain(
        "TransferFeeMintUnsupported"
      );
    }
  });

  // =========================================================
  // PROGRAM DEPLOYED
  // =========================================================

  it("Program is deployed on-chain", async () => {
    const accountInfo =
      await provider.connection.getAccountInfo(
        program.programId
      );

    expect(accountInfo).to.not.be.null;

    expect(accountInfo?.executable).to.be.true;
  });
});