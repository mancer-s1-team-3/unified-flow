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
    createMintToInstruction,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
    PublicKey,
    Keypair,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { UnifiedFlow } from "../target/types/unified_flow";
import IDL from "../target/idl/unified_flow.json";

const BASE_NOW = 1_700_000_000;
const TOKEN_AMOUNT = 1_000_000;

const VESTING_TYPE_LINEAR = 0;
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

async function createMilestoneStream(
    program: Program<UnifiedFlow>,
    creator: Keypair,
    recipient: Keypair,
    mint: PublicKey,
    creatorTokenAccount: PublicKey,
    nonce: BN,
    milestoneCount: number = 4
) {
    const total = new BN(TOKEN_AMOUNT);
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

// Decode MilestoneUnlocked event dari simulate logs
function decodeEventFromLogs(program: Program<UnifiedFlow>, logs: readonly string[]): any | null {
    for (const log of logs) {
        // bankrun emit event sebagai "Program data: <base64>"
        // anchor.coder.events.decode expect raw base64, bukan full log line
        try {
            let base64: string | null = null;

            if (log.startsWith("Program data: ")) {
                base64 = log.slice("Program data: ".length).trim();
            } else if (log.startsWith("Program log: ")) {
                base64 = log.slice("Program log: ".length).trim();
            }

            if (!base64) continue;

            const decoded = program.coder.events.decode(base64);
            if (decoded?.name === "milestoneUnlocked") return decoded.data;
        } catch (_) { }
    }
    return null;
}

describe("unlock-milestone", () => {
    let context: ProgramTestContext;
    let provider: BankrunProvider;
    let program: Program<UnifiedFlow>;

    let admin: Keypair;
    let creator: Keypair;
    let recipient: Keypair;
    let stranger: Keypair;

    let mint: PublicKey;
    let creatorTokenAccount: PublicKey;

    const amount = new BN(TOKEN_AMOUNT);

    beforeEach(async () => {
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
        program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

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

        let stream = await program.account.streamAccount.fetch(streamPDA);
        expect(stream.vestingType).to.equal(VESTING_TYPE_MILESTONE);

        for (let i = 0; i < 4; i++) {
            await program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[i].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc();

            const m = await program.account.milestoneAccount.fetch(remainingAccounts[i].pubkey);
            expect(m.approved).to.equal(true);
        }
    });

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

    it("Fails when unlocking milestone out of order", async () => {
        const nonce = new BN(910002);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

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

    it("Fails when trying to unlock an already-unlocked milestone", async () => {
        const nonce = new BN(910198);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

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

        await setTime(context, BASE_NOW + 1);

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

    it("Fails when stream has been cancelled", async () => {
        const nonce = new BN(910004);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        const vault = getAssociatedTokenAddressSync(mint, streamPDA, true, TOKEN_PROGRAM_ID);
        const recipientAta = getAssociatedTokenAddressSync(mint, recipient.publicKey, true, TOKEN_PROGRAM_ID);

        await program.methods
            .cancel()
            .accounts({
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
            expectedUnlocked += perMilestone;

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
    // 7. Fields MilestoneAccount + event MilestoneUnlocked
    // Simulate dulu untuk capture event dari logs,
    // lalu rpc() untuk commit state — keduanya pakai bankrun.
    // -------------------------------------------------------
    it("MilestoneAccount fields are correctly populated after unlock, and MilestoneUnlocked event is emitted with correct fields", async () => {
        const nonce = new BN(910007);
        const { streamPDA, remainingAccounts, perMilestone } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        // ── Step 1: build tx manual → simulate via banksClient ──
        const unlockIx = await program.methods
            .unlockMilestone()
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPDA,
                milestone: remainingAccounts[0].pubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .instruction();

        const simTx = new Transaction();
        simTx.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0];
        simTx.feePayer = creator.publicKey;
        simTx.add(unlockIx);
        simTx.sign(creator);

        const simResult = await context.banksClient.simulateTransaction(simTx);
        const logs = simResult.meta?.logMessages ?? [];

        const event = decodeEventFromLogs(program, logs);

        // ── Step 2: commit via rpc() ──
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

        const milestone = await program.account.milestoneAccount.fetch(remainingAccounts[0].pubkey);

        // ── State assertions ──
        expect(milestone.approved).to.equal(true, "approved harus true");
        expect(milestone.unlocked).to.equal(true, "unlocked harus true");
        expect(milestone.unlockTs.toNumber()).to.be.greaterThan(0, "unlock_ts harus terisi");
        expect(milestone.stream.toBase58()).to.equal(streamPDA.toBase58(), "stream key harus cocok");
        expect(milestone.index).to.equal(0, "index milestone harus 0");

        // ── Event assertions ──
        expect(event, "event MilestoneUnlocked harus ada di logs").to.not.be.null;
        expect(event.stream.toBase58()).to.equal(streamPDA.toBase58(), "event.stream harus cocok");
        expect(event.milestone.toBase58()).to.equal(
            remainingAccounts[0].pubkey.toBase58(), "event.milestone harus cocok"
        );
        expect(event.index).to.equal(0, "event.index harus 0");
        expect(event.amount.toNumber()).to.equal(perMilestone, "event.amount harus sama dengan perMilestone");
        expect(event.unlockTs.toNumber()).to.be.greaterThan(0, "event.unlock_ts harus terisi");
    });
    it("[AUTH] unlock_milestone: fails when signer is creator of a different stream", async () => {
        const creatorB = stranger;

        const nonceB = new BN(2300001);
        const [streamB] = PublicKey.findProgramAddressSync(
            [Buffer.from("stream"), creatorB.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonceB.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        const strangerAta = getAssociatedTokenAddressSync(mint, creatorB.publicKey, true, TOKEN_PROGRAM_ID);

        await sendIx(context, admin, [
            createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, strangerAta, creatorB.publicKey, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
        ]);
        await mintTokensTo(context, admin, mint, strangerAta, TOKEN_AMOUNT);

        const milestonesB = buildMilestoneRemainingAccounts(streamB, 4, program.programId);
        await program.methods
            .createStream(amount, new BN(BASE_NOW + 60), new BN(BASE_NOW + 60), new BN(BASE_NOW + 86400), VESTING_TYPE_MILESTONE,
                [{ amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }, { amount: amount.div(new BN(4)) }], nonceB)
            .accounts({ creator: creatorB.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount: strangerAta, tokenProgram: TOKEN_PROGRAM_ID })
            .remainingAccounts(milestonesB)
            .signers([creatorB])
            .rpc();

        const nonceA = new BN(2300002);
        const { streamPDA: streamA, remainingAccounts: milestonesA } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonceA
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creatorB.publicKey,
                    stream: streamA,
                    milestone: milestonesA[0].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creatorB])
                .rpc(),
            "Unauthorized"
        );
    });

    it("[PDA] unlock_milestone: fails when milestone PDA belongs to a different stream", async () => {
        const nonceA = new BN(2300003);
        const nonceB = new BN(2300004);

        const { streamPDA: streamA } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonceA
        );
        const { remainingAccounts: milestonesB } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonceB
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamA,
                    milestone: milestonesB[0].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "ConstraintSeeds"
        );
    });

    it("[OVERFLOW] unlock_milestone: unlocked_milestone_amount accumulates without overflow for large amounts", async () => {
        const nonce = new BN(2300005);
        const largeAmount = 1_000_000_000;
        const perMilestone = largeAmount / 4;

        const [streamPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        const remainingAccounts = buildMilestoneRemainingAccounts(streamPDA, 4, program.programId);

        await mintTokensTo(context, admin, mint, creatorTokenAccount, largeAmount);

        await program.methods
            .createStream(new BN(largeAmount), new BN(BASE_NOW + 60), new BN(BASE_NOW + 60), new BN(BASE_NOW + 86400), VESTING_TYPE_MILESTONE,
                Array(4).fill({ amount: new BN(perMilestone) }), nonce)
            .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
            .remainingAccounts(remainingAccounts)
            .signers([creator])
            .rpc();

        let expectedUnlocked = 0;
        for (let i = 0; i < 4; i++) {
            await program.methods.unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[i].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc();

            expectedUnlocked += perMilestone;
            const stream = await program.account.streamAccount.fetch(streamPDA);
            expect(stream.unlockedMilestoneAmount.toNumber()).to.equal(
                expectedUnlocked,
                `unlocked_milestone_amount salah setelah milestone ${i}`
            );
        }

        const streamFinal = await program.account.streamAccount.fetch(streamPDA);
        expect(streamFinal.unlockedMilestoneAmount.toNumber()).to.equal(largeAmount);
        expect(streamFinal.status).to.equal(2);
    });

    it("[CEI] unlock_milestone: all state fields update atomically in single transaction", async () => {
        const nonce = new BN(2300006);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        const streamBefore = await program.account.streamAccount.fetch(streamPDA);
        const unlockedBefore = streamBefore.unlockedMilestoneAmount.toNumber();
        const nextIndexBefore = streamBefore.nextMilestoneIndex;

        await program.methods.unlockMilestone()
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPDA,
                milestone: remainingAccounts[0].pubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([creator])
            .rpc();

        const streamAfter = await program.account.streamAccount.fetch(streamPDA);
        const milestoneAfter = await program.account.milestoneAccount.fetch(remainingAccounts[0].pubkey);

        expect(milestoneAfter.approved).to.equal(true, "approved harus true");
        expect(milestoneAfter.unlocked).to.equal(true, "unlocked harus true");
        expect(milestoneAfter.unlockTs.toNumber()).to.be.greaterThan(0, "unlock_ts harus terisi");

        expect(streamAfter.unlockedMilestoneAmount.toNumber()).to.equal(
            unlockedBefore + milestoneAfter.amount.toNumber(),
            "unlocked_milestone_amount harus naik persis sebesar milestone.amount"
        );
        expect(streamAfter.nextMilestoneIndex).to.equal(
            nextIndexBefore + 1,
            "next_milestone_index harus increment 1"
        );
        expect(streamAfter.status).to.equal(1, "status harus tetap ACTIVE");
    });

    it("[0-SIGNER] unlock_milestone: recipient cannot call unlock pretending to be creator", async () => {
        const nonce = new BN(3400001);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: recipient.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[0].pubkey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([recipient])
                .rpc(),
            "Unauthorized"
        );
    });

    it("[3-COSPLAY] unlock_milestone: fails when stream account is passed as milestone (type cosplay)", async () => {
        const nonce = new BN(3400002);
        const { streamPDA } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: streamPDA,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "AccountDiscriminatorMismatch"
        );
    });

    it("[5-ARBI-CPI] unlock_milestone: fails when fake system_program is passed", async () => {
        const nonce = new BN(3400003);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: remainingAccounts[0].pubkey,
                    systemProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "InvalidProgramId"
        );
    });

    it("[7-BUMP] unlock_milestone: stream and milestone bump remain canonical after unlock", async () => {
        const nonce = new BN(3400004);
        const { streamPDA, remainingAccounts } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        const [, canonicalStreamBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        const [, canonicalMilestoneBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([0])],
            program.programId
        );

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

        const stream = await program.account.streamAccount.fetch(streamPDA);
        const milestone = await program.account.milestoneAccount.fetch(remainingAccounts[0].pubkey);

        expect(stream.bump).to.equal(canonicalStreamBump, "stream.bump harus tetap canonical");
        expect(milestone.bump).to.equal(canonicalMilestoneBump, "milestone.bump harus tetap canonical");
    });

    it("[6-DUPE] unlock_milestone: stream PDA cannot be used as both stream and milestone", async () => {
        const nonce = new BN(3400005);
        const { streamPDA } = await createMilestoneStream(
            program, creator, recipient, mint, creatorTokenAccount, nonce
        );

        await expectError(
            program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPDA,
                    milestone: streamPDA,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "AccountDiscriminatorMismatch"
        );
    });
});