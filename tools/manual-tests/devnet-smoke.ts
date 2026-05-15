/**
 * Devnet Smoke Test — Unified Flow
 *
 * Covers 8 scenarios against the live devnet program:
 *   1. create_stream          — tokens locked in vault PDA
 *   2. Partial withdraw ~50%  — correct proportional amount
 *   3. Full withdraw 100%     — remaining tokens, status → COMPLETED
 *   4. NothingToWithdraw      — before vesting period starts
 *   5. Unauthorized           — stranger tries to withdraw
 *   6. StreamNotActive        — withdraw after stream is COMPLETED
 *   7. Unauthorized           — creator tries to withdraw own stream
 *
 * Run:
 *   cd unified-flow
 *   npx ts-node --project tsconfig.json manual-tests/devnet-smoke.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { SolanaProgram } from "../unified-flow/target/types/solana_program";
import IDL from "../unified-flow/target/idl/solana_program.json";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEVNET_RPC    = "https://api.devnet.solana.com";
// const DEVNET_RPC    = "https://solana-devnet.g.alchemy.com/v2/kavdD0d3AcCK-APKJhHkW";
const PROGRAM_ID    = new PublicKey("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");
const SOL_USD_FEED  = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
const EXPLORER      = "https://explorer.solana.com";

const STREAM_DURATION = 120;   // seconds — main vesting window
const TOKEN_AMOUNT    = 1_000_000; // 1.000000 tokens (6 decimals)
const MINT_DECIMALS   = 6;

// ─── Display helpers ─────────────────────────────────────────────────────────

const txUrl  = (sig: string) => `${EXPLORER}/tx/${sig}?cluster=devnet`;
const accUrl = (pk: PublicKey) => `${EXPLORER}/address/${pk.toBase58()}?cluster=devnet`;

let _passed = 0;
let _failed = 0;

function pass(label: string, value: string) {
  _passed++;
  console.log(`  ✓ ${label.padEnd(22)} ${value}`);
}
function fail(label: string, value: string) {
  _failed++;
  console.log(`  ✗ ${label.padEnd(22)} ${value}`);
}
function info(label: string, value: string) {
  console.log(`  · ${label.padEnd(22)} ${value}`);
}
function header(n: string, title: string) {
  console.log();
  console.log("─".repeat(62));
  console.log(`  [${n}] ${title}`);
  console.log("─".repeat(62));
}

async function sleep(seconds: number, label: string) {
  process.stdout.write(`  ⏳ ${label} `);
  for (let i = 0; i < seconds; i++) {
    await new Promise(r => setTimeout(r, 1000));
    process.stdout.write(".");
  }
  console.log(" done");
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function loadWallet(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")))
  );
}

async function ensureSol(connection: Connection, kp: Keypair, minLamports: number) {
  const bal = await connection.getBalance(kp.publicKey);
  if (bal < minLamports) {
    throw new Error(
      `Insufficient SOL on ${kp.publicKey.toBase58()}: ` +
      `has ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL, ` +
      `needs ${(minLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL. ` +
      `Fund via: solana airdrop 2 ${kp.publicKey.toBase58()} --url devnet`
    );
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 10): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const isFlaky = msg.includes("Unknown action") ||
                      msg.includes("blockhash") ||
                      msg.includes("429") ||
                      msg.includes("503");
      if (!isFlaky || attempt === maxAttempts) throw err;
      const delay = 2000 * attempt;
      process.stdout.write(`\n  ↻ RPC error, retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

async function expectError(promise: Promise<any>, errorCode: string): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch (err: any) {
    const haystack = [
      err?.error?.errorCode?.code ?? "",
      err?.error?.errorMessage ?? "",
      (err?.logs ?? []).join(" "),
      (err?.transactionLogs ?? []).join(" "),
      err?.message ?? "",
      String(err),
    ].join(" ");
    return haystack.includes(errorCode);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log();
  console.log("═".repeat(62));
  console.log("  Unified Flow — Devnet Smoke Test");
  console.log("═".repeat(62));

  // ── Connections & keypairs ──────────────────────────────────────────────────

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const admin      = loadWallet();
  const creator    = Keypair.generate();
  const recipient  = Keypair.generate();
  const stranger   = Keypair.generate();

  console.log();
  console.log("  Keypairs");
  info("admin",     admin.publicKey.toBase58());
  info("creator",   creator.publicKey.toBase58());
  info("recipient", recipient.publicKey.toBase58());
  info("stranger",  stranger.publicKey.toBase58());

  // ── Anchor program ─────────────────────────────────────────────────────────

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = new Program<SolanaProgram>(IDL as SolanaProgram, provider);

  // ── Fund wallets ───────────────────────────────────────────────────────────

  console.log();
  process.stdout.write("  Funding wallets from admin");
  await ensureSol(connection, admin, LAMPORTS_PER_SOL / 2);

  const fundTx = new Transaction();
  for (const kp of [creator, recipient, stranger]) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey:   kp.publicKey,
        lamports:   LAMPORTS_PER_SOL / 10,
      })
    );
  }
  const fundSig = await provider.sendAndConfirm(fundTx);
  console.log(` done (${txUrl(fundSig)})`);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );

  // ── Config ─────────────────────────────────────────────────────────────────

  process.stdout.write("  Initializing config");
  try {
    await program.methods
      .initializeConfig()
      .accounts({ admin: admin.publicKey })
      .rpc();
    console.log(" done");
  } catch {
    console.log(" (already initialized)");
  }
  const config = await program.account.configAccount.fetch(configPda);

  // ── Mint & token accounts ──────────────────────────────────────────────────

  process.stdout.write("  Creating mint");
  const mint = await createMint(
    connection, admin, admin.publicKey, null, MINT_DECIMALS,
    undefined, undefined, TOKEN_PROGRAM_ID
  );
  console.log(` done → ${mint.toBase58()}`);

  const recipientAta = (
    await getOrCreateAssociatedTokenAccount(connection, admin, mint, recipient.publicKey)
  ).address;
  const strangerAta = (
    await getOrCreateAssociatedTokenAccount(connection, admin, mint, stranger.publicKey)
  ).address;
  const creatorAta = (
    await getOrCreateAssociatedTokenAccount(connection, admin, mint, creator.publicKey)
  ).address;

  // Pre-fund creator with enough tokens for all streams in this script
  await mintTo(connection, admin, mint, creatorAta, admin, TOKEN_AMOUNT * 10);

  // ── Helpers ────────────────────────────────────────────────────────────────

  let nonceSeq = Date.now();

  async function createStream(opts: {
    signerKp?: Keypair;
    signerAta?: PublicKey;
    recipientPk?: PublicKey;
    startTs: number;
    endTs: number;
    amount?: number;
  }) {
    const signer  = opts.signerKp  ?? creator;
    const sAta    = opts.signerAta ?? creatorAta;
    const rcpt    = opts.recipientPk ?? recipient.publicKey;
    const amount  = opts.amount ?? TOKEN_AMOUNT;
    const n       = new BN(nonceSeq++);

    const [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        signer.publicKey.toBuffer(),
        rcpt.toBuffer(),
        n.toArrayLike(Buffer, "le", 8),
      ],
      PROGRAM_ID
    );
    const vaultAta = await anchor.utils.token.associatedAddress({
      mint,
      owner: streamPda,
    });

    const sig = await withRetry(() =>
      program.methods
        .createStream(new BN(amount), new BN(opts.startTs), new BN(opts.endTs), n)
        .accounts({
          creator:             signer.publicKey,
          recipient:           rcpt,
          mint,
          creatorTokenAccount: sAta,
          tokenProgram:        TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc({ skipPreflight: true })
    );
    return { streamPda, vaultAta, sig };
  }

  function doWithdraw(signerKp: Keypair, streamPda: PublicKey, ata: PublicKey) {
    return withRetry(() =>
      program.methods
        .withdraw(new BN(nonceSeq++))
        .accounts({
          recipient:     signerKp.publicKey,
          stream:        streamPda,
          recipientAta:  ata,
          feeReceiver:   config.feeAuthority,
          chainlinkFeed: SOL_USD_FEED,
          tokenProgram:  TOKEN_PROGRAM_ID,
        } as any)
        .signers([signerKp])
        .rpc()
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 1 — create_stream
  // ══════════════════════════════════════════════════════════════════════════

  header("1/7", "create_stream — lock tokens into vault PDA");

  const mainStart = Math.floor(Date.now() / 1000) + 15; // buffer for devnet latency
  const mainEnd   = mainStart + STREAM_DURATION;

  const { streamPda: mainStream, vaultAta: mainVault, sig: s1 } =
    await createStream({ startTs: mainStart, endTs: mainEnd });

  pass("tx",          txUrl(s1));
  pass("stream PDA",  accUrl(mainStream));
  pass("vault",       accUrl(mainVault));

  const vaultState = await getAccount(connection, mainVault);
  const vaultLocked = Number(vaultState.amount);
  vaultLocked === TOKEN_AMOUNT
    ? pass("vault balance", `${vaultLocked} tokens locked ✓`)
    : fail("vault balance", `expected ${TOKEN_AMOUNT}, got ${vaultLocked}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 4 — NothingToWithdraw (before vesting starts)
  // ══════════════════════════════════════════════════════════════════════════

  header("2/7", "NothingToWithdraw — withdraw before vesting period starts");

  const futureStart = Math.floor(Date.now() / 1000) + 3_600;
  const { streamPda: futureStream } = await createStream({
    startTs: futureStart,
    endTs:   futureStart + STREAM_DURATION,
  });

  const ok4 = await expectError(
    doWithdraw(recipient, futureStream, recipientAta),
    "NothingToWithdraw"
  );
  ok4
    ? pass("error", "NothingToWithdraw ✓")
    : fail("error", "expected NothingToWithdraw but did not get it");

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 5 — Unauthorized (stranger)
  // ══════════════════════════════════════════════════════════════════════════

  header("3/7", "Unauthorized — stranger tries to withdraw main stream");

  const ok5 = await expectError(
    doWithdraw(stranger, mainStream, strangerAta),
    "Unauthorized"
  );
  ok5
    ? pass("error", "Unauthorized ✓")
    : fail("error", "expected Unauthorized but did not get it");

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 8 — Unauthorized (creator)
  // ══════════════════════════════════════════════════════════════════════════

  header("4/7", "Unauthorized — creator tries to withdraw their own stream");
  info("note", "creator deposited tokens but has no withdraw access");

  const ok8 = await expectError(
    doWithdraw(creator, mainStream, creatorAta),
    "Unauthorized"
  );
  ok8
    ? pass("error", "Unauthorized ✓ (tokens remain locked)")
    : fail("error", "expected Unauthorized but did not get it");

  // ══════════════════════════════════════════════════════════════════════════
  //  Wait → 50%
  // ══════════════════════════════════════════════════════════════════════════

  const elapsedA = Math.floor(Date.now() / 1000) - mainStart;
  const waitA    = Math.max(1, Math.ceil(STREAM_DURATION / 2) - elapsedA + 2);

  console.log();
  await sleep(waitA, `waiting ${waitA}s until ~50% vested`);
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 2 — Partial withdraw at ~50%
  // ══════════════════════════════════════════════════════════════════════════

  header("5/7", "Partial withdraw — recipient claims at ~50% vested");

  const balBefore2 = (await getAccount(connection, recipientAta)).amount;
  const s2 = await doWithdraw(recipient, mainStream, recipientAta);
  const balAfter2  = (await getAccount(connection, recipientAta)).amount;
  const claimed2   = Number(balAfter2 - balBefore2);
  const expected50 = TOKEN_AMOUNT / 2;

  pass("tx",      txUrl(s2));
  pass("claimed", `${claimed2} tokens`);
  info("expected ~50%", `${expected50} tokens`);

  const diff2 = Math.abs(claimed2 - expected50);
  diff2 <= expected50 * 0.15
    ? pass("within 15% tolerance", `diff = ${diff2} ✓`)
    : fail("within 15% tolerance", `diff = ${diff2} (too far off)`);

  const stream2 = await program.account.streamAccount.fetch(mainStream);
  pass("stream.withdrawn", `${stream2.withdrawn.toNumber()} tokens`);
  stream2.status === 1
    ? pass("stream.status", "ACTIVE (1) ✓")
    : fail("stream.status", `expected ACTIVE(1), got ${stream2.status}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  Wait → 100%
  // ══════════════════════════════════════════════════════════════════════════

  const elapsedB = Math.floor(Date.now() / 1000) - mainStart;
  const waitB    = Math.max(1, STREAM_DURATION - elapsedB + 2);

  console.log();
  await sleep(waitB, `waiting ${waitB}s until 100% vested`);
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 3 — Full withdraw at 100%
  // ══════════════════════════════════════════════════════════════════════════

  header("6/7", "Full withdraw — recipient claims remaining tokens at 100%");

  const balBefore3 = (await getAccount(connection, recipientAta)).amount;
  const s3 = await doWithdraw(recipient, mainStream, recipientAta);
  const balAfter3  = (await getAccount(connection, recipientAta)).amount;
  const claimed3   = Number(balAfter3 - balBefore3);

  pass("tx",           txUrl(s3));
  pass("claimed now",  `${claimed3} tokens`);
  pass("total received", `${Number(balAfter3)} tokens`);

  const stream3 = await program.account.streamAccount.fetch(mainStream);

  stream3.withdrawn.toNumber() === TOKEN_AMOUNT
    ? pass("stream.withdrawn", `${stream3.withdrawn.toNumber()} / ${TOKEN_AMOUNT} ✓`)
    : fail("stream.withdrawn", `expected ${TOKEN_AMOUNT}, got ${stream3.withdrawn.toNumber()}`);

  stream3.status === 2
    ? pass("stream.status", "COMPLETED (2) ✓")
    : fail("stream.status", `expected COMPLETED(2), got ${stream3.status}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SCENARIO 6 — StreamNotActive (after COMPLETED)
  // ══════════════════════════════════════════════════════════════════════════

  header("7/7", "StreamNotActive — withdraw after stream is COMPLETED");

  const ok6 = await expectError(
    doWithdraw(recipient, mainStream, recipientAta),
    "StreamNotActive"
  );
  ok6
    ? pass("error", "StreamNotActive ✓")
    : fail("error", "expected StreamNotActive but did not get it");

  // ══════════════════════════════════════════════════════════════════════════
  //  Summary
  // ══════════════════════════════════════════════════════════════════════════

  console.log();
  console.log("═".repeat(62));
  console.log("  All scenarios complete");
  console.log("═".repeat(62));
  console.log(`  ✓ Passed  ${_passed}`);
  console.log(`  ✗ Failed  ${_failed}`);
  console.log(`  Stream  ${accUrl(mainStream)}`);
  console.log(`  Vault   ${accUrl(mainVault)}`);
  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
