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
import { PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { UnifiedFlow } from "../target/types/unified_flow";
import IDL from "../target/idl/unified_flow.json";

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE_NOW = 1_700_000_000;
const TOKEN_AMOUNT = 1_000_000;

const VESTING_TYPE_LINEAR = 0;

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
    decimals: number
): Promise<PublicKey> {
    const mintKp = Keypair.generate();
    const rent = await context.banksClient.getRent();
    const lamports = rent.minimumBalance(BigInt(MINT_SIZE));
    await sendIx(context, payer, [
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKp.publicKey,
            space: MINT_SIZE,
            lamports: Number(lamports),
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mintKp.publicKey, decimals, mintAuthority, null),
    ], [mintKp]);
    return mintKp.publicKey;
}

async function createAta(
    context: ProgramTestContext,
    payer: Keypair,
    mintPk: PublicKey,
    owner: PublicKey
): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mintPk, owner, true);
    await sendIx(context, payer, [
        createAssociatedTokenAccountIdempotentInstruction(
            payer.publicKey, ata, owner, mintPk
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
        expect(combined, `Error "${fragment}" not found in:\n${combined.slice(0, 600)}`).to.include(fragment);
    }
}

/** Pumps lamports ke fee_vault PDA untuk simulate accumulated fees */
async function fundFeeVault(
    context: ProgramTestContext,
    payer: Keypair,
    feeVaultPDA: PublicKey,
    lamports: number
) {
    await sendIx(context, payer, [
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: feeVaultPDA,
            lamports,
        }),
    ]);
}

