import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";

import prisma from "../db/prisma";
import { connection } from "../services/rpc";
import { parseCsvText, computeCsvDiff, mapCsvRowsToStreams } from "../services/csvDiff";

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
                milestoneCount: Number(data.milestoneCount || 0),
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
                    milestoneCount: Number(item.milestoneCount || 0),
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

            const stream = await prisma.stream.update({
                where: { id: item.id },
                data: {
                    totalAmount: item.amount ? BigInt(item.amount) : undefined,
                    endTs: item.duration ? BigInt(Math.floor(Number(existing.startTs) + Number(item.duration))) : undefined,
                    cancelable: item.cancelable !== undefined ? Boolean(item.cancelable) : undefined,
                    milestones: item.milestones !== undefined ? String(item.milestones) : undefined,
                    milestoneCount: item.milestones !== undefined ? item.milestones.split(";").filter(Boolean).length : undefined,
                }
            });
            updated.push(stream);
        }
        res.send(JSON.stringify({ success: true, count: updated.length, streams: updated }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// 1. Get all CSV upload versions
app.get("/csv/versions", async (_, res) => {
    try {
        const versions = await prisma.csvUpload.findMany({
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
        // Find highest version number
        const lastUpload = await prisma.csvUpload.findFirst({
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
                uploader: uploader || "Anonymous"
            }
        });

        res.send(JSON.stringify({ success: true, version: newVersion, upload }));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

// 3. Diff Engine Endpoint
app.post("/csv/diff", async (req, res) => {
    const { csvText, mode, compareVersion } = req.body;
    if (!csvText) {
        return res.status(400).send({ error: "csvText is required." });
    }
    if (mode !== "create" && mode !== "edit") {
        return res.status(400).send({ error: "mode must be either 'create' or 'edit'." });
    }

    try {
        let refStreams: any[] = [];

        if (compareVersion) {
            // Compare against a specific historical version
            const targetUpload = await prisma.csvUpload.findFirst({
                where: { version: Number(compareVersion) }
            });
            if (!targetUpload) {
                return res.status(404).send({ error: `CSV version ${compareVersion} not found.` });
            }
            const parsedRefRows = parseCsvText(targetUpload.content);
            refStreams = mapCsvRowsToStreams(parsedRefRows);
        } else {
            // Compare against current live database streams that were created via CSV
            refStreams = await prisma.stream.findMany({
                where: { isCsvCreated: true }
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

app.listen(3000, () => {
    console.log("API running on 3000");
});
