import express from "express";
import * as anchor from "@coral-xyz/anchor";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
    Keypair,
    PublicKey,
    SystemProgram,
    Connection,
} from "@solana/web3.js";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import prisma from "../db/prisma";
import { connection, getActiveCluster, getPrimaryRpcEndpoint } from "../services/rpc";
import { logger, captureException } from "../services/logger";
import { indexerState } from "../services/indexerState";
import { parseCsvText, computeCsvDiff, mapCsvRowsToStreams, validateCsvContent } from "../services/csvDiff";
import { streamChat, isConfigured as isAiConfigured, type ChatContext } from "../services/aiChat";
import { screenUserMessage, REFUSAL_MESSAGE } from "../services/contentGuard";
import idl from "../idl/unified_flow.json";

const app = express();

// Restrict browser cross-origin access to known frontends. Configure via the
// CORS_ORIGINS env (comma-separated); falls back to local dev ports. Requests
// without an Origin header (curl, server-to-server, health checks) are allowed
// through — CORS is a browser-enforced control, not a substitute for auth.
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`Origin ${origin} is not allowed by CORS`));
            }
        },
    }),
);
app.use(express.json());

// Per-request id + structured access logging. The id is echoed back via the
// x-request-id header and threaded into error logs so a client error can be
// traced to a single server log line. Health/readiness probes are skipped to
// avoid log spam.
app.use((req, res, next) => {
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();
    (req as any).requestId = requestId;
    res.setHeader("x-request-id", requestId);

    const startedAt = Date.now();
    res.on("finish", () => {
        if (req.path === "/health" || req.path === "/ready") return;
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
        logger[level]("request", {
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            ms: Date.now() - startedAt,
        });
    });

    next();
});

// =====================================================
// CONSTANTS & SETUP
// =====================================================

const PROGRAM_ID = new PublicKey("8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa");
const CONFIG_SEED = Buffer.from("config");
const STREAM_SEED = Buffer.from("stream");
const MILESTONE_SEED = Buffer.from("milestone");

// Initialize Anchor program
// Create a dedicated Connection for Anchor (not the RpcPool wrapper)
const anchorConnection = new Connection(connection.activeHttpEndpoint, "confirmed");
const provider = new anchor.AnchorProvider(anchorConnection, new anchor.Wallet(Keypair.generate()), {
    commitment: "confirmed",
});
const program = new anchor.Program(idl as any, provider);

// =====================================================
// PDA DERIVATION FUNCTIONS
// =====================================================

function getConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
}

function getStreamPda(creator: PublicKey, recipient: PublicKey, nonce: bigint): [PublicKey, number] {
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(nonce);
    return PublicKey.findProgramAddressSync(
        [STREAM_SEED, creator.toBuffer(), recipient.toBuffer(), nonceBuffer],
        PROGRAM_ID
    );
}

function getVaultPda(streamPda: PublicKey, mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [streamPda.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        TOKEN_PROGRAM_ID
    );
}

function getMilestonePda(streamPda: PublicKey, index: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [MILESTONE_SEED, streamPda.toBuffer(), Buffer.from([index])],
        PROGRAM_ID
    );
}

// =====================================================
// TRANSACTION BUILDING FUNCTIONS
// =====================================================

