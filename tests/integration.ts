import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext, Clock } from "solana-bankrun";
import {
    PublicKey,
    Keypair,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";

import { address, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createTransactionMessage, lamports, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners } from "@solana/kit"
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

// ─── Chainlink mock constants ──────────────────────────────────────────────
const SOL_USD_FEED = new PublicKey(
    "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"
);
const CHAINLINK_PROGRAM_ID = new PublicKey(
    "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
);

const FEED_DECIMALS_OFFSET = 0x8a;
const FEED_TIMESTAMP_OFFSET = 0xd0;
const FEED_ANSWER_OFFSET = 0xd8;
const FEED_LEN = 248;

const PRICE_DECIMALS = 8;
const PRICE_RAW = 10_000_000_000n; // $100.00
const EXPECTED_FEE_LAMPORTS = 9_900_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildFeedData(
    priceRaw: bigint,
    decimals: number,
    updatedAt: number
): Buffer {
    const buf = Buffer.alloc(FEED_LEN, 0);
    buf.writeUInt8(decimals, FEED_DECIMALS_OFFSET);
    buf.writeUInt32LE(updatedAt >>> 0, FEED_TIMESTAMP_OFFSET);
    let p = priceRaw < 0n ? (1n << 128n) + priceRaw : priceRaw;
    for (let i = 0; i < 16; i++) {
        buf.writeUInt8(Number(p & 0xffn), FEED_ANSWER_OFFSET + i);
        p >>= 8n;
    }
    return buf;
}

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
            createInitializeMintInstruction(mintKp.publicKey, decimals, mintAuthority, null),
        ],
        [mintKp]
    );
    return mintKp.publicKey;
}

async function mintTokens(
    context: ProgramTestContext,
    payer: Keypair,
    mintPubkey: PublicKey,
    destination: PublicKey,
    authority: Keypair,
    amount: number
) {
    await sendIx(
        context,
        payer,
        [createMintToInstruction(mintPubkey, destination, authority.publicKey, amount)],
        authority.publicKey.equals(payer.publicKey) ? [] : [authority]
    );
}

async function createAta(
    context: ProgramTestContext,
    payer: Keypair,
    mintPubkey: PublicKey,
    owner: PublicKey
): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mintPubkey, owner, true, TOKEN_PROGRAM_ID);
    await sendIx(context, payer, [
        createAssociatedTokenAccountIdempotentInstruction(
            payer.publicKey,
            ata,
            owner,
            mintPubkey,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        ),
    ]);
    return ata;
}

async function getSolBalance(context: ProgramTestContext, pubkey: PublicKey): Promise<bigint> {
    return context.banksClient.getBalance(pubkey);
}

async function getTokenBalance(context: ProgramTestContext, ata: PublicKey): Promise<bigint> {
    const account = await context.banksClient.getAccount(ata);
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
        expect(combined, `Error "${fragment}" not found in error context.`).to.include(fragment);
    }
}

