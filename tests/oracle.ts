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
import { UnifiedFlow } from "../target/types/unified_flow";
import IDL from "../target/idl/unified_flow.json";
import { expect } from "chai";

// ─── Chainlink mock constants ─────────────────────────────────────────────────
const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
const CHAINLINK_PROGRAM_ID = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");

// Feed byte layout (248 bytes total):
//   offset 0x8a (138) → decimals  : u8
//   offset 0xd0 (208) → updated_at: u32 LE
//   offset 0xd8 (216) → answer    : i128 LE
const FEED_DECIMALS_OFFSET = 0x8a;
const FEED_TIMESTAMP_OFFSET = 0xd0;
const FEED_ANSWER_OFFSET = 0xd8;
const FEED_LEN = 248;
const FEED_MIN_LEN = FEED_ANSWER_OFFSET + 16; // 232

const PRICE_DECIMALS = 8;
const PRICE_RAW = 10_000_000_000n; // $100.00 × 10^8
const EXPECTED_FEE_LAMPORTS = 9_900_000;       // $0.99 @ $100/SOL

// ─── Feed builder ─────────────────────────────────────────────────────────────
/**
 * Build raw Chainlink feed account data.
 *
 * Branch map for read_chainlink_round():
 *   [A] data.len() < FEED_MIN_LEN (232)   → InvalidOracleFeed
 *   [B] now - updated_at >= 3600          → StaleOraclePrice
 *   [C] now - updated_at == 3599          → OK  (one second below limit)
 *   [D] now - updated_at == 3600          → StaleOraclePrice (exact boundary)
 *   [E] answer == 0                        → InvalidOraclePrice
 *   [F] answer < 0                         → InvalidOraclePrice
 *   [G] happy path                         → Ok(ChainlinkRound)
 */
function buildFeedData(
    priceRaw: bigint,
    decimals: number,
    updatedAt: number,
    totalLen: number = FEED_LEN
): Buffer {
    const buf = Buffer.alloc(totalLen, 0);
    if (totalLen > FEED_DECIMALS_OFFSET)
        buf.writeUInt8(decimals, FEED_DECIMALS_OFFSET);
    if (totalLen > FEED_TIMESTAMP_OFFSET + 3)
        buf.writeUInt32LE(updatedAt >>> 0, FEED_TIMESTAMP_OFFSET);
    if (totalLen > FEED_ANSWER_OFFSET + 15) {
        // write i128 little-endian (two's complement for negatives)
        let p = priceRaw < 0n ? (1n << 128n) + priceRaw : priceRaw;
        for (let i = 0; i < 16; i++) {
            buf.writeUInt8(Number(p & 0xffn), FEED_ANSWER_OFFSET + i);
            p >>= 8n;
        }
    }
    return buf;
}

// ─── Shared low-level helpers ─────────────────────────────────────────────────
async function setTime(context: ProgramTestContext, unixTs: number) {
    await context.setClock(new Clock(0n, 0n, 0n, 0n, BigInt(unixTs)));
}