async function buildWithdrawTransaction(
    streamId: string
): Promise<{ transaction: string; accounts: any }> {
    const stream = await prisma.stream.findUnique({
        where: { id: streamId },
    });

    if (!stream) {
        throw new Error("Stream not found");
    }

    const creatorPubkey = new PublicKey(stream.creator);
    const recipientPubkey = new PublicKey(stream.recipient);
    const mintPubkey = new PublicKey(stream.mint);
    const nonce = BigInt(stream.nonce);

    const [configPda] = getConfigPda();
    const [streamPda] = getStreamPda(creatorPubkey, recipientPubkey, nonce);
    const [vaultPda] = getVaultPda(streamPda, mintPubkey);
    const recipientAta = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

    const tx = await program.methods
        .withdraw()
        .accounts({
            recipient: recipientPubkey,
            mint: mintPubkey,
            config: configPda,
            stream: streamPda,
            vault: vaultPda,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();

    tx.feePayer = recipientPubkey;
    const { blockhash } = await anchorConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    return {
        transaction: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
        accounts: {
            recipient: recipientPubkey.toBase58(),
            mint: mintPubkey.toBase58(),
            config: configPda.toBase58(),
            stream: streamPda.toBase58(),
            vault: vaultPda.toBase58(),
            recipientTokenAccount: recipientAta.toBase58(),
        },
    };
}

async function buildCancelTransaction(
    streamId: string
): Promise<{ transaction: string; accounts: any }> {
    const stream = await prisma.stream.findUnique({
        where: { id: streamId },
    });

    if (!stream) {
        throw new Error("Stream not found");
    }

    if (!stream.cancelable) {
        throw new Error("Stream is not cancelable");
    }

    const creatorPubkey = new PublicKey(stream.creator);
    const recipientPubkey = new PublicKey(stream.recipient);
    const mintPubkey = new PublicKey(stream.mint);
    const nonce = BigInt(stream.nonce);

    const [configPda] = getConfigPda();
    const [streamPda] = getStreamPda(creatorPubkey, recipientPubkey, nonce);
    const [vaultPda] = getVaultPda(streamPda, mintPubkey);
    const creatorAta = await getAssociatedTokenAddress(mintPubkey, creatorPubkey);
    const recipientAta = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

    const tx = await program.methods
        .cancel()
        .accounts({
            creator: creatorPubkey,
            mint: mintPubkey,
            config: configPda,
            stream: streamPda,
            vault: vaultPda,
            creatorTokenAccount: creatorAta,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();

    tx.feePayer = creatorPubkey;
    const { blockhash } = await anchorConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    return {
        transaction: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
        accounts: {
            creator: creatorPubkey.toBase58(),
            mint: mintPubkey.toBase58(),
            config: configPda.toBase58(),
            stream: streamPda.toBase58(),
            vault: vaultPda.toBase58(),
            creatorTokenAccount: creatorAta.toBase58(),
            recipientTokenAccount: recipientAta.toBase58(),
        },
    };
}

async function buildUnlockMilestoneTransaction(
    streamId: string,
    milestoneIndex: number
): Promise<{ transaction: string; accounts: any }> {
    const stream = await prisma.stream.findUnique({
        where: { id: streamId },
    });

    if (!stream) {
        throw new Error("Stream not found");
    }

    if (stream.vestingType !== 2) {
        throw new Error("Stream is not a milestone vesting type");
    }

    if (milestoneIndex >= stream.milestoneCount) {
        throw new Error("Invalid milestone index");
    }

    const creatorPubkey = new PublicKey(stream.creator);
    const recipientPubkey = new PublicKey(stream.recipient);
    const mintPubkey = new PublicKey(stream.mint);
    const nonce = BigInt(stream.nonce);

    const [configPda] = getConfigPda();
    const [streamPda] = getStreamPda(creatorPubkey, recipientPubkey, nonce);
    const [vaultPda] = getVaultPda(streamPda, mintPubkey);
    const [milestonePda] = getMilestonePda(streamPda, milestoneIndex);

    const tx = await program.methods
        .unlockMilestone(new anchor.BN(milestoneIndex))
        .accounts({
            creator: creatorPubkey,
            recipient: recipientPubkey,
            mint: mintPubkey,
            config: configPda,
            stream: streamPda,
            vault: vaultPda,
            milestone: milestonePda,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();

    tx.feePayer = creatorPubkey;
    const { blockhash } = await anchorConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    return {
        transaction: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
        accounts: {
            creator: creatorPubkey.toBase58(),
            recipient: recipientPubkey.toBase58(),
            mint: mintPubkey.toBase58(),
            config: configPda.toBase58(),
            stream: streamPda.toBase58(),
            vault: vaultPda.toBase58(),
            milestone: milestonePda.toBase58(),
        },
    };
}

async function readSkillMarkdown() {
    const skillPath = path.resolve(__dirname, "../../skill.md");
    const content = await fs.readFile(skillPath, "utf8");

    return {
        content,
        source: "backend/skill.md",
    };
}

function bigintReplacer(
    _: string,
    value: any
) {
    return typeof value === "bigint"
        ? value.toString()
        : value;
}

const mintDecimalsCache = new Map<string, number | null>();

async function getMintDecimals(mint: string): Promise<number | null> {
    const cached = mintDecimalsCache.get(mint);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const mintPubkey = new PublicKey(mint);
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        const parsedMintData = mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
        const decimals = typeof parsedMintData?.parsed?.info?.decimals === "number"
            ? parsedMintData.parsed.info.decimals
            : null;

        mintDecimalsCache.set(mint, decimals);
        return decimals;
    } catch {
        mintDecimalsCache.set(mint, null);
        return null;
    }
}

async function enrichStreamsWithDecimals(streams: any[]) {
    const uniqueMints = [...new Set(streams.map((stream) => stream.mint).filter(Boolean))];
    const mintDecimalEntries = await Promise.all(
        uniqueMints.map(async (mint) => [mint, await getMintDecimals(mint)] as const)
    );
    const mintDecimalsByMint = new Map(mintDecimalEntries);

    return streams.map((stream) => ({
        ...stream,
        mintDecimals: mintDecimalsByMint.get(stream.mint) ?? null,
    }));
}

app.get("/streams", async (_, res) => {
    const streams = await prisma.stream.findMany({
        orderBy: {
            createdAt: "desc",
        },
    });

    const enrichedStreams = await enrichStreamsWithDecimals(streams);

    res.send(
        JSON.stringify(
            enrichedStreams,
            bigintReplacer
        )
    );
});

app.get("/streams/:id", async (req, res) => {
    const stream = await prisma.stream.findUnique({
        where: {
            id: req.params.id,
        },
        include: {
            transactions: {
                orderBy: {
                    createdAt: "desc",
                },
            },
        },
    });

    const enrichedStream = stream
        ? {
            ...stream,
            mintDecimals: await getMintDecimals(stream.mint),
        }
        : stream;

    res.send(
        JSON.stringify(
            enrichedStream,
            bigintReplacer
        )
    );
});

app.get("/skills", async (_, res) => {
    try {
        const skill = await readSkillMarkdown();
        res.json(skill);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to load skills documentation." });
    }
});

// Network indicator — lets the frontend confirm which cluster this backend is
// indexing/serving, so it can warn when the UI cluster and backend cluster differ.
app.get("/network", (_req, res) => {
    res.json({
        cluster: getActiveCluster(),
        rpc: getPrimaryRpcEndpoint(),
        programId: process.env.PROGRAM_ID || PROGRAM_ID.toBase58(),
    });
});

// ── Monitoring: health & readiness ───────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
    ]);
}

async function checkDb(): Promise<boolean> {
    try {
        await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
        return true;
    } catch {
        return false;
    }
}

async function checkRpcSlot(): Promise<number | null> {
    try {
        return await withTimeout(connection.getSlot("confirmed"), 3000);
    } catch {
        return null;
    }
}

// Liveness + dependency health. 200 when DB and RPC are reachable, 503 otherwise.
// Indexer liveness (subscribed / last-indexed slot+time / staleness) is reported
// for observability and to drive external alerting.
app.get("/health", async (_req, res) => {
    const [dbUp, rpcSlot] = await Promise.all([checkDb(), checkRpcSlot()]);
    const rpcUp = rpcSlot !== null;
    const healthy = dbUp && rpcUp;
    const staleSeconds = indexerState.lastIndexedAt
        ? Math.round((Date.now() - Date.parse(indexerState.lastIndexedAt)) / 1000)
        : null;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        db: dbUp ? "up" : "down",
        rpc: rpcUp ? "up" : "down",
        cluster: getActiveCluster(),
        rpcSlot,
        indexer: {
            subscribed: indexerState.subscribed,
            lastIndexedSlot: indexerState.lastIndexedSlot,
            lastIndexedAt: indexerState.lastIndexedAt,
            lastHeartbeatAt: indexerState.lastHeartbeatAt,
            reconnects: indexerState.reconnects,
            staleSeconds,
            lastError: indexerState.lastError,
        },
    });
});

// Readiness: is the service able to serve API traffic (DB reachable)? Used by
// orchestrators to gate traffic separately from liveness.
app.get("/ready", async (_req, res) => {
    const dbUp = await checkDb();
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ready" : "unready", db: dbUp ? "up" : "down" });
});

// Create Manual Stream
app.post("/streams", async (req, res) => {
    const data = req.body;
    try {
        const streamId = data.id || `StreamManual-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
        const stream = await prisma.stream.create({
            data: {
                id: streamId,
                creator: data.creator || "6X83YuTdK1N9Q9eR8X9xYhZPGJHpWKGLG2CU62EY",
                recipient: data.recipient,
                mint: data.mint || "EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr",
                vault: data.vault || `Vault-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
                totalAmount: BigInt(data.amount || 1000),
                withdrawn: BigInt(0),
                startTs: BigInt(Math.floor(Date.now() / 1000)),
                cliffTs: BigInt(data.type === "1" ? Math.floor(Date.now() / 1000) + Number(data.cliffDuration || 600) : 0),
                endTs: BigInt(Math.floor(Date.now() / 1000) + Number(data.duration || 3600)),
                vestingType: Number(data.type || 0),
                status: 1,
                cancelable: Boolean(data.cancelable !== undefined ? data.cancelable : true),
                milestones: data.milestones ? data.milestones.map((m: any) => m.amount).join(";") : "",
                milestoneCount: data.milestones ? data.milestones.length : Number(data.milestoneCount || 0),
                nonce: BigInt(1),
                bump: 254,
                isCsvCreated: false, // Explicitly manual
            }
        });
        res.send(JSON.stringify(stream, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// Bulk Create Streams (CSV)
app.post("/streams/bulk", async (req, res) => {
    const items = req.body.items || [];
    try {
        const created = [];
        for (const item of items) {
            const streamId = item.id || `StreamCSV-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
            const stream = await prisma.stream.create({
                data: {
                    id: streamId,
                    creator: item.creator || "6X83YuTdK1N9Q9eR8X9xYhZPGJHpWKGLG2CU62EY",
                    recipient: item.recipient,
                    mint: item.mint || "EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr",
                    vault: item.vault || `Vault-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
                    totalAmount: BigInt(item.amount || 1000),
                    withdrawn: BigInt(0),
                    startTs: BigInt(Math.floor(Date.now() / 1000)),
                    cliffTs: BigInt(Number(item.type) === 1 ? Math.floor(Date.now() / 1000) + Number(item.cliffDuration || 600) : 0),
                    endTs: BigInt(Math.floor(Date.now() / 1000) + Number(item.duration || 3600)),
                    vestingType: Number(item.type || 0),
                    status: 1,
                    cancelable: Boolean(item.cancelable !== undefined ? item.cancelable : true),
                    milestones: String(item.milestones || ""),
                    milestoneCount: item.milestones ? String(item.milestones).split(";").filter(Boolean).length : Number(item.milestoneCount || 0),
                    nonce: BigInt(1),
                    bump: 254,
                    isCsvCreated: true, // Tagged as CSV created
                }
            });
            created.push(stream);
        }
        res.send(JSON.stringify({ success: true, count: created.length, streams: created }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// Bulk Edit CSV Streams (CSV Only)
app.post("/streams/edit-csv", async (req, res) => {
    const items = req.body.items || [];
    try {
        const instructionNames = new Set((idl as any)?.instructions?.map((ix: any) => ix?.name) ?? []);
        const supportsBulkEdit =
            instructionNames.has("edit_linear") &&
            instructionNames.has("edit_cliff") &&
            instructionNames.has("edit_milestone");
        if (!supportsBulkEdit) {
            return res.status(400).send({ error: "IDL is missing required edit instructions for bulk CSV edit." });
        }

        const updated = [];
        for (const item of items) {
            const existing = await prisma.stream.findUnique({
                where: { id: item.id }
            });
            if (!existing) {
                return res.status(404).send({ error: `Stream ${item.id} not found in database.` });
            }
            if (!existing.isCsvCreated) {
                return res.status(400).send({
                    error: `Stream ${item.id} was created manually. CSV editing is strictly forbidden for manual streams.`
                });
            }

            const nextTotalAmount = item.amount ? BigInt(item.amount) : existing.totalAmount;
            const nextEndTs = item.duration ? BigInt(Math.floor(Number(existing.startTs) + Number(item.duration))) : existing.endTs;
            const nextMilestones = item.milestones !== undefined ? String(item.milestones) : existing.milestones;
            const nextMilestoneCount = item.milestones !== undefined
                ? item.milestones.split(";").filter(Boolean).length
                : existing.milestoneCount;

            const hasChanges =
                nextTotalAmount !== existing.totalAmount ||
                nextEndTs !== existing.endTs ||
                nextMilestones !== existing.milestones ||
                Number(nextMilestoneCount) !== Number(existing.milestoneCount);

            if (!hasChanges) {
                continue;
            }

            const stream = await prisma.stream.update({
                where: { id: item.id },
                data: {
                    totalAmount: nextTotalAmount,
                    endTs: nextEndTs,
                    milestones: nextMilestones,
                    milestoneCount: nextMilestoneCount,
                }
            });
            updated.push(stream);
        }
        if (updated.length === 0) {
            return res.status(400).send({ error: "No CSV-created streams were modified. Nothing to apply." });
        }
        res.send(JSON.stringify({ success: true, count: updated.length, streams: updated }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// 1. Get all CSV upload versions
app.get("/csv/versions", async (req, res) => {
    try {
        const uploader = typeof req.query.uploader === "string" ? req.query.uploader.trim() : "";
        if (!uploader) {
            res.send(JSON.stringify([]));
            return;
        }
        const versions = await prisma.csvUpload.findMany({
            where: { uploader },
            orderBy: {
                version: "desc"
            }
        });
        res.send(JSON.stringify(versions));
    } catch (err: any) {
        res.status(500).send({ error: err.message });
    }
});

// 2. Upload/Save a new CSV upload version
app.post("/csv/upload", async (req, res) => {
    const { content, filename, uploader, mode } = req.body;
    if (!content) {
        return res.status(400).send({ error: "CSV content is required." });
    }

    // Validate CSV content instead of blindly persisting it. Mode is taken from
    // the request when provided, else inferred from the conventional filename
    // (bulk_edit_*) — defaulting to "create".
    const resolvedMode: "create" | "edit" =
        mode === "edit" || mode === "create"
            ? mode
            : /edit/i.test(String(filename ?? "")) ? "edit" : "create";
    const validationErrors = validateCsvContent(String(content), resolvedMode);
    if (validationErrors.length > 0) {
        return res.status(400).send({
            error: `CSV validation failed: ${validationErrors[0]}${validationErrors.length > 1 ? ` (+${validationErrors.length - 1} more)` : ""}`,
            details: validationErrors,
        });
    }

    try {
        const uploaderFilter = typeof uploader === "string" ? uploader.trim() : "";

        // Find highest version number for this uploader so version history stays creator-scoped.
        const lastUpload = await prisma.csvUpload.findFirst({
            where: uploaderFilter ? { uploader: uploaderFilter } : undefined,
            orderBy: {
                version: "desc"
            }
        });
        const newVersion = (lastUpload?.version || 0) + 1;

        const upload = await prisma.csvUpload.create({
            data: {
                version: newVersion,
                filename: filename || `upload_v${newVersion}.csv`,
                content,
                uploader: uploaderFilter || "Anonymous"
            }
        });

        res.send(JSON.stringify({ success: true, version: newVersion, upload }));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

app.delete("/csv/version", async (req, res) => {
    const { version, uploader } = req.body as { version?: number | string; uploader?: string };

    if (version === undefined || version === null || String(version).trim() === "") {
        return res.status(400).send({ error: "version is required." });
    }

    const uploaderFilter = typeof uploader === "string" ? uploader.trim() : "";
    if (!uploaderFilter) {
        return res.status(400).send({ error: "uploader is required." });
    }

    try {
        const result = await prisma.csvUpload.deleteMany({
            where: {
                version: Number(version),
                uploader: uploaderFilter,
            },
        });

        if (result.count === 0) {
            return res.status(404).send({ error: `CSV version ${version} not found for this uploader.` });
        }

        res.send(JSON.stringify({ success: true, count: result.count }));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// 3. Diff Engine Endpoint
app.post("/csv/diff", async (req, res) => {
    const { csvText, mode, compareVersion, uploader } = req.body;
    if (!csvText) {
        return res.status(400).send({ error: "csvText is required." });
    }
    if (mode !== "create" && mode !== "edit") {
        return res.status(400).send({ error: "mode must be either 'create' or 'edit'." });
    }

    try {
        const uploaderFilter = typeof uploader === "string" ? uploader.trim() : "";
        let refStreams: any[] = [];

        if (compareVersion) {
            if (!uploaderFilter) {
                return res.status(403).send({ error: "Uploader is required to access CSV version history." });
            }
            // Compare against a specific historical version
            const targetUpload = await prisma.csvUpload.findFirst({
                where: {
                    version: Number(compareVersion),
                    uploader: uploaderFilter
                }
            });
            if (!targetUpload) {
                return res.status(404).send({ error: `CSV version ${compareVersion} not found.` });
            }
            if (mode === "create") {
                // For create diffs, keep the current DB streams for this creator so the unchanged
                // section shows the real live stream IDs and values. The historical CSV is only
                // used to verify that the requested version exists for this uploader.
                refStreams = await prisma.stream.findMany({
                    where: { creator: uploaderFilter },
                });
            } else {
                const parsedRefRows = parseCsvText(targetUpload.content);
                refStreams = mapCsvRowsToStreams(parsedRefRows);
            }
        } else {
            // Compare against current live database streams, scoped to the connected creator when available.
            refStreams = await prisma.stream.findMany({
                where: mode === "edit"
                    ? {
                        ...(uploaderFilter ? { creator: uploaderFilter } : {}),
                        isCsvCreated: true,
                    }
                    : (uploaderFilter ? { creator: uploaderFilter } : undefined),
            });
        }

        const newRows = parseCsvText(csvText);
        const diffResult = computeCsvDiff(newRows, refStreams, mode);

        res.send(JSON.stringify(diffResult, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

app.post("/streams/edit-linear", async (req, res) => {
    const { streamId, newEndTs, topupAmount } = req.body;
    if (!streamId) {
        return res.status(400).send({ error: "streamId is required." });
    }

    try {
        const existing = await prisma.stream.findUnique({
            where: { id: streamId }
        });
        if (!existing) {
            return res.status(404).send({ error: "Stream not found." });
        }

        let updatedEndTs = existing.endTs;
        let updatedTotalAmount = existing.totalAmount;

        if (newEndTs) {
            updatedEndTs = BigInt(newEndTs);
        }

        if (topupAmount) {
            updatedTotalAmount = existing.totalAmount + BigInt(topupAmount);
        }

        const updated = await prisma.stream.update({
            where: { id: streamId },
            data: {
                endTs: updatedEndTs,
                totalAmount: updatedTotalAmount
            }
        });

        res.send(JSON.stringify({ success: true, stream: updated }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

app.post("/streams/mark-origin", async (req, res) => {
    const { ids, isCsvCreated } = req.body as { ids?: string[]; isCsvCreated?: boolean };

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).send({ error: "ids is required." });
    }

    try {
        const normalizedIds = ids.filter((id): id is string => typeof id === "string" && id.trim() !== "");

        if (normalizedIds.length === 0) {
            return res.status(400).send({ error: "ids is required." });
        }

        const result = await prisma.stream.updateMany({
            where: {
                id: { in: normalizedIds },
            },
            data: {
                isCsvCreated: isCsvCreated ?? true,
            },
        });

        res.send(JSON.stringify({ success: true, count: result.count }));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

app.post("/users/upsert", async (req, res) => {
    const { walletAddress, displayName } = req.body as { walletAddress?: string; displayName?: string };

    if (!walletAddress || typeof walletAddress !== "string" || walletAddress.trim() === "") {
        return res.status(400).send({ error: "walletAddress is required." });
    }

    try {
        const user = await prisma.user.upsert({
            where: { walletAddress: walletAddress.trim() },
            update: { lastActiveAt: new Date(), ...(displayName !== undefined ? { displayName } : {}) },
            create: { walletAddress: walletAddress.trim(), ...(displayName !== undefined ? { displayName } : {}) },
        });
        res.send(JSON.stringify(user));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// =====================================================
// STREAM ACTIONS
// =====================================================

// Withdraw tokens from a stream
app.post("/streams/:id/withdraw", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await buildWithdrawTransaction(id);

        res.send(JSON.stringify({
            success: true,
            transaction: result.transaction,
            accounts: result.accounts,
        }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// Cancel a stream
app.post("/streams/:id/cancel", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await buildCancelTransaction(id);

        res.send(JSON.stringify({
            success: true,
            transaction: result.transaction,
            accounts: result.accounts,
        }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// Unlock a milestone
app.post("/streams/:id/unlock-milestone", async (req, res) => {
    const { id } = req.params;
    const { milestoneIndex } = req.body as { milestoneIndex?: number };

    if (milestoneIndex === undefined || milestoneIndex === null) {
        return res.status(400).send({ error: "milestoneIndex is required." });
    }

    try {
        const result = await buildUnlockMilestoneTransaction(id, milestoneIndex);

        res.send(JSON.stringify({
            success: true,
            transaction: result.transaction,
            accounts: result.accounts,
        }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// =====================================================
// AI CHAT (ASI:One proxy)
// =====================================================

// Reports whether the AI service is configured server-side, so the frontend can
// show the right status without ever seeing the API key.
app.get("/ai/status", (_req, res) => {
    res.send({ configured: isAiConfigured() });
});

// Streams a chat completion as Server-Sent Events. Each event is a normalized
// chunk: { content, done, toolCall? }. The API key, system prompt, and tool
// definitions all live on the server.
app.post("/ai/chat", async (req, res) => {
    const { userMessage, context } = req.body as {
        userMessage?: string;
        context?: ChatContext;
    };

    if (!userMessage || typeof userMessage !== "string") {
        return res.status(400).send({ error: "userMessage is required." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (chunk: unknown) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);

    // Content guard: screen for prompt-injection / abuse before spending an
    // upstream call. The refusal goes out as a normal content chunk (no `error`
    // field) so the UI renders it as a plain assistant reply.
    const verdict = screenUserMessage(userMessage);
    if (!verdict.allowed) {
        logger.warn("ai_chat_flagged", {
            requestId: (req as any).requestId,
            category: verdict.category,
            reason: verdict.reason,
            snippet: userMessage.slice(0, 80),
        });
        send({ content: REFUSAL_MESSAGE, done: true });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
    }

    try {
        for await (const chunk of streamChat(userMessage, context ?? {})) {
            send(chunk);
        }
    } catch (err: any) {
        // Surface a terminal error chunk; the frontend falls back gracefully.
        send({ content: "", done: true, error: err?.message ?? "AI service error" });
    } finally {
        res.write("data: [DONE]\n\n");
        res.end();
    }
});

// Global error handler — must be the LAST middleware and take 4 args for Express
// to treat it as an error handler. Funnels anything thrown in a route to the
// structured logger / error tracker and returns a traceable response.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    captureException(err, {
        where: "express",
        requestId: (req as any).requestId,
        method: req.method,
        path: req.path,
    });
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error", requestId: (req as any).requestId });
});

app.listen(3000, () => {
    logger.info("API running", { port: 3000, cluster: getActiveCluster() });
});
