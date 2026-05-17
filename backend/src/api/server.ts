import express from "express";
import cors from "cors";

import prisma from "../db/prisma";

const app = express();

app.use(cors());
app.use(express.json());

function bigintReplacer(
    _: string,
    value: any
) {
    return typeof value === "bigint"
        ? value.toString()
        : value;
}

app.get("/streams", async (_, res) => {
    const streams = await prisma.stream.findMany({
        orderBy: {
            createdAt: "desc",
        },
    });

    res.send(
        JSON.stringify(
            streams,
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

    res.send(
        JSON.stringify(
            stream,
            bigintReplacer
        )
    );
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
                cliffTs: BigInt(data.type === "2" ? Math.floor(Date.now() / 1000) + Number(data.cliffDuration || 600) : 0),
                endTs: BigInt(Math.floor(Date.now() / 1000) + Number(data.duration || 3600)),
                vestingType: Number(data.type || 0),
                status: 1,
                cancelable: Boolean(data.cancelable !== undefined ? data.cancelable : true),
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
                    cliffTs: BigInt(item.type === "2" ? Math.floor(Date.now() / 1000) + Number(item.cliffDuration || 600) : 0),
                    endTs: BigInt(Math.floor(Date.now() / 1000) + Number(item.duration || 3600)),
                    vestingType: Number(item.type || 0),
                    status: 1,
                    cancelable: Boolean(item.cancelable !== undefined ? item.cancelable : true),
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
                }
            });
            updated.push(stream);
        }
        res.send(JSON.stringify({ success: true, count: updated.length, streams: updated }, bigintReplacer));
    } catch (err: any) {
        res.status(400).send({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log("API running on 3000");
});