// ─── Suite ───────────────────────────────────────────────────────────────────
describe("integration-and-edge-cases", () => {
    const svm = new LiteSVM();
    let context: ProgramTestContext;
    let provider: BankrunProvider;
    let program: Program<UnifiedFlow>;

    let admin: Keypair;
    let creator: Keypair;
    let recipient: Keypair;

    let mint: PublicKey;
    let configPda: PublicKey;
    let feeVaultPda: PublicKey;

    const BASE_NOW = 1_700_000_000;
    const STREAM_DURATION = 1_000;
    const TOKEN_AMOUNT = 1_000_000;

    let nonceCounter = 9000; // unique range to avoid seed conflicts

    before(async () => {
        admin = Keypair.generate();
        creator = Keypair.generate();
        recipient = Keypair.generate();

        const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, BASE_NOW);

        context = await startAnchor(".", [], [
            {
                address: admin.publicKey,
                info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
            },
            {
                address: creator.publicKey,
                info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
            },
            {
                address: recipient.publicKey,
                info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
            },
            {
                address: SOL_USD_FEED,
                info: { lamports: 1e9, data: feedData, owner: CHAINLINK_PROGRAM_ID, executable: false },
            },
        ]);

        provider = new BankrunProvider(context);
        anchor.setProvider(provider);
        program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

        await setTime(context, BASE_NOW);

        [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        [feeVaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("fee_vault")],
            program.programId
        );

        await program.methods.initializeConfig()
            .accounts({ admin: admin.publicKey })
            .signers([admin])
            .rpc();

        mint = await createTestMint(context, admin, admin.publicKey, 6);
    });

    async function setupStream(opts: {
        startTs?: number;
        endTs?: number;
        amount?: number;
        vestingType?: number;
        cliffTs?: number;
    } = {}): Promise<{
        streamPda: PublicKey;
        vaultAta: PublicKey;
        recipientAta: PublicKey;
        startTs: number;
        endTs: number;
        amount: number;
        nonce: bigint;
    }> {
        const nonce = BigInt(nonceCounter++);
        const startTs = opts.startTs ?? BASE_NOW;
        const endTs = opts.endTs ?? BASE_NOW + STREAM_DURATION;
        const amount = opts.amount ?? TOKEN_AMOUNT;
        const vestingType = opts.vestingType ?? 0; // Linear default
        const cliffTs = opts.cliffTs ?? startTs;

        const [streamPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("stream"),
                creator.publicKey.toBuffer(),
                recipient.publicKey.toBuffer(),
                Buffer.from(new BN(nonce.toString()).toArrayLike(Buffer, "le", 8)),
            ],
            program.programId
        );
        const vaultAta = getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID);

        const creatorAta = await createAta(context, admin, mint, creator.publicKey);
        await mintTokens(context, admin, mint, creatorAta, admin, amount);

        const recipientAta = await createAta(context, admin, mint, recipient.publicKey);

        await program.methods
            .createStream(new BN(amount), new BN(startTs), new BN(cliffTs), new BN(endTs), vestingType, [], new BN(nonce.toString()))
            .accounts({
                creator: creator.publicKey,
                recipient: recipient.publicKey,
                mint,
                creatorTokenAccount: creatorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([creator])
            .rpc();

        return { streamPda, vaultAta, recipientAta, startTs, endTs, amount, nonce };
    }

    async function doWithdraw(streamPda: PublicKey, recipientAta: PublicKey) {
        return program.methods
            .withdraw()
            .accounts({
                recipient: recipient.publicKey,
                stream: streamPda,
                recipientAta,
                feeVault: feeVaultPda,
                chainlinkFeed: SOL_USD_FEED,
                tokenProgram: TOKEN_PROGRAM_ID,
            } as any)
            .signers([recipient])
            .rpc();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Full flow: create_stream → wait → withdraw → verify balance
    // ══════════════════════════════════════════════════════════════════════════
    it("full flow: create_stream -> wait 50% -> withdraw -> verify balance", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, recipientAta, startTs, endTs, amount } = await setupStream();

        // Advance time to 50% of the stream duration
        const midTs = startTs + Math.floor((endTs - startTs) / 2);
        await setTime(context, midTs);

        // Update mock feed to keep oracle happy
        const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, midTs);
        context.setAccount(SOL_USD_FEED, {
            lamports: 1e9,
            data: feedData,
            owner: CHAINLINK_PROGRAM_ID,
            executable: false,
        });

        const tokenBefore = await getTokenBalance(context, recipientAta);
        const feeVaultSolBefore = await getSolBalance(context, feeVaultPda);

        await doWithdraw(streamPda, recipientAta);

        const tokenAfter = await getTokenBalance(context, recipientAta);
        const feeVaultSolAfter = await getSolBalance(context, feeVaultPda);

        // Verify token balance increased by ~50%
        const expectedTokens = Math.floor(amount / 2);
        expect(Number(tokenAfter - tokenBefore)).to.be.closeTo(expectedTokens, 1);

        // Verify fee vault received the USD-denominated fee
        expect(Number(feeVaultSolAfter - feeVaultSolBefore)).to.equal(EXPECTED_FEE_LAMPORTS);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Edge Case: zero amount stream
    // ══════════════════════════════════════════════════════════════════════════
    it("fails to create stream with zero amount", async () => {
        const nonce = BigInt(nonceCounter++);
        const creatorAta = await createAta(context, admin, mint, creator.publicKey);

        await expectError(
            program.methods
                .createStream(new BN(0), new BN(BASE_NOW), new BN(BASE_NOW), new BN(BASE_NOW + STREAM_DURATION), 0, [], new BN(nonce.toString()))
                .accounts({
                    creator: creator.publicKey,
                    recipient: recipient.publicKey,
                    mint,
                    creatorTokenAccount: creatorAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "InvalidAmount"
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Edge Case: withdraw at exactly cliff date
    // ══════════════════════════════════════════════════════════════════════════
    it("allows withdraw at exactly cliff date in a cliff stream", async () => {
        await setTime(context, BASE_NOW);
        const startTs = BASE_NOW;
        const cliffTs = BASE_NOW + Math.floor(STREAM_DURATION / 2);
        const endTs = BASE_NOW + STREAM_DURATION;

        // Create stream with cliff
        const { streamPda, recipientAta } = await setupStream({
            startTs,
            cliffTs,
            endTs,
            vestingType: 1, // Cliff vesting type
        });

        // warp to exactly cliff timestamp
        await setTime(context, cliffTs);

        const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, cliffTs);
        context.setAccount(SOL_USD_FEED, {
            lamports: 1e9,
            data: feedData,
            owner: CHAINLINK_PROGRAM_ID,
            executable: false,
        });

        const tokenBefore = await getTokenBalance(context, recipientAta);
        await doWithdraw(streamPda, recipientAta);
        const tokenAfter = await getTokenBalance(context, recipientAta);

        // At exactly the cliff date, it should allow withdrawing the accrued linear amount from startTs to cliffTs
        const expectedCliffAmount = Math.floor(TOKEN_AMOUNT * (cliffTs - startTs) / (endTs - startTs));
        expect(Number(tokenAfter - tokenBefore)).to.be.closeTo(expectedCliffAmount, 1);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Edge Case: cancel at exactly end date
    // ══════════════════════════════════════════════════════════════════════════
    it("fails to cancel at exactly end date", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, recipientAta, endTs } = await setupStream();

        // warp clock to exactly end date
        await setTime(context, endTs);

        const creatorAta = await createAta(context, admin, mint, creator.publicKey);

        await expectError(
            program.methods
                .cancel()
                .accountsStrict({
                    creator: creator.publicKey,
                    mint,
                    stream: streamPda,
                    vault: getAssociatedTokenAddressSync(mint, streamPda, true, TOKEN_PROGRAM_ID),
                    creatorTokenAccount: creatorAta,
                    recipientTokenAccount: recipientAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([creator])
                .rpc(),
            "FullyVested"
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Edge Case: double withdraw
    // ══════════════════════════════════════════════════════════════════════════
    it("fails when double withdrawing with no extra vested amount", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, recipientAta, startTs, endTs } = await setupStream();

        const midTs = startTs + Math.floor((endTs - startTs) / 2);
        await setTime(context, midTs);

        const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, midTs);
        context.setAccount(SOL_USD_FEED, {
            lamports: 1e9,
            data: feedData,
            owner: CHAINLINK_PROGRAM_ID,
            executable: false,
        });

        // First withdraw succeeds
        await doWithdraw(streamPda, recipientAta);

        // Immediate second withdraw (double withdraw) fails
        await expectError(
            doWithdraw(streamPda, recipientAta),
            "NothingToWithdraw"
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Edge Case: withdraw with nothing available
    // ══════════════════════════════════════════════════════════════════════════
    it("fails to withdraw when nothing is available", async () => {
        await setTime(context, BASE_NOW);
        const { streamPda, recipientAta, startTs } = await setupStream();

        // warp before start timestamp
        await setTime(context, startTs - 10);

        const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, startTs - 10);
        context.setAccount(SOL_USD_FEED, {
            lamports: 1e9,
            data: feedData,
            owner: CHAINLINK_PROGRAM_ID,
            executable: false,
        });

        await expectError(
            doWithdraw(streamPda, recipientAta),
            "NothingToWithdraw"
        );
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Full flow pakai LiteSVM pure (tanpa anchor-bankrun)
    // ══════════════════════════════════════════════════════════════════════════
    it("full flow: create_stream -> wait 50% -> withdraw -> verify balance (LiteSVM)", async () => {
        // ── Setup SVM ──────────────────────────────────────────────────────────
        const lsvm = new LiteSVM();

        // Load program .so dari hasil build
        const programId = new PublicKey(IDL.address);
        const programBytes = require("fs").readFileSync(
            "./target/deploy/unified_flow.so"
        );
        lsvm.addProgram(address(programId.toBase58()), new Uint8Array(programBytes));

        // ── Keypairs & airdrop ─────────────────────────────────────────────────
        const lAdmin = Keypair.generate();
        const lCreator = Keypair.generate();
        const lRecipient = Keypair.generate();

        lsvm.airdrop(address(lAdmin.publicKey.toBase58()), lamports(100_000_000_000n));
        lsvm.airdrop(address(lCreator.publicKey.toBase58()), lamports(100_000_000_000n));
        lsvm.airdrop(address(lRecipient.publicKey.toBase58()), lamports(100_000_000_000n));

        // ── Helper: kirim transaction via LiteSVM ──────────────────────────────
        async function sendTxLsvm(
            payer: Keypair,
            ixs: anchor.web3.TransactionInstruction[],
            signers: Keypair[] = []
        ) {
            // Buat map address -> signer untuk semua keypair yang ikut sign
            const allKeypairs = [payer, ...signers];
            const signerMap = new Map<string, Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>>();
            for (const kp of allKeypairs) {
                const s = await createKeyPairSignerFromBytes(kp.secretKey);
                signerMap.set(kp.publicKey.toBase58(), s);
            }

            const payerSigner = signerMap.get(payer.publicKey.toBase58())!;

            // Convert instructions: kalau account adalah signer yang kita punya keypair-nya,
            // inject TransactionSigner object supaya signTransactionMessageWithSigners tahu siapa yang harus sign
            const kitIxs = ixs.map(ix => ({
                programAddress: address(ix.programId.toBase58()),
                accounts: ix.keys.map(k => {
                    const addrStr = k.pubkey.toBase58();
                    const role =
                        k.isSigner && k.isWritable ? 3
                            : k.isSigner ? 2
                                : k.isWritable ? 1
                                    : 0;

                    // Kalau account ini adalah signer yang kita punya, inject signer object-nya
                    if ((role === 2 || role === 3) && signerMap.has(addrStr)) {
                        return {
                            address: address(addrStr),
                            role,
                            signer: signerMap.get(addrStr)!,
                        };
                    }

                    return {
                        address: address(addrStr),
                        role,
                    };
                }),
                data: new Uint8Array(ix.data),
            }));

            const blockhash = lsvm.latestBlockhash();

            const txMsg = appendTransactionMessageInstructions(
                kitIxs,
                setTransactionMessageFeePayerSigner(
                    payerSigner,
                    setTransactionMessageLifetimeUsingBlockhash(
                        { blockhash, lastValidBlockHeight: 999999999n },
                        createTransactionMessage({ version: 0 })
                    )
                )
            );

            const signedTx = await signTransactionMessageWithSigners(txMsg);

            const result = lsvm.sendTransaction(signedTx);
            if (result && "err" in result && result.err) {
                throw new Error(
                    `Transaction failed: ${JSON.stringify(result.err)}\nLogs: ${(result as any).logs?.join("\n")}`
                );
            }
            return result;
        }
        // ── Helper: set clock di LiteSVM ───────────────────────────────────────
        function setLsvmClock(unixTs: number) {
            const clock = lsvm.getClock();
            clock.unixTimestamp = BigInt(unixTs);
            lsvm.setClock(clock);
        }

        // ── Mock Chainlink feed ────────────────────────────────────────────────
        function setLsvmFeed(unixTs: number) {
            const feedData = buildFeedData(PRICE_RAW, PRICE_DECIMALS, unixTs);
            lsvm.setAccount({
                address: address(SOL_USD_FEED.toBase58()),
                lamports: lamports(1000000000n),
                data: new Uint8Array(feedData),
                programAddress: address(CHAINLINK_PROGRAM_ID.toBase58()),
                executable: false,
                space: 0n
            });
        }

        // ── Helper: baca token balance dari raw account data ───────────────────
        function getLsvmTokenBalance(ata: PublicKey): bigint {
            const acc = lsvm.getAccount(address(ata.toBase58()));
            if (!acc || !acc.exists) return 0n;
            return Buffer.from(acc.data).readBigUInt64LE(64);
        }

        function getLsvmSolBalance(pubkey: PublicKey): bigint {
            const bal = lsvm.getBalance(address(pubkey.toBase58()));
            return bal != null ? BigInt(bal) : 0n;
        }

        // ── PDAs ───────────────────────────────────────────────────────────────
        const [lConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            programId
        );
        const [lFeeVaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("fee_vault")],
            programId
        );

        // ── Set waktu awal & feed ──────────────────────────────────────────────
        setLsvmClock(BASE_NOW);
        setLsvmFeed(BASE_NOW);

        // ── Buat provider Anchor yang pakai LiteSVM sebagai connection ─────────
        // Kita buat Connection palsu yang forward ke lsvm untuk Anchor Program
        // Tapi karena LiteSVM tidak punya RPC server, kita pakai BankrunProvider
        // yang sudah ada dari `context` (shared setup) HANYA untuk build IX,
        // lalu kirim manual via lsvm.
        //
        // Approach: gunakan program.methods(...).instruction() untuk dapat IX,
        // lalu sendTxLsvm() untuk eksekusi.

        // ── initialize_config ──────────────────────────────────────────────────
        const initConfigIx = await program.methods
            .initializeConfig()
            .accountsStrict({
                admin: lAdmin.publicKey,
                config: lConfigPda,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        await sendTxLsvm(lAdmin, [initConfigIx], []);

        // ── Buat mint ──────────────────────────────────────────────────────────
        const lMintKp = Keypair.generate();
        const MINT_RENT = 1_461_600n; // lamports rent-exempt untuk MINT_SIZE

        await sendTxLsvm(
            lAdmin,
            [
                SystemProgram.createAccount({
                    fromPubkey: lAdmin.publicKey,
                    newAccountPubkey: lMintKp.publicKey,
                    space: MINT_SIZE,
                    lamports: Number(MINT_RENT),
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(
                    lMintKp.publicKey,
                    6,
                    lAdmin.publicKey,
                    null
                ),
            ],
            [lMintKp]
        );

        // ── Buat ATA creator & mint token ──────────────────────────────────────
        const lCreatorAta = getAssociatedTokenAddressSync(
            lMintKp.publicKey,
            lCreator.publicKey,
            true,
            TOKEN_PROGRAM_ID
        );
        await sendTxLsvm(lAdmin, [
            createAssociatedTokenAccountIdempotentInstruction(
                lAdmin.publicKey,
                lCreatorAta,
                lCreator.publicKey,
                lMintKp.publicKey,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            ),
        ]);
        await sendTxLsvm(lAdmin, [
            createMintToInstruction(
                lMintKp.publicKey,
                lCreatorAta,
                lAdmin.publicKey,
                TOKEN_AMOUNT
            ),
        ]);

        // ── Buat ATA recipient ─────────────────────────────────────────────────
        const lRecipientAta = getAssociatedTokenAddressSync(
            lMintKp.publicKey,
            lRecipient.publicKey,
            true,
            TOKEN_PROGRAM_ID
        );
        await sendTxLsvm(lAdmin, [
            createAssociatedTokenAccountIdempotentInstruction(
                lAdmin.publicKey,
                lRecipientAta,
                lRecipient.publicKey,
                lMintKp.publicKey,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            ),
        ]);

        // ── create_stream ──────────────────────────────────────────────────────
        const lNonce = new BN(99999); // nonce unik untuk test ini
        const lStartTs = BASE_NOW;
        const lEndTs = BASE_NOW + STREAM_DURATION;

        const [lStreamPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("stream"),
                lCreator.publicKey.toBuffer(),
                lRecipient.publicKey.toBuffer(),
                Buffer.from(lNonce.toArrayLike(Buffer, "le", 8)),
            ],
            programId
        );

        const lVaultAta = getAssociatedTokenAddressSync(
            lMintKp.publicKey,
            lStreamPda,
            true,
            TOKEN_PROGRAM_ID
        );

        const createStreamIx = await program.methods
            .createStream(
                new BN(TOKEN_AMOUNT),
                new BN(lStartTs),
                new BN(lStartTs),
                new BN(lEndTs),
                0,
                [],
                lNonce
            )
            .accountsStrict({
                creator: lCreator.publicKey,
                recipient: lRecipient.publicKey,
                mint: lMintKp.publicKey,
                stream: lStreamPda,
                vault: lVaultAta,
                creatorTokenAccount: lCreatorAta,
                config: lConfigPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        await sendTxLsvm(lCreator, [createStreamIx], []);

        // ── Warp ke 50% ───────────────────────────────────────────────────────
        const lMidTs = lStartTs + Math.floor((lEndTs - lStartTs) / 2);
        setLsvmClock(lMidTs);
        setLsvmFeed(lMidTs);

        // ── Withdraw ───────────────────────────────────────────────────────────
        const tokenBefore = getLsvmTokenBalance(lRecipientAta);
        const feeVaultBefore = getLsvmSolBalance(lFeeVaultPda);

        const withdrawIx = await program.methods
            .withdraw()
            .accountsStrict({
                recipient: lRecipient.publicKey,
                stream: lStreamPda,
                mint: lMintKp.publicKey,
                vault: lVaultAta,
                recipientAta: lRecipientAta,
                feeVault: lFeeVaultPda,
                config: lConfigPda,
                chainlinkFeed: SOL_USD_FEED,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        await sendTxLsvm(lRecipient, [withdrawIx], []);

        // ── Verify ─────────────────────────────────────────────────────────────
        const tokenAfter = getLsvmTokenBalance(lRecipientAta);
        const feeVaultAfter = getLsvmSolBalance(lFeeVaultPda);

        const expectedTokens = Math.floor(TOKEN_AMOUNT / 2);
        expect(Number(tokenAfter - tokenBefore)).to.be.closeTo(expectedTokens, 1);
        const feeVaultDiff = BigInt(feeVaultAfter) - BigInt(feeVaultBefore);
        expect(Number(feeVaultDiff)).to.equal(EXPECTED_FEE_LAMPORTS);
    });
});