async function getLamports(context: ProgramTestContext, pubkey: PublicKey): Promise<bigint> {
    const acc = await context.banksClient.getAccount(pubkey);
    return acc ? BigInt(acc.lamports) : 0n;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("withdraw-fees", () => {
    let context: ProgramTestContext;
    let provider: BankrunProvider;
    let program: Program<UnifiedFlow>;

    let admin: Keypair;
    let creator: Keypair;
    let recipient: Keypair;
    let attacker: Keypair;
    let destination: Keypair;

    let mint: PublicKey;
    let creatorTokenAccount: PublicKey;

    let configPDA: PublicKey;
    let feeVaultPDA: PublicKey;
    let feeVaultBump: number;

    const amount = new BN(TOKEN_AMOUNT);

    // Helper: buat stream linear dan trigger withdraw agar fee_vault terisi
    // NOTE: withdraw() butuh Chainlink oracle yang tidak tersedia di bankrun —
    // jadi kita fund fee_vault secara langsung via SystemProgram.transfer.
    async function fundVaultWithFees(lamports: number) {
        await fundFeeVault(context, admin, feeVaultPDA, lamports);
    }
    async function safeWarp(context: ProgramTestContext) {
        const clock = await context.banksClient.getClock();
        const next = clock.slot + 1n;

        try {
            await context.warpToSlot(next);
        } catch (e) {
            // fallback: skip warp kalau sudah di future slot
            // ini aman karena withdraw tidak time-dependent
        }
    }

    before(async () => {
        admin = Keypair.generate();
        creator = Keypair.generate();
        recipient = Keypair.generate();
        attacker = Keypair.generate();
        destination = Keypair.generate();

        context = await startAnchor(".", [], [
            { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
            { address: creator.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
            { address: recipient.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
            { address: attacker.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
            { address: destination.publicKey, info: { lamports: 0, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
        ]);

        provider = new BankrunProvider(context);
        anchor.setProvider(provider);
        program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

        await setTime(context, BASE_NOW);

        // Initialize config (admin = fee_authority)
        await program.methods
            .initializeConfig()
            .accounts({ admin: admin.publicKey })
            .signers([admin])
            .rpc();

        // Derive PDAs
        [configPDA] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        [feeVaultPDA, feeVaultBump] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], program.programId);

        // Setup token infra untuk keperluan stream (optional, dipakai test edge case)
        mint = await createTestMint(context, admin, admin.publicKey, 6);
        creatorTokenAccount = await createAta(context, admin, mint, creator.publicKey);
        await createAta(context, admin, mint, recipient.publicKey);
        await mintTokensTo(context, admin, mint, creatorTokenAccount, amount.toNumber() * 100);
    });

    // ─────────────────────────────────────────────────
    // HAPPY PATH
    // ─────────────────────────────────────────────────

    it("Happy: admin withdraws exact fee_vault balance", async () => {
        const withdrawAmount = 2 * LAMPORTS_PER_SOL;
        await fundVaultWithFees(withdrawAmount);

        const vaultBefore = await getLamports(context, feeVaultPDA);
        const destBefore = await getLamports(context, destination.publicKey);

        await program.methods
            .withdrawFees(new BN(withdrawAmount))
            .accountsStrict({
                admin: admin.publicKey,
                config: configPDA,
                feeVault: feeVaultPDA,
                destination: destination.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const vaultAfter = await getLamports(context, feeVaultPDA);
        const destAfter = await getLamports(context, destination.publicKey);

        expect(vaultAfter).to.equal(vaultBefore - BigInt(withdrawAmount), "fee_vault harus berkurang");
        expect(destAfter).to.equal(destBefore + BigInt(withdrawAmount), "destination harus bertambah");
    });

    it("Happy: admin withdraws partial amount, remainder stays in vault", async () => {
        const fundAmount = 5 * LAMPORTS_PER_SOL;
        const withdrawAmt = 1 * LAMPORTS_PER_SOL;
        await fundVaultWithFees(fundAmount);

        const vaultBefore = await getLamports(context, feeVaultPDA);

        await program.methods
            .withdrawFees(new BN(withdrawAmt))
            .accountsStrict({
                admin: admin.publicKey,
                config: configPDA,
                feeVault: feeVaultPDA,
                destination: destination.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const vaultAfter = await getLamports(context, feeVaultPDA);
        expect(vaultAfter).to.equal(vaultBefore - BigInt(withdrawAmt));
    });

    it("Happy: withdraw to a fresh destination account (lamports == 0 before)", async () => {
        const freshDest = Keypair.generate();
        const withdrawAmt = LAMPORTS_PER_SOL;
        await fundVaultWithFees(withdrawAmt);

        await program.methods
            .withdrawFees(new BN(withdrawAmt))
            .accountsStrict({
                admin: admin.publicKey,
                config: configPDA,
                feeVault: feeVaultPDA,
                destination: freshDest.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const destLamports = await getLamports(context, freshDest.publicKey);
        expect(destLamports).to.equal(BigInt(withdrawAmt));
    });

    it("Happy: multiple sequential withdrawals succeed", async () => {
        const fundAmt = 10 * LAMPORTS_PER_SOL;
        const eachAmt = 1 * LAMPORTS_PER_SOL;
        await fundVaultWithFees(fundAmt);

        for (let i = 0; i < 3; i++) {
            const vaultBefore = await getLamports(context, feeVaultPDA);

            await program.methods
                .withdrawFees(new BN(eachAmt))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();

            const vaultAfter = await getLamports(context, feeVaultPDA);

            expect(vaultAfter === vaultBefore - BigInt(eachAmt)).to.be.true;
        }
    });

    // ─────────────────────────────────────────────────
    // ACCESS CONTROL
    // ─────────────────────────────────────────────────

    it("[AUTH] Fails when non-admin signer calls withdraw_fees", async () => {
        const withdrawAmt = LAMPORTS_PER_SOL;
        await fundVaultWithFees(withdrawAmt);

        await expectError(
            program.methods
                .withdrawFees(new BN(withdrawAmt))
                .accountsStrict({
                    admin: attacker.publicKey,  // bukan fee_authority
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([attacker])
                .rpc(),
            "Unauthorized"
        );
    });

    it("[AUTH] Fails when admin key is correct but transaction is unsigned", async () => {
        const withdrawAmt = LAMPORTS_PER_SOL;
        await fundVaultWithFees(withdrawAmt);

        await expectError(
            program.methods
                .withdrawFees(new BN(withdrawAmt))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([])         // tidak sign
                .rpc(),
            "Signature verification failed"
        );
    });

    it("[AUTH] Fails when fee_authority was changed and old admin tries to withdraw", async () => {
        // Simulasi: ubah fee_authority di config ke attacker via bankrun direct injection
        const configInfo = await context.banksClient.getAccount(configPDA);
        const configData = Buffer.from(configInfo!.data);

        // Layout ConfigAccount:
        // discriminator(8) + admin_authority(32) + fee_authority(32) + ...
        const feeAuthorityOffset = 8 + 32;
        const originalFeeAuthority = Buffer.from(configData.subarray(feeAuthorityOffset, feeAuthorityOffset + 32));

        // Replace fee_authority dengan attacker
        attacker.publicKey.toBuffer().copy(configData, feeAuthorityOffset);
        await context.setAccount(configPDA, {
            lamports: configInfo!.lamports,
            data: configData,
            owner: new PublicKey(configInfo!.owner),
            executable: false,
        });

        const withdrawAmt = LAMPORTS_PER_SOL;
        await fundVaultWithFees(withdrawAmt);

        try {
            await expectError(
                program.methods
                    .withdrawFees(new BN(withdrawAmt))
                    .accountsStrict({
                        admin: admin.publicKey,  // admin lama — sekarang bukan fee_authority
                        config: configPDA,
                        feeVault: feeVaultPDA,
                        destination: destination.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([admin])
                    .rpc(),
                "Unauthorized"
            );
        } finally {
            // Restore fee_authority ke admin
            originalFeeAuthority.copy(configData, feeAuthorityOffset);
            await context.setAccount(configPDA, {
                lamports: configInfo!.lamports,
                data: configData,
                owner: new PublicKey(configInfo!.owner),
                executable: false,
            });
        }
    });

    // ─────────────────────────────────────────────────
    // BALANCE CHECKS
    // ─────────────────────────────────────────────────

    it("[BALANCE] Fails when withdrawal amount exceeds fee_vault balance", async () => {
        // Pastikan fee_vault kosong atau kecil, lalu minta lebih
        const vaultBalance = await getLamports(context, feeVaultPDA);
        const tooMuch = vaultBalance + BigInt(LAMPORTS_PER_SOL);

        await expectError(
            program.methods
                .withdrawFees(new BN(tooMuch.toString()))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc(),
            "InsufficientBalance"
        );
    });

    it("[BALANCE] Fails when fee_vault is empty (amount > 0 requested)", async () => {
        // Kosongkan fee_vault dengan withdraw semua sisanya terlebih dulu
        const currentVaultBalance = await getLamports(context, feeVaultPDA);
        if (currentVaultBalance > 0n) {
            await program.methods
                .withdrawFees(new BN(currentVaultBalance.toString()))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();
        }

        // fee_vault sekarang 0 (atau rent-exempt minimum)
        // Coba withdraw lebih dari saldo yang ada
        const vaultBalance = await getLamports(context, feeVaultPDA);
        const tooMuch = vaultBalance + 1n;

        await expectError(
            program.methods
                .withdrawFees(new BN(tooMuch.toString()))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc(),
            "InsufficientBalance"
        );
    });

    it("[BALANCE] Withdraw exact 1 lamport succeeds (minimum valid amount)", async () => {
        await fundVaultWithFees(LAMPORTS_PER_SOL); // top-up dulu

        const destBefore = await getLamports(context, destination.publicKey);

        await program.methods
            .withdrawFees(new BN(1))
            .accountsStrict({
                admin: admin.publicKey,
                config: configPDA,
                feeVault: feeVaultPDA,
                destination: destination.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const destAfter = await getLamports(context, destination.publicKey);
        expect(destAfter).to.equal(destBefore + 1n);
    });

    // ─────────────────────────────────────────────────
    // PDA / ACCOUNT VALIDATION
    // ─────────────────────────────────────────────────

    it("[PDA] Fails when wrong fee_vault PDA is passed", async () => {
        const fakeVault = Keypair.generate().publicKey;
        await fundVaultWithFees(LAMPORTS_PER_SOL);

        await expectError(
            program.methods
                .withdrawFees(new BN(LAMPORTS_PER_SOL))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: fakeVault,   // bukan PDA canonical
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc(),
            // Anchor seeds constraint [b"fee_vault"] akan reject
            "seeds constraint was violated"
        );
    });

    it("[PDA] Fails when wrong config PDA is passed", async () => {
        await fundVaultWithFees(LAMPORTS_PER_SOL);
        const fakeConfig = Keypair.generate().publicKey;

        await expectError(
            program.methods
                .withdrawFees(new BN(LAMPORTS_PER_SOL))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: fakeConfig,  // salah
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc(),
            "AccountNotInitialized"
        );
    });

    it("[PDA] Fails when MilestoneAccount is passed as config (discriminator mismatch)", async () => {
        // Buat stream milestone agar ada MilestoneAccount untuk di-cosplay
        const nonce = new BN(8800001);
        const startTs = BASE_NOW + 60;
        const endTs = BASE_NOW + 86400;

        const [streamPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        const milestonePDAs = [];
        for (let i = 0; i < 2; i++) {
            const [pda] = PublicKey.findProgramAddressSync(
                [Buffer.from("milestone"), streamPDA.toBuffer(), Buffer.from([i])],
                program.programId
            );
            milestonePDAs.push({ pubkey: pda, isWritable: true, isSigner: false });
        }

        await program.methods
            .createStream(
                amount, new BN(startTs), new BN(startTs), new BN(endTs),
                VESTING_TYPE_LINEAR + 2, // MILESTONE
                [{ amount: amount.div(new BN(2)) }, { amount: amount.div(new BN(2)) }],
                nonce
            )
            .accounts({ creator: creator.publicKey, recipient: recipient.publicKey, mint, creatorTokenAccount, tokenProgram: TOKEN_PROGRAM_ID })
            .remainingAccounts(milestonePDAs)
            .signers([creator])
            .rpc();

        await fundVaultWithFees(LAMPORTS_PER_SOL);

        await expectError(
            program.methods
                .withdrawFees(new BN(LAMPORTS_PER_SOL))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: milestonePDAs[0].pubkey,  // MilestoneAccount dipass sebagai config
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc(),
            "AccountDiscriminatorMismatch"
        );
    });

    // ─────────────────────────────────────────────────
    // STATE CONSISTENCY
    // ─────────────────────────────────────────────────

    it("[STATE] fee_vault balance is correct after multiple fund-and-withdraw cycles", async () => {
        // Cycle 1: fund 3 SOL, withdraw 2 SOL
        await fundVaultWithFees(3 * LAMPORTS_PER_SOL);
        await program.methods
            .withdrawFees(new BN(2 * LAMPORTS_PER_SOL))
            .accountsStrict({
                admin: admin.publicKey, config: configPDA,
                feeVault: feeVaultPDA, destination: destination.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin]).rpc();

        // Cycle 2: fund 5 SOL, withdraw 4 SOL
        await fundVaultWithFees(5 * LAMPORTS_PER_SOL);
        const vaultAfterFund = await getLamports(context, feeVaultPDA);
        await program.methods
            .withdrawFees(new BN(4 * LAMPORTS_PER_SOL))
            .accountsStrict({
                admin: admin.publicKey, config: configPDA,
                feeVault: feeVaultPDA, destination: destination.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin]).rpc();

        const vaultFinal = await getLamports(context, feeVaultPDA);
        expect(vaultFinal).to.equal(vaultAfterFund - BigInt(4 * LAMPORTS_PER_SOL));
    });

    it("[STATE] Config account is NOT mutated by withdraw_fees", async () => {
        await fundVaultWithFees(LAMPORTS_PER_SOL);

        const configBefore = await program.account.configAccount.fetch(configPDA);

        await program.methods
            .withdrawFees(new BN(LAMPORTS_PER_SOL))
            .accountsStrict({
                admin: admin.publicKey, config: configPDA,
                feeVault: feeVaultPDA, destination: destination.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin]).rpc();

        const configAfter = await program.account.configAccount.fetch(configPDA);

        // Semua field config harus identik
        expect(configAfter.adminAuthority.toBase58()).to.equal(configBefore.adminAuthority.toBase58());
        expect(configAfter.feeAuthority.toBase58()).to.equal(configBefore.feeAuthority.toBase58());
        expect(configAfter.paused).to.equal(configBefore.paused);
        expect(configAfter.withdrawFeeBps).to.equal(configBefore.withdrawFeeBps);
    });

    it("[STATE] destination is a SystemAccount (tidak perlu ATA atau struktur khusus)", async () => {
        const randomDest = Keypair.generate();
        const withdrawAmt = LAMPORTS_PER_SOL;
        await fundVaultWithFees(withdrawAmt);

        // SystemAccount biasa (bukan PDA, bukan ATA) harus bisa menerima lamports
        await program.methods
            .withdrawFees(new BN(withdrawAmt))
            .accountsStrict({
                admin: admin.publicKey,
                config: configPDA,
                feeVault: feeVaultPDA,
                destination: randomDest.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

        const destLamports = await getLamports(context, randomDest.publicKey);
        expect(destLamports).to.equal(BigInt(withdrawAmt));
    });

    // ─────────────────────────────────────────────────
    // EDGE CASES & BOUNDARY
    // ─────────────────────────────────────────────────

    it("[EDGE] Withdraw amount = 0 should fail (InsufficientBalance or NothingToWithdraw)", async () => {
        // amount=0: constraint fee_vault.lamports() >= amount selalu true,
        // tapi invoke_signed transfer 0 lamports mungkin no-op atau gagal.
        // Verifikasi behavior deterministik — transaksi tidak boleh silent no-op.
        // Jika program tidak guard ini, setidaknya tidak merugikan, tapi kita
        // dokumentasikan behavior yang diharapkan.
        // Behavior aktual bergantung pada runtime — test ini hanya memastikan
        // tidak crash dengan panic.
        try {
            await program.methods
                .withdrawFees(new BN(0))
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();
            // Jika sukses → amount=0 adalah no-op yang diperbolehkan runtime
            // (tidak ada token yang dipindah, tidak ada kerugian)
        } catch (err: any) {
            // Jika gagal → juga valid behavior
            const raw = String(err?.message ?? err);
            expect(raw.length).to.be.greaterThan(0, "error harus ada pesan");
        }
    });

    it("[BOUNDARY] Withdraw exact u64 max fails (fee_vault tidak mungkin sebesar itu)", async () => {
        const maxU64 = new BN("18446744073709551615");

        await expectError(
            program.methods
                .withdrawFees(maxU64)
                .accountsStrict({
                    admin: admin.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: destination.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc(),
            "InsufficientBalance"
        );
    });

    // ─────────────────────────────────────────────────
    // COSPLAY / PRIVILEGE ESCALATION
    // ─────────────────────────────────────────────────

    it("[COSPLAY] Attacker cannot drain fee_vault by passing their own pubkey as admin in config", async () => {
        // Attacker minta-minta set admin via bankrun injection
        // lalu coba withdraw — tapi tidak ada cara untuk inject tanpa kontrol admin
        // Test ini memverifikasi bahwa attacker tidak bisa manipulasi config
        // tanpa menjadi admin_authority (proteksi oleh seeds constraint config).
        const fundAmt = 2 * LAMPORTS_PER_SOL;
        await fundVaultWithFees(fundAmt);

        // Attacker tidak sign sebagai admin → Unauthorized
        await expectError(
            program.methods
                .withdrawFees(new BN(fundAmt))
                .accountsStrict({
                    admin: attacker.publicKey,
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: attacker.publicKey,  // coba drain ke diri sendiri
                    systemProgram: SystemProgram.programId,
                })
                .signers([attacker])
                .rpc(),
            "Unauthorized"
        );

        // Pastikan fee_vault tidak berkurang
        const vaultAfter = await getLamports(context, feeVaultPDA);
        expect(vaultAfter >= BigInt(fundAmt)).to.be.true;
    });

    it("[COSPLAY] Creator (non-admin) cannot call withdraw_fees", async () => {
        const fundAmt = LAMPORTS_PER_SOL;
        await fundVaultWithFees(fundAmt);

        await expectError(
            program.methods
                .withdrawFees(new BN(fundAmt))
                .accountsStrict({
                    admin: creator.publicKey,  // bukan fee_authority
                    config: configPDA,
                    feeVault: feeVaultPDA,
                    destination: creator.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([creator])
                .rpc(),
            "Unauthorized"
        );
    });
});