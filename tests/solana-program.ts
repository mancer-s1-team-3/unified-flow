import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaProgram } from "../target/types/solana_program";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

describe("solana-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaProgram as Program<SolanaProgram>;
  const creator = (provider.wallet as anchor.Wallet).payer;
  const recipient = Keypair.generate();
  const stranger = Keypair.generate();

  let mint: PublicKey;
  let creatorTokenAccount: PublicKey;
  let recipientTokenAccount: PublicKey;

  const amount = new anchor.BN(1000000); // 1M tokens
  const nonce = new anchor.BN(Math.floor(Math.random() * 1000000));

  before(async () => {
    // Fund recipient and stranger
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: recipient.publicKey,
        lamports: 100000000,
      }),
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: stranger.publicKey,
        lamports: 100000000,
      })
    );
    await provider.sendAndConfirm(tx);

    mint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6
    );

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

    await mintTo(
      provider.connection,
      creator,
      mint,
      creatorTokenAccount,
      creator,
      amount.mul(new anchor.BN(10)).toNumber()
    );
  });

  it("Creates a stream", async () => {
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000));
    const endTs = startTs.add(new anchor.BN(100));

    const [streamPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const vault = await anchor.utils.token.associatedAddress({
      mint: mint,
      owner: streamPDA,
    });

    await program.methods
      .createStream(amount, startTs, endTs, nonce)
      .accounts({
        creator: creator.publicKey,
        recipient: recipient.publicKey,
        mint: mint,
        creatorTokenAccount: creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const streamAccount = await program.account.streamAccount.fetch(streamPDA);
    expect(streamAccount.totalAmount.toString()).to.equal(amount.toString());
    expect(streamAccount.withdrawn.toString()).to.equal("0");

    const vaultAccount = await getAccount(provider.connection, vault);
    expect(vaultAccount.amount.toString()).to.equal(amount.toString());
  });


  it("Fails when amount is 0", async () => {
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000));
    const endTs = startTs.add(new anchor.BN(100));
    const zeroAmount = new anchor.BN(0);
    const zeroNonce = new anchor.BN(111);

    try {
      await program.methods
        .createStream(zeroAmount, startTs, endTs, zeroNonce)
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint: mint,
          creatorTokenAccount: creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed with InvalidAmount");
    } catch (err: any) {
      expect(err.message).to.contain("InvalidAmount");
    }
  });

  it("Fails when end date is before start date", async () => {
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000) + 100);
    const endTs = startTs.sub(new anchor.BN(50));
    const invalidNonce = new anchor.BN(222);

    try {
      await program.methods
        .createStream(amount, startTs, endTs, invalidNonce)
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint: mint,
          creatorTokenAccount: creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed with InvalidSchedule");
    } catch (err: any) {
      expect(err.message).to.contain("InvalidSchedule");
    }
  });

  it("Fails when end date is in the past", async () => {
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now - 200);
    const endTs = new anchor.BN(now - 100);
    const pastNonce = new anchor.BN(333);

    try {
      await program.methods
        .createStream(amount, startTs, endTs, pastNonce)
        .accounts({
          creator: creator.publicKey,
          recipient: recipient.publicKey,
          mint: mint,
          creatorTokenAccount: creatorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed with InvalidEndDate");
    } catch (err: any) {
      expect(err.message).to.contain("InvalidEndDate");
    }
  });
  it("Program is deployed on-chain", async () => {
    const accountInfo = await provider.connection.getAccountInfo(
      program.programId
    );

    expect(accountInfo).to.not.be.null;
    expect(accountInfo?.executable).to.be.true;
  });
});