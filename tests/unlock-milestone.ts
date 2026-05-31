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

describe("unlock-milestone", () => {
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

    // ============================================================
    // Edge Case Tests: unlock_milestone  (FIXED)
    // ============================================================

    // -------------------------------------------------------
    // Helper: buat stream milestone baru dengan nonce unik
    // Milestone count HARUS habis bagi TOKEN_AMOUNT (1_000_000)
    // Default = 4 (250_000 each, exact)
    // -------------------------------------------------------
    async function createMilestoneStream(
        program: Program<SolanaProgram>,
        creator: Keypair,
        recipient: Keypair,
        mint: PublicKey,
        creatorTokenAccount: PublicKey,
        nonce: BN,
        milestoneCount: number = 4   // FIX: 4 habis bagi 1_000_000
    ) {
        const total = new BN(TOKEN_AMOUNT);

        // FIX: distribusi sisa ke milestone terakhir agar sum == total_amount
        const perMilestone = Math.floor(TOKEN_AMOUNT / milestoneCount);
        const lastMilestone = TOKEN_AMOUNT - perMilestone * (milestoneCount - 1);

        const [streamPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("stream"),
                creator.publicKey.toBuffer(),
                recipient.publicKey.toBuffer(),
                nonce.toArrayLike(Buffer, "le", 8),
            ],
            program.programId
        );

        const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];
        for (let i = 0; i < milestoneCount; i++) {
            const [pda] = PublicKey.findProgramAddressSync(
                [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
                program.programId
            );
            remainingAccounts.push({ pubkey: pda, isWritable: true, isSigner: false });
        }

        const milestones = Array.from({ length: milestoneCount }, (_, i) => ({
            amount: new BN(i === milestoneCount - 1 ? lastMilestone : perMilestone),
        }));

        await program.methods
            .createStream(
                total,
                new BN(BASE_NOW + 60),
                new BN(BASE_NOW + 60),
                new BN(BASE_NOW + 86400),
                VESTING_TYPE_MILESTONE,
                milestones,
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

        return { streamPDA, remainingAccounts, perMilestone, lastMilestone };
    }

    // -------------------------------------------------------
    // 1. Stranger (bukan creator) tidak bisa unlock milestone
    // -------------------------------------------------------
    it("Fails when non-creator tries to unlock milestone", async () => {
        const nonce = new BN(910001);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: stranger.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[0].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([stranger])
                .rpc(),
            "Unauthorized"
        );
    });

    // -------------------------------------------------------
    // 2. Unlock milestone out-of-order (skip index 0, langsung ke 1)
    //
    // Kenapa ConstraintSeeds, bukan InvalidMilestoneOrder?
    // Struct UnlockMilestone mendefinisikan seeds milestone sebagai:
    //   seeds = [b"milestone", stream.key(), &[stream.next_milestone_index]]
    // Anchor me-derive ulang PDA dari next_milestone_index (= 0) saat validasi akun,
    // SEBELUM masuk ke body instruksi. Jika kita pass PDA index 1 sedangkan
    // next_milestone_index = 0, hasil derive tidak cocok → ConstraintSeeds.
    // InvalidMilestoneOrder hanya bisa tercapai jika seeds lolos, yang tidak mungkin
    // karena Anchor enforce seeds di level account struct.
    // -------------------------------------------------------
    it("Fails when unlocking milestone out of order", async () => {
        const nonce = new BN(910002);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        // Pass PDA index 1, padahal next_milestone_index = 0
        // → Anchor re-derive dari index 0, tidak cocok dengan PDA index 1 → ConstraintSeeds
        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[1].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "ConstraintSeeds"
        );
    });

    // -------------------------------------------------------
    // 3. Unlock milestone yang sama dua kali
    //
    // Kenapa ConstraintSeeds, bukan MilestoneAlreadyUnlocked?
    // Sama seperti test #2 — setelah milestone 0 berhasil unlock,
    // next_milestone_index naik jadi 1. Anchor seeds untuk milestone
    // di-derive dari next_milestone_index (= 1). Jika kita pass
    // PDA index 0 lagi, hasil derive tidak cocok → ConstraintSeeds
    // sebelum sempat cek flag `approved`.
    // -------------------------------------------------------
    it("Fails when trying to unlock an already-unlocked milestone", async () => {
        const nonce = new BN(910033); // nonce berbeda dari test lain untuk hindari tx cache bankrun
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        // Unlock milestone 0 pertama kali — harus sukses
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

        // Coba unlock milestone 0 lagi:
        // next_milestone_index sudah = 1, Anchor derive PDA dari index 1,
        // tapi kita pass PDA index 0 → ConstraintSeeds
        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[0].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "ConstraintSeeds"
        );
    });

    // -------------------------------------------------------
    // 4. Unlock milestone pada stream yang sudah di-cancel
    // -------------------------------------------------------
    it("Fails when stream has been cancelled", async () => {
        const nonce = new BN(910004);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        const vault = getAssociatedTokenAddressSync(mint, streamPDA, true, TOKEN_PROGRAM_ID);
        const recipientAta = getAssociatedTokenAddressSync(mint, recipient.publicKey, true, TOKEN_PROGRAM_ID);

        await program.methods
            .cancel()
            .accountsStrict({
                creator: creator.publicKey,
                mint,
                stream: streamPDA,
                vault,
                creatorTokenAccount,
                recipientTokenAccount: recipientAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[0].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "StreamNotActive"
        );
    });

    // -------------------------------------------------------
    // 5. unlockMilestone tidak bisa dipanggil di stream LINEAR
    // FIX: Anchor menginisialisasi semua akun sebelum mengecek constraints.
    //      Milestone PDA tidak pernah dibuat untuk linear stream →
    //      error yang muncul adalah AccountNotInitialized, bukan InvalidVestingType.
    // -------------------------------------------------------
    it("Fails when stream is not milestone type (linear stream)", async () => {
        const nonce = new BN(910005);
        const startTs = BASE_NOW + 60;
        const endTs = BASE_NOW + 86400;

        const [linearStreamPDA] = PublicKey.findProgramAddressSync(
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
                new BN(TOKEN_AMOUNT),
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
            .remainingAccounts([])
            .signers([creator])
            .rpc();

        // Milestone PDA tidak pernah diinisialisasi untuk stream LINEAR.
        // Anchor resolve akun sebelum cek constraints → AccountNotInitialized lebih dulu.
        const [fakeMilestonePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("milestone"), linearStreamPDA.toBuffer(), Buffer.from([0])],
            program.programId
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: linearStreamPDA,
                    milestone: fakeMilestonePda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "AccountNotInitialized"
        );
    });

    // -------------------------------------------------------
    // 6. Status stream jadi COMPLETED + unlocked_milestone_amount akurat
    // -------------------------------------------------------
    it("Stream status becomes COMPLETED after all milestones unlocked, and unlocked_milestone_amount accumulates correctly", async () => {
        const nonce = new BN(910006);
        const milestoneCount = 4;
        const total = new BN(TOKEN_AMOUNT);

        const { streamPDA, remainingAccounts, perMilestone } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce, milestoneCount
        );

        const STREAM_STATUS_ACTIVE = 1;
        const STREAM_STATUS_COMPLETED = 2;

        let stream = await program.account.streamAccount.fetch(streamPDA);
        expect(stream.status).to.equal(STREAM_STATUS_ACTIVE);
        expect(stream.unlockedMilestoneAmount.toNumber()).to.equal(0);

        let expectedUnlocked = 0;

        for (let i = 0; i < milestoneCount; i++) {
            await program.methods.unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[i].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc();

            stream = await program.account.streamAccount.fetch(streamPDA);
            expectedUnlocked += perMilestone; // semua milestone sama karena count=4, habis bagi

            const isLast = i === milestoneCount - 1;
            expect(stream.status).to.equal(
                isLast ? STREAM_STATUS_COMPLETED : STREAM_STATUS_ACTIVE,
                `Status salah setelah unlock milestone ${i}`
            );
            expect(stream.unlockedMilestoneAmount.toNumber()).to.equal(
                isLast ? total.toNumber() : expectedUnlocked,
                `unlocked_milestone_amount salah setelah unlock milestone ${i}`
            );
            expect(stream.nextMilestoneIndex).to.equal(i + 1);
        }
    });

    // -------------------------------------------------------
    // 7. Fields MilestoneAccount terisi benar setelah unlock
    // -------------------------------------------------------
    it("MilestoneAccount fields are correctly populated after unlock", async () => {
        const nonce = new BN(910007);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        await program.methods.unlockMilestone()
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPDA,
                milestone: remainingAccounts[0].pubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([creator]).rpc();

        const milestone = await program.account.milestoneAccount.fetch(remainingAccounts[0].pubkey);

        expect(milestone.approved).to.equal(true, "approved harus true");
        expect(milestone.unlocked).to.equal(true, "unlocked harus true");
        expect(milestone.unlockTs.toNumber()).to.be.greaterThan(0, "unlock_ts harus terisi");
        expect(milestone.stream.toBase58()).to.equal(streamPDA.toBase58(), "stream key harus cocok");
        expect(milestone.index).to.equal(0, "index milestone harus 0");
    });

});
