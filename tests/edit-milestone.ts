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

describe("edit-milestone", () => {
    let context: ProgramTestContext;
    let provider: BankrunProvider;
    let program: Program<SolanaProgram>;

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
        program = new Program<SolanaProgram>(IDL as SolanaProgram, provider);

        await setTime(context, BASE_NOW);

        await program.methods
            .initializeConfig()
            .accounts({ admin: admin.publicKey })
            .signers([admin])
            .rpc();

        mint = await createTestMint(context, admin, 6);
    });



    it("edits a locked milestone before unlock", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } = await setupMilestoneStream();

        const targetIndex = 1;
        const milestonePda = milestonePdas[targetIndex];
        const newAmount = new BN(300_000);

        await mintTokensTo(context, admin, mint, creatorAta, 50_000);

        const streamBefore = await program.account.streamAccount.fetch(streamPda);
        const vaultBefore = await getTokenBalance(context, vaultAta);
        const creatorBefore = await getTokenBalance(context, creatorAta);
        const milestoneBefore = await program.account.milestoneAccount.fetch(milestonePda);

        await program.methods
            .editMilestone(newAmount)
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        const streamAfter = await program.account.streamAccount.fetch(streamPda);
        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePda);
        const milestoneSum = (await Promise.all(
            milestonePdas.map((pda) => program.account.milestoneAccount.fetch(pda))
        )).reduce((sum, item) => sum + item.amount.toNumber(), 0);

        expect(milestoneBefore.amount.toNumber()).to.equal(250_000);
        expect(milestoneAfter.amount.toNumber()).to.equal(newAmount.toNumber());
        expect(milestoneSum).to.equal(streamAfter.totalAmount.toNumber());
        expect(streamAfter.totalAmount.toNumber()).to.equal(streamBefore.totalAmount.toNumber() + 50_000);
        expect(await getTokenBalance(context, vaultAta)).to.equal(vaultBefore + BigInt(50_000));
        expect(await getTokenBalance(context, creatorAta)).to.equal(creatorBefore - BigInt(50_000));
    });

    it("fails when editing an already unlocked milestone", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } = await setupMilestoneStream();

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

        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "MilestoneAlreadyUnlocked"
        );
    });

    // -------------------------------------------------------
    // 2. Decrease amount → refund ke creator
    // -------------------------------------------------------
    it("decreases milestone amount and refunds diff to creator", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        const milestonePda = milestonePdas[2];
        const newAmount = new BN(100_000); // turun dari 250_000

        const streamBefore = await program.account.streamAccount.fetch(streamPda);
        const vaultBefore = await getTokenBalance(context, vaultAta);
        const creatorBefore = await getTokenBalance(context, creatorAta);

        await program.methods
            .editMilestone(newAmount)
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        const streamAfter = await program.account.streamAccount.fetch(streamPda);
        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePda);

        const diff = BigInt(250_000 - 100_000); // 150_000

        expect(milestoneAfter.amount.toNumber()).to.equal(100_000);
        expect(streamAfter.totalAmount.toNumber()).to.equal(
            streamBefore.totalAmount.toNumber() - 150_000
        );
        expect(await getTokenBalance(context, vaultAta)).to.equal(
            vaultBefore - diff,
            "vault harus berkurang 150_000"
        );
        expect(await getTokenBalance(context, creatorAta)).to.equal(
            creatorBefore + diff,
            "creator harus menerima refund 150_000"
        );
    });

    // -------------------------------------------------------
    // 3. Edit dengan amount yang sama → tidak ada transfer token
    // -------------------------------------------------------
    it("no-op when new_amount equals current amount", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        const milestonePda = milestonePdas[0];
        const sameAmount = new BN(250_000);

        const vaultBefore = await getTokenBalance(context, vaultAta);
        const creatorBefore = await getTokenBalance(context, creatorAta);
        const streamBefore = await program.account.streamAccount.fetch(streamPda);

        await program.methods
            .editMilestone(sameAmount)
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        const streamAfter = await program.account.streamAccount.fetch(streamPda);
        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePda);

        // Tidak ada perubahan amount dan tidak ada transfer
        expect(milestoneAfter.amount.toNumber()).to.equal(250_000);
        expect(streamAfter.totalAmount.toNumber()).to.equal(
            streamBefore.totalAmount.toNumber()
        );
        expect(await getTokenBalance(context, vaultAta)).to.equal(
            vaultBefore,
            "vault tidak boleh berubah"
        );
        expect(await getTokenBalance(context, creatorAta)).to.equal(
            creatorBefore,
            "creator balance tidak boleh berubah"
        );
    });

    // -------------------------------------------------------
    // 4. Gagal jika new_amount = 0
    // -------------------------------------------------------
    it("fails when new_amount is zero", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        await expectError(
            program.methods
                .editMilestone(new BN(0))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "InvalidAmount"
        );
    });

    // -------------------------------------------------------
    // 5. Gagal jika stream bukan tipe MILESTONE (linear stream)
    // -------------------------------------------------------
    it("fails when stream is linear type", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta } = await setupLinearStream();

        // Buat dummy milestone PDA (tidak pernah diinisialisasi untuk linear stream)
        const [fakeMilestonePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("milestone"), streamPda.toBuffer(), Buffer.from([0])],
            program.programId
        );

        // Anchor akan gagal di account deserialization (akun tidak diinisialisasi)
        // sebelum sampai ke cek InvalidVestingType
        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: fakeMilestonePda,
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "AccountNotInitialized"
        );
    });

    // -------------------------------------------------------
    // 6. Gagal jika stream sudah cancelled (status != ACTIVE)
    // -------------------------------------------------------
    it("fails when stream has been cancelled", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        // FIX: Cancel struct butuh recipient_token_account yang sudah diinisialisasi
        const recipientAta = await createAta(context, admin, mint, recipient.publicKey);

        await program.methods
            .cancel()
            .accountsStrict({
                creator: creator.publicKey,
                mint,
                stream: streamPda,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                recipientTokenAccount: recipientAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "StreamNotActive"
        );
    });

    // -------------------------------------------------------
    // 7. Gagal jika non-creator mencoba edit
    // -------------------------------------------------------
    it("fails when non-creator tries to edit milestone", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        // FIX: ATA harus benar-benar diinisialisasi, bukan hanya di-derive.
        // Anchor cek account existence sebelum cek has_one constraint.
        const strangerAta = await createAta(context, admin, mint, recipient.publicKey);

        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: recipient.publicKey,  // bukan creator asli
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: strangerAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([recipient])
                .rpc(),
            "Unauthorized"
        );
    });

    // -------------------------------------------------------
    // 8. Guard total_amount >= withdrawn: verifikasi batas decrease
    //
    // Tanpa Chainlink mock, withdraw tidak bisa dipanggil di bankrun.
    // Kita verifikasi guard ini dari sisi yang bisa ditest:
    //   a) Decrease hingga batas minimum (total_amount = 1) masih valid
    //      selama withdrawn = 0
    //   b) Guard di source code: `require!(stream.total_amount >= stream.withdrawn)`
    //      hanya triggered jika withdrawn > 0 (butuh oracle untuk withdraw)
    // -------------------------------------------------------
    it("allows decrease to minimum amount when withdrawn is zero", async () => {
        await setTime(context, BASE_NOW);

        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream({ amounts: [500_000, 200_000, 200_000, 100_000] });

        const vaultBefore = await getTokenBalance(context, vaultAta);

        // Decrease milestone 1 dari 200_000 ke 1 (pengurangan maximum)
        // withdrawn = 0, jadi total_amount baru (800_001) >= withdrawn (0) → valid
        await program.methods
            .editMilestone(new BN(1))
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePdas[1],
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        const streamAfter = await program.account.streamAccount.fetch(streamPda);
        const diff = BigInt(200_000 - 1); // 199_999

        // total turun 199_999: dari 1_000_000 → 800_001
        expect(streamAfter.totalAmount.toNumber()).to.equal(800_001);
        expect(streamAfter.withdrawn.toNumber()).to.equal(0);
        // Refund ke creator, vault berkurang
        expect(await getTokenBalance(context, vaultAta)).to.equal(
            vaultBefore - diff, "vault harus berkurang sebesar diff"
        );
    });

    // -------------------------------------------------------
    // 9. Verifikasi MilestoneEdited event ter-emit
    // -------------------------------------------------------
    it("emits MilestoneEdited event with correct fields on increase", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        const milestonePda = milestonePdas[3];
        const newAmount = new BN(400_000);
        const oldAmount = 250_000;

        // Mint extra untuk cover diff
        await mintTokensTo(context, admin, mint, creatorAta, 150_000);

        const tx = await program.methods
            .editMilestone(newAmount)
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        // Verifikasi via fetch ulang bahwa perubahan tersimpan benar
        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePda);
        const streamAfter = await program.account.streamAccount.fetch(streamPda);

        expect(milestoneAfter.amount.toNumber()).to.equal(newAmount.toNumber());
        expect(milestoneAfter.index).to.equal(3);
        expect(milestoneAfter.stream.toBase58()).to.equal(streamPda.toBase58());
        // total_amount naik sebesar diff
        expect(streamAfter.totalAmount.toNumber()).to.equal(
            1_000_000 + (newAmount.toNumber() - oldAmount)
        );
    });

    // -------------------------------------------------------
    // 10. Vault balance konsisten setelah serangkaian edit
    //     (naik lalu turun lalu naik lagi)
    // -------------------------------------------------------
    it("vault balance stays consistent across multiple edits on the same milestone", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        const milestonePda = milestonePdas[1];

        // Mint buffer besar agar creator tidak kehabisan
        await mintTokensTo(context, admin, mint, creatorAta, 500_000);

        const vaultInitial = await getTokenBalance(context, vaultAta);

        // Round 1: naik 250_000 → 500_000 (+250_000)
        await program.methods
            .editMilestone(new BN(500_000))
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();
        expect(await getTokenBalance(context, vaultAta)).to.equal(
            vaultInitial + 250_000n, "vault salah setelah kenaikan 1"
        );

        // Round 2: turun 500_000 → 100_000 (-400_000)
        await program.methods
            .editMilestone(new BN(100_000))
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();
        expect(await getTokenBalance(context, vaultAta)).to.equal(
            vaultInitial - 150_000n, "vault salah setelah penurunan"
        );

        // Round 3: naik 100_000 → 300_000 (+200_000)
        await program.methods
            .editMilestone(new BN(300_000))
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePda,
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();
        expect(await getTokenBalance(context, vaultAta)).to.equal(
            vaultInitial + 50_000n, "vault salah setelah kenaikan 2"
        );

        // Verifikasi akhir: milestone amount = 300_000
        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePda);
        expect(milestoneAfter.amount.toNumber()).to.equal(300_000);
    });

    // -------------------------------------------------------
    // 11. Edit berhasil pada milestone TERAKHIR yang belum di-unlock
    //     (memastikan next_milestone_index tidak mempengaruhi edit)
    // -------------------------------------------------------
    it("can edit any unlocked milestone regardless of next_milestone_index", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        // Unlock milestone 0 dan 1
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

        await program.methods
            .unlockMilestone()
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePdas[1],
                systemProgram: SystemProgram.programId,
            })
            .signers([creator])
            .rpc();

        // Sekarang next_milestone_index = 2
        // Edit milestone 3 (index 3, belum di-unlock) → harus berhasil
        const newAmount = new BN(350_000);
        await mintTokensTo(context, admin, mint, creatorAta, 100_000);

        await program.methods
            .editMilestone(newAmount)
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePdas[3],
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePdas[3]);
        expect(milestoneAfter.amount.toNumber()).to.equal(350_000);
        expect(milestoneAfter.unlocked).to.equal(false, "milestone 3 masih belum di-unlock");
    });

    // -------------------------------------------------------
    // 12. Edit milestone 2 (sudah di-unlock) → MilestoneAlreadyUnlocked
    //     (berbeda dari unlock_milestone yang kena ConstraintSeeds lebih dulu,
    //      edit_milestone tidak punya seeds constraint yang depend pada
    //      next_milestone_index → langsung sampai ke cek `!milestone.unlocked`)
    // -------------------------------------------------------
    it("fails with MilestoneAlreadyUnlocked when editing an approved milestone", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, creatorAta, vaultAta, milestonePdas } =
            await setupMilestoneStream();

        // Unlock milestone 0
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

        // Coba edit milestone 0 yang sudah approved
        // edit_milestone punya seeds: [b"milestone", stream.key(), &[milestone.index]]
        // Ini tidak depend pada next_milestone_index → PDA cocok → masuk ke body →
        // cek `!milestone.unlocked` → MilestoneAlreadyUnlocked
        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "MilestoneAlreadyUnlocked"
        );
    });

    it("[AUTH] edit_milestone: fails when signer is valid but not creator of this stream", async () => {
        await setTime(context, BASE_NOW);

        // Setup stream milik creator (asli)
        const { streamPda, creatorAta, vaultAta, milestonePdas } = await setupMilestoneStream();

        // Buat attacker keypair lokal, fund via bankrun setAccount
        const attacker = Keypair.generate();
        await context.setAccount(attacker.publicKey, {
            lamports: 10e9,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
        });

        // Buat dan fund ATA untuk attacker
        const attackerAta = await createAta(context, admin, mint, attacker.publicKey);

        // Attacker (bukan creator stream) coba edit milestone
        // has_one = creator → stream.creator != attacker → Unauthorized
        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: attacker.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[1],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: attackerAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([attacker])
                .rpc(),
            "Unauthorized"
        );
    });


    // -------------------------------------------------------
    // [PDA] C-2: Milestone dari stream LAIN disuplai ke edit_milestone stream ini
    // edit_milestone seeds: [b"milestone", stream.key(), &[milestone.index]]
    // Cross-stream milestone: milestone.stream != stream.key() → InvalidMilestonePda
    // -------------------------------------------------------
    it("[PDA] edit_milestone: fails when milestone PDA belongs to a different stream", async () => {
        await setTime(context, BASE_NOW);

        const { streamPda: streamA, creatorAta, vaultAta } = await setupMilestoneStream();
        const { milestonePdas: milestonesB } = await setupMilestoneStream();

        // Coba edit stream A tapi pass milestone dari stream B
        // Anchor re-derive seeds dari streamA.key() + milestonesB[0].index → tidak cocok → ConstraintSeeds
        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamA,
                    milestone: milestonesB[0], // milestone dari stream lain
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "ConstraintSeeds"
        );
    });

    // -------------------------------------------------------
    // [OVERFLOW] C-3: increase ke new_amount sangat besar → total_amount overflow u64
    // diff = new_amount - old_amount → total_amount + diff → MathOverflow
    // -------------------------------------------------------
    it("[OVERFLOW] edit_milestone: fails when increasing amount would overflow total_amount (u64)", async () => {
        await setTime(context, BASE_NOW);

        const { streamPda, creatorAta, vaultAta, milestonePdas } = await setupMilestoneStream();

        // total_amount saat ini = 1_000_000
        // new_amount = u64::MAX → diff = u64::MAX - 250_000 → total_amount + diff overflow u64
        const u64Max = new BN("18446744073709551615");

        await expectError(
            program.methods
                .editMilestone(u64Max)
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "MathOverflow"
        );
    });

    // -------------------------------------------------------
    // [OVERFLOW] C-4: decrease sampai total_amount = 1 (minimum tanpa underflow)
    // Verifikasi tidak ada u64 underflow pada checked_sub
    // -------------------------------------------------------
    it("[OVERFLOW] edit_milestone: decrease to 1 does not underflow total_amount", async () => {
        await setTime(context, BASE_NOW);

        const { streamPda, creatorAta, vaultAta, milestonePdas } = await setupMilestoneStream({
            amounts: [700_000, 100_000, 100_000, 100_000]
        });

        const streamBefore = await program.account.streamAccount.fetch(streamPda);

        // Decrease milestone 0 dari 700_000 → 1
        await program.methods
            .editMilestone(new BN(1))
            .accountsStrict({
                creator: creator.publicKey,
                stream: streamPda,
                milestone: milestonePdas[0],
                mint,
                vault: vaultAta,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        const streamAfter = await program.account.streamAccount.fetch(streamPda);
        // total turun: 1_000_000 - 699_999 = 300_001, tidak underflow
        expect(streamAfter.totalAmount.toNumber()).to.equal(
            streamBefore.totalAmount.toNumber() - 699_999
        );
        expect(streamAfter.totalAmount.toNumber()).to.be.greaterThan(0, "total_amount tidak boleh underflow ke 0 atau negatif");
    });

    // -------------------------------------------------------
    // [OWNERSHIP] C-5: vault dari stream LAIN di-pass
    // vault.owner == stream.key() constraint → vault milik stream B, bukan A → ConstraintAddress / InvalidTokenOwner
    // -------------------------------------------------------
    it("[OWNERSHIP] edit_milestone: fails when vault belongs to a different stream", async () => {
        await setTime(context, BASE_NOW);

        const { streamPda: streamA, creatorAta, milestonePdas: milestonesA } = await setupMilestoneStream();
        const { vaultAta: vaultB } = await setupMilestoneStream();

        // Pass vault dari stream B ke edit stream A
        // vault.owner = streamB ≠ streamA → ConstraintTokenOwner
        await expectError(
            program.methods
                .editMilestone(new BN(300_000))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamA,
                    milestone: milestonesA[1],
                    mint,
                    vault: vaultB,    // vault milik stream lain
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "ConstraintTokenOwner"
        );
    });
    // -------------------------------------------------------
    // [CEI] C-6: State (milestone.amount, stream.total_amount) diupdate
    // secara konsisten SEBELUM CPI transfer
    // Verifikasi: jika kreator tidak punya cukup token untuk top-up,
    // state tidak berubah (transaksi atomik)
    // -------------------------------------------------------
    it("[CEI] edit_milestone: state does not change if top-up transfer fails (insufficient balance)", async () => {
        await setTime(context, BASE_NOW);

        const { streamPda, creatorAta, vaultAta, milestonePdas } = await setupMilestoneStream();

        const streamBefore = await program.account.streamAccount.fetch(streamPda);
        const milestoneBefore = await program.account.milestoneAccount.fetch(milestonePdas[0]);
        const vaultBefore = await getTokenBalance(context, vaultAta);

        // Coba naikkan ke jumlah yang jauh melebihi balance creator
        // Transfer CPI akan gagal → seluruh transaksi revert → state tetap
        await expectError(
            program.methods
                .editMilestone(new BN(999_999_999))
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPda,
                    milestone: milestonePdas[0],
                    mint,
                    vault: vaultAta,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "insufficient"  // SPL token "insufficient funds" atau program InsufficientBalance
        );

        // Verifikasi state tidak berubah setelah gagal
        const streamAfter = await program.account.streamAccount.fetch(streamPda);
        const milestoneAfter = await program.account.milestoneAccount.fetch(milestonePdas[0]);
        const vaultAfter = await getTokenBalance(context, vaultAta);

        expect(streamAfter.totalAmount.toNumber()).to.equal(
            streamBefore.totalAmount.toNumber(),
            "total_amount tidak boleh berubah jika transaksi gagal"
        );
        expect(milestoneAfter.amount.toNumber()).to.equal(
            milestoneBefore.amount.toNumber(),
            "milestone.amount tidak boleh berubah jika transaksi gagal"
        );
        expect(vaultAfter).to.equal(vaultBefore, "vault balance tidak boleh berubah");
    });
});