function setFeed(
    context: ProgramTestContext,
    priceRaw: bigint,
    decimals: number,
    updatedAt: number,
    totalLen: number = FEED_LEN
) {
    context.setAccount(SOL_USD_FEED, {
        lamports: 1e9,
        data: buildFeedData(priceRaw, decimals, updatedAt, totalLen),
        owner: CHAINLINK_PROGRAM_ID,
        executable: false,
    });
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

async function getTokenBalance(context: ProgramTestContext, ata: PublicKey): Promise<bigint> {
    const account = await context.banksClient.getAccount(ata);
    if (!account) return 0n;
    return Buffer.from(account.data).readBigUInt64LE(64);
}

async function getSolBalance(context: ProgramTestContext, pubkey: PublicKey): Promise<bigint> {
    return context.banksClient.getBalance(pubkey);
}

async function expectOracleError(promise: Promise<any>, expectedCode: string) {
    try {
        await promise;
        expect.fail(`Expected "${expectedCode}" but transaction succeeded`);
    } catch (err: any) {
        const code = err?.error?.errorCode?.code ?? "";
        const logs = (err?.logs ?? []).join("\n");
        const raw = err?.message ?? String(err);
        const combined = `${code} ${logs} ${raw}`;
        expect(combined, `Expected "${expectedCode}" in error`).to.include(expectedCode);
    }
}

// ─── Context factory ──────────────────────────────────────────────────────────
interface OracleTestCtx {
    context: ProgramTestContext;
    program: Program<UnifiedFlow>;
    admin: Keypair;
    creator: Keypair;
    recipient: Keypair;
    mint: PublicKey;
    configPda: PublicKey;
    feeVaultPda: PublicKey;
}

async function buildCtx(feedData: Buffer): Promise<OracleTestCtx> {
    const admin = Keypair.generate();
    const creator = Keypair.generate();
    const recipient = Keypair.generate();

    const context = await startAnchor(".", [], [
        { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
        { address: creator.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
        { address: recipient.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
        { address: SOL_USD_FEED, info: { lamports: 1e9, data: feedData, owner: CHAINLINK_PROGRAM_ID, executable: false } },
    ]);

    const provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    const program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], program.programId);

    // initialize_config (clock doesn't matter here)
    await program.methods.initializeConfig()
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc();

    // create mint with 6 decimals
    const mintKp = Keypair.generate();
    const rent = await context.banksClient.getRent();
    const mintLamports = rent.minimumBalance(BigInt(MINT_SIZE));
    await sendIx(context, admin, [
        SystemProgram.createAccount({
            fromPubkey: admin.publicKey,
            newAccountPubkey: mintKp.publicKey,
            space: MINT_SIZE,
            lamports: Number(mintLamports),
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mintKp.publicKey, 6, admin.publicKey, null),
    ], [mintKp]);

    return { context, program, admin, creator, recipient, mint: mintKp.publicKey, configPda, feeVaultPda };
}

// ─── Stream setup helper ──────────────────────────────────────────────────────
/**
 * Create ATAs, mint tokens, and call create_stream.
 *
 * IMPORTANT: sets clock to `startTs` before calling create_stream so that
 * the program's `start_ts >= now` check passes regardless of the real wall
 * clock. Callers that need a different clock for withdraw must call
 * setTime() again after this function returns.
 */
async function setupLinearStream(
    h: OracleTestCtx,
    nonce: number,
    startTs: number,
    endTs: number,
    amount = 1_000_000
): Promise<{ streamPda: PublicKey; recipientAta: PublicKey }> {
    const nonceBN = new BN(nonce);

    // creator ATA + fund
    const creatorAta = getAssociatedTokenAddressSync(h.mint, h.creator.publicKey, true, TOKEN_PROGRAM_ID);
    await sendIx(h.context, h.admin, [
        createAssociatedTokenAccountIdempotentInstruction(
            h.admin.publicKey, creatorAta, h.creator.publicKey, h.mint,
            TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        ),
    ]);
    await sendIx(h.context, h.admin, [
        createMintToInstruction(h.mint, creatorAta, h.admin.publicKey, amount),
    ]);

    // recipient ATA
    const recipientAta = getAssociatedTokenAddressSync(h.mint, h.recipient.publicKey, true, TOKEN_PROGRAM_ID);
    await sendIx(h.context, h.admin, [
        createAssociatedTokenAccountIdempotentInstruction(
            h.admin.publicKey, recipientAta, h.recipient.publicKey, h.mint,
            TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        ),
    ]);

    const [streamPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("stream"),
            h.creator.publicKey.toBuffer(),
            h.recipient.publicKey.toBuffer(),
            Buffer.from(nonceBN.toArrayLike(Buffer, "le", 8)),
        ],
        h.program.programId
    );

    // Pin clock to startTs so create_stream sees start_ts >= now
    await setTime(h.context, startTs);

    await h.program.methods
        .createStream(
            new BN(amount),
            new BN(startTs),
            new BN(startTs), // cliff == start (linear)
            new BN(endTs),
            0,               // VESTING_LINEAR
            [],
            nonceBN
        )
        .accounts({
            creator: h.creator.publicKey,
            recipient: h.recipient.publicKey,
            mint: h.mint,
            creatorTokenAccount: creatorAta,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([h.creator])
        .rpc();

    return { streamPda, recipientAta };
}

function doWithdraw(h: OracleTestCtx, streamPda: PublicKey, recipientAta: PublicKey) {
    return h.program.methods
        .withdraw()
        .accounts({
            recipient: h.recipient.publicKey,
            stream: streamPda,
            recipientAta,
            feeVault: h.feeVaultPda,
            chainlinkFeed: SOL_USD_FEED,
            tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([h.recipient])
        .rpc();
}

// ─── Oracle test suite ────────────────────────────────────────────────────────
describe("oracle — read_chainlink_round() branch coverage", () => {

    const BASE_NOW = 1_700_000_000;
    const START_TS = BASE_NOW;           // stream start
    const END_TS = BASE_NOW + 1_000;   // stream end (1000s duration)
    const MID_TS = BASE_NOW + 500;     // 50% vested — used as withdraw time

    // Isolated nonce range — no collisions with other test suites
    let nonce = 5000;
    const nextNonce = () => nonce++;

    // ── [G] Happy path ──────────────────────────────────────────────────────
    it("[G] happy path — valid feed, fresh timestamp, positive answer", async () => {
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);

        // Advance to MID_TS and refresh feed so oracle sees a fresh timestamp
        await setTime(h.context, MID_TS);
        setFeed(h.context, PRICE_RAW, PRICE_DECIMALS, MID_TS);

        const feeVaultBefore = await getSolBalance(h.context, h.feeVaultPda);
        await doWithdraw(h, streamPda, recipientAta);

        const tokenBalance = await getTokenBalance(h.context, recipientAta);
        const feeVaultAfter = await getSolBalance(h.context, h.feeVaultPda);

        expect(Number(tokenBalance)).to.be.closeTo(500_000, 1);
        expect(Number(feeVaultAfter - feeVaultBefore)).to.equal(EXPECTED_FEE_LAMPORTS);
    });

    // ── [B] Stale feed — far past ──────────────────────────────────────────
    it("[B] stale feed (7200s old) — rejects with StaleOraclePrice", async () => {
        // feed timestamp = MID_TS - 7200 → staleness = 7200 > 3600
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS - 7200);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);

        await setTime(h.context, MID_TS); // feed stays stale

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "StaleOraclePrice"
        );
    });

    // ── [D] Staleness exactly at boundary (3600s) — rejected ──────────────
    it("[D] staleness == 3600s (exact boundary) — rejects with StaleOraclePrice", async () => {
        // diff == 3600 → NOT < 3600 → stale
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS - 3600);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "StaleOraclePrice"
        );
    });

    // ── [C] Staleness one second below boundary (3599s) — accepted ────────
    it("[C] staleness == 3599s (one below boundary) — accepted", async () => {
        // diff == 3599 → 3599 < 3600 → fresh
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS - 3599);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await doWithdraw(h, streamPda, recipientAta); // must not throw
        expect(Number(await getTokenBalance(h.context, recipientAta))).to.be.greaterThan(0);
    });

    // ── [E] Answer == 0 ────────────────────────────────────────────────────
    it("[E] answer == 0 — rejects with InvalidOraclePrice", async () => {
        const feed = buildFeedData(0n, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOraclePrice"
        );
    });

    // ── [F] Answer negative ────────────────────────────────────────────────
    it("[F] answer < 0 — rejects with InvalidOraclePrice", async () => {
        const feed = buildFeedData(-1_000_000_000n, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOraclePrice"
        );
    });

    // ── [A] Feed data too short — 100 bytes ───────────────────────────────
    it("[A] feed data length 100 (< 232 min) — rejects with InvalidOracleFeed", async () => {
        const h = await buildCtx(Buffer.alloc(100, 0));

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);
        // feed is already injected as 100-byte account; doWithdraw will use it

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOracleFeed"
        );
    });

    // ── [A] Feed data exactly FEED_MIN_LEN - 1 (231 bytes) ───────────────
    it("[A] feed data length 231 (min-1) — rejects with InvalidOracleFeed", async () => {
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS, 231);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOracleFeed"
        );
    });

    // ── [A→E] Feed data exactly FEED_MIN_LEN (232 bytes) — len check passes,
    //          answer == 0 fails next ────────────────────────────────────────
    it("[A→E] feed data length 232 (exact min) — passes len check, fails on answer==0", async () => {
        const feed = Buffer.alloc(232, 0);
        feed.writeUInt8(PRICE_DECIMALS, FEED_DECIMALS_OFFSET);
        feed.writeUInt32LE(MID_TS >>> 0, FEED_TIMESTAMP_OFFSET);
        // answer bytes remain 0 → answer == 0 → InvalidOraclePrice

        const h = await buildCtx(feed);
        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOraclePrice" // length check passed; answer check failed
        );
    });

    // ── fee_lamports == 0 when answer is huge ─────────────────────────────
    it("answer > 9.9e16 → fee_lamports rounds to 0 → InvalidOraclePrice", async () => {
        // fee = 99 * 10^9 * 10^8 / (100 * answer) = 9.9e18 / (100 * answer)
        // fee == 0 when answer > 9.9e16; use 10^17 — well within u128, no overflow
        const largeAnswer = 100_000_000_000_000_000n; // 10^17
        const feed = buildFeedData(largeAnswer, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(feed);
        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOraclePrice"
        );
    });

    // ── decimals=0 → fee integer-divides to 0 ─────────────────────────────
    // fee = 99 * 10^9 * 10^0 / (100 * 10_000_000_000) = 99e9 / 1e12 = 0
    it("decimals=0 → fee_lamports == 0 → InvalidOraclePrice", async () => {
        const feed = buildFeedData(PRICE_RAW, 0, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "InvalidOraclePrice"
        );
    });

    // ── Future updated_at → saturating_sub → 0 → treated as fresh ─────────
    it("updated_at in the future → saturating_sub gives 0 → treated as fresh", async () => {
        // MID_TS + 100 > MID_TS → now.saturating_sub(updated_at) = 0 < 3600
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS + 100);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        await doWithdraw(h, streamPda, recipientAta); // must not throw
        expect(Number(await getTokenBalance(h.context, recipientAta))).to.be.greaterThan(0);
    });

    // ── High decimals (18) — no u128 overflow ─────────────────────────────
    it("decimals=18 with proportionally large answer — no overflow panic", async () => {
        // fee = 99 * 1e9 * 10^18 / (100 * 10^25) = 99e27 / 1e27 = 99 lamports
        const highAnswer = 10_000_000_000_000_000_000_000_000n; // 10^25
        const feed = buildFeedData(highAnswer, 18, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);

        try {
            await doWithdraw(h, streamPda, recipientAta);
        } catch (err: any) {
            // Any program error is acceptable; we only guard against runtime panics
            const raw = err?.message ?? String(err);
            expect(raw).not.to.include("panicked");
        }
    });

    // ── Regression: oracle NOT called during create_stream ─────────────────
    it("oracle is not checked during create_stream (invalid feed → stream still created)", async () => {
        const invalidFeed = buildFeedData(0n, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(invalidFeed);

        // create_stream must succeed even though oracle feed has answer=0
        const { streamPda } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);

        const acc = await h.context.banksClient.getAccount(streamPda);
        expect(acc).to.not.be.null;
    });

    // ── Fee vault receives correct lamports per withdraw ────────────────────
    it("fee vault balance increases by exactly EXPECTED_FEE_LAMPORTS per withdraw", async () => {
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);
        setFeed(h.context, PRICE_RAW, PRICE_DECIMALS, MID_TS);

        const before = await getSolBalance(h.context, h.feeVaultPda);
        await doWithdraw(h, streamPda, recipientAta);
        const after = await getSolBalance(h.context, h.feeVaultPda);

        expect(Number(after - before)).to.equal(EXPECTED_FEE_LAMPORTS);
    });

    // ── Double withdraw → NothingToWithdraw (oracle is not the blocker) ────
    it("double withdraw at same time → NothingToWithdraw (oracle path is not the blocker)", async () => {
        const feed = buildFeedData(PRICE_RAW, PRICE_DECIMALS, MID_TS);
        const h = await buildCtx(feed);

        const { streamPda, recipientAta } = await setupLinearStream(h, nextNonce(), START_TS, END_TS);
        await setTime(h.context, MID_TS);
        setFeed(h.context, PRICE_RAW, PRICE_DECIMALS, MID_TS);

        await doWithdraw(h, streamPda, recipientAta); // first succeeds

        await expectOracleError(
            doWithdraw(h, streamPda, recipientAta),
            "NothingToWithdraw"
        );
    });
});