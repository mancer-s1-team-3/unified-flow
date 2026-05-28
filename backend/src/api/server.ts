import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";

import prisma from "../db/prisma";
import { connection } from "../services/rpc";
import { parseCsvText, computeCsvDiff, mapCsvRowsToStreams } from "../services/csvDiff";
import idl from "../idl/solana_program.json";

const app = express();

app.use(cors());
app.use(express.json());

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
    const { content, filename, uploader } = req.body;
    if (!content) {
        return res.status(400).send({ error: "CSV content is required." });
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

app.listen(3000, () => {
    console.log("API running on 3000");
});
