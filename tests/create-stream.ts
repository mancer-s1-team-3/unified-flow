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

describe("create-stream", () => {
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

        const hugeAmount =
            new anchor.BN(creatorBalance.toString())
                .add(new anchor.BN(1));

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
            Math.floor(Date.now() / 1000) + 60
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

    it("Fails when stream PDA already exists", async () => {
        const nonce = new anchor.BN(777777);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs.add(new anchor.BN(100));

        // =====================================
        // Derive Stream PDA
        // =====================================

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

        // =====================================
        // First Create -> SUCCESS
        // =====================================

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
            streamAccount.totalAmount.toString()
        ).to.equal(amount.toString());

        // =====================================
        // Second Create Same Nonce -> FAIL
        // =====================================

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
                "Should fail because stream PDA already exists"
            );
        } catch (err: any) {
            expect(err.toString()).to.satisfy((msg: string) =>
                msg.includes("already in use") ||
                msg.includes("AccountAlreadyInitialized") ||
                msg.includes("custom program error")
            );
        }
    });

    it("Fails when startTs equals endTs", async () => {
        const nonce = new anchor.BN(888888);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs;

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

    it("Fails when stream duration is too short", async () => {
        const nonce = new anchor.BN(888888);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        // Only 30 seconds duration
        const endTs = startTs.add(new anchor.BN(30));

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
                "Should fail with DurationTooShort"
            );
        } catch (err: any) {
            expect(err.toString()).to.contain(
                "DurationTooShort"
            );
        }
    });

    it("Fails when creator token account is not owned by creator", async () => {
        const other = Keypair.generate();

        const otherAta = (
            await getOrCreateAssociatedTokenAccount(
                provider.connection,
                creator,
                mint,
                other.publicKey
            )
        ).address;

        const nonce = new anchor.BN(123456);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs.add(
            new anchor.BN(100)
        );

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
                    creatorTokenAccount: otherAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

            expect.fail(
                "Should fail because ATA owner != creator"
            );
        } catch (err: any) {
            expect(err.toString()).to.satisfy(
                (msg: string) =>
                    msg.includes("ConstraintTokenOwner") ||
                    msg.includes("owner")
            );
        }
    });

    it("Fails when token account mint mismatches", async () => {
        // =====================================
        // Create Different Mint
        // =====================================

        const anotherMint = await createMint(
            provider.connection,
            creator,
            creator.publicKey,
            null,
            6
        );

        // =====================================
        // Create ATA For Different Mint
        // =====================================

        const wrongTokenAccount = (
            await getOrCreateAssociatedTokenAccount(
                provider.connection,
                creator,
                anotherMint,
                creator.publicKey
            )
        ).address;

        // =====================================
        // Mint Tokens To Wrong ATA
        // =====================================

        await mintTo(
            provider.connection,
            creator,
            anotherMint,
            wrongTokenAccount,
            creator,
            1_000_000
        );

        // =====================================
        // Stream Params
        // =====================================

        const nonce = new anchor.BN(222333);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs.add(
            new anchor.BN(100)
        );

        // =====================================
        // Try Create Stream
        // mint      = original mint
        // token acc = anotherMint ATA
        // =====================================

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

                    // original mint
                    mint,

                    // ATA from DIFFERENT mint
                    creatorTokenAccount:
                        wrongTokenAccount,

                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

            expect.fail(
                "Should fail because token account mint mismatches"
            );
        } catch (err: any) {
            expect(err.toString()).to.satisfy(
                (msg: string) =>
                    msg.includes("ConstraintTokenMint") ||
                    msg.includes("mint")
            );
        }
    });

    it("Fails when token program mismatches mint owner", async () => {
        // =====================================
        // Create NORMAL SPL mint
        // =====================================

        const normalMint = await createMint(
            provider.connection,
            creator,
            creator.publicKey,
            null,
            6,
            undefined,
            undefined,
            TOKEN_PROGRAM_ID
        );

        // =====================================
        // Create ATA
        // =====================================

        const normalAta = (
            await getOrCreateAssociatedTokenAccount(
                provider.connection,
                creator,
                normalMint,
                creator.publicKey
            )
        ).address;

        // =====================================
        // Mint tokens
        // =====================================

        await mintTo(
            provider.connection,
            creator,
            normalMint,
            normalAta,
            creator,
            1_000_000
        );

        // =====================================
        // Stream Params
        // =====================================

        const nonce = new anchor.BN(555666);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs.add(
            new anchor.BN(100)
        );

        // =====================================
        // Pass WRONG token program
        // SPL mint + TOKEN_2022_PROGRAM_ID
        // =====================================

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

                    mint: normalMint,

                    creatorTokenAccount: normalAta,

                    // WRONG PROGRAM
                    tokenProgram:
                        TOKEN_2022_PROGRAM_ID,
                })
                .rpc();

            expect.fail(
                "Should fail because token program mismatches mint owner"
            );
        } catch (err: any) {
            expect(err.toString()).to.satisfy(
                (msg: string) =>
                    msg.includes("incorrect program id") ||
                    msg.includes("Constraint") ||
                    msg.includes("owner")
            );
        }
    });

    it("Prevents replay / duplicate transaction", async () => {
        // =====================================
        // Stream Params
        // =====================================

        const nonce = new anchor.BN(424242);

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs.add(
            new anchor.BN(100)
        );

        // =====================================
        // Derive Stream PDA
        // =====================================

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

        // =====================================
        // FIRST TX -> SUCCESS
        // =====================================

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

        // =====================================
        // Validate Stream Exists
        // =====================================

        const streamBefore =
            await program.account.streamAccount.fetch(
                streamPDA
            );

        expect(
            streamBefore.totalAmount.toString()
        ).to.equal(amount.toString());

        // =====================================
        // SECOND TX SAME INPUT -> FAIL
        // =====================================

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
                "Replay transaction should fail"
            );
        } catch (err: any) {
            expect(err.toString()).to.satisfy(
                (msg: string) =>
                    msg.includes("already in use") ||
                    msg.includes(
                        "AccountAlreadyInitialized"
                    ) ||
                    msg.includes(
                        "custom program error"
                    )
            );
        }

        // =====================================
        // Ensure State Not Corrupted
        // =====================================

        const streamAfter =
            await program.account.streamAccount.fetch(
                streamPDA
            );

        expect(
            streamAfter.totalAmount.toString()
        ).to.equal(amount.toString());

        expect(
            streamAfter.withdrawn.toString()
        ).to.equal("0");

        // =====================================
        // Ensure Vault Not Double Funded
        // =====================================

        const vault =
            await anchor.utils.token.associatedAddress({
                mint,
                owner: streamPDA,
            });

        const vaultAccount =
            await getAccount(
                provider.connection,
                vault
            );

        expect(
            vaultAccount.amount.toString()
        ).to.equal(amount.toString());
    });

    it("Allows multiple streams with same users but different nonce", async () => {
        // =====================================
        // Shared Params
        // =====================================

        const now = Math.floor(Date.now() / 1000);

        const startTs = new anchor.BN(now + 60);

        const endTs = startTs.add(
            new anchor.BN(100)
        );

        // =====================================
        // Nonces
        // =====================================

        const nonceA = new anchor.BN(1001);

        const nonceB = new anchor.BN(1002);

        // =====================================
        // Derive PDAs
        // =====================================

        const [streamPDA1] =
            PublicKey.findProgramAddressSync(
                [
                    Buffer.from("stream"),
                    creator.publicKey.toBuffer(),
                    recipient.publicKey.toBuffer(),
                    nonceA.toArrayLike(Buffer, "le", 8),
                ],
                program.programId
            );

        const [streamPDA2] =
            PublicKey.findProgramAddressSync(
                [
                    Buffer.from("stream"),
                    creator.publicKey.toBuffer(),
                    recipient.publicKey.toBuffer(),
                    nonceB.toArrayLike(Buffer, "le", 8),
                ],
                program.programId
            );

        // =====================================
        // Ensure PDA Different
        // =====================================

        expect(
            streamPDA1.toBase58()
        ).to.not.equal(
            streamPDA2.toBase58()
        );

        // =====================================
        // Create Stream #1
        // =====================================

        await program.methods
            .createStream(
                amount,
                startTs,
                endTs,
                nonceA
            )
            .accounts({
                creator: creator.publicKey,
                recipient: recipient.publicKey,
                mint,
                creatorTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        // =====================================
        // Create Stream #2
        // =====================================

        await program.methods
            .createStream(
                amount,
                startTs,
                endTs,
                nonceB
            )
            .accounts({
                creator: creator.publicKey,
                recipient: recipient.publicKey,
                mint,
                creatorTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        // =====================================
        // Fetch Accounts
        // =====================================

        const stream1 =
            await program.account.streamAccount.fetch(
                streamPDA1
            );

        const stream2 =
            await program.account.streamAccount.fetch(
                streamPDA2
            );

        // =====================================
        // Validate Stream #1
        // =====================================

        expect(
            stream1.creator.toBase58()
        ).to.equal(
            creator.publicKey.toBase58()
        );

        expect(
            stream1.recipient.toBase58()
        ).to.equal(
            recipient.publicKey.toBase58()
        );

        expect(
            stream1.totalAmount.toString()
        ).to.equal(amount.toString());

        // =====================================
        // Validate Stream #2
        // =====================================

        expect(
            stream2.creator.toBase58()
        ).to.equal(
            creator.publicKey.toBase58()
        );

        expect(
            stream2.recipient.toBase58()
        ).to.equal(
            recipient.publicKey.toBase58()
        );

        expect(
            stream2.totalAmount.toString()
        ).to.equal(amount.toString());

        // =====================================
        // Vault Validation
        // =====================================

        const vault1 =
            await anchor.utils.token.associatedAddress({
                mint,
                owner: streamPDA1,
            });

        const vault2 =
            await anchor.utils.token.associatedAddress({
                mint,
                owner: streamPDA2,
            });

        expect(
            vault1.toBase58()
        ).to.not.equal(
            vault2.toBase58()
        );

        const vaultAccount1 =
            await getAccount(
                provider.connection,
                vault1
            );

        const vaultAccount2 =
            await getAccount(
                provider.connection,
                vault2
            );

        expect(
            vaultAccount1.amount.toString()
        ).to.equal(amount.toString());

        expect(
            vaultAccount2.amount.toString()
        ).to.equal(amount.toString());
    });
});