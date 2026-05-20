import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { connection } from "./rpc";
import prisma from "../db/prisma";
import { parseEventsSafely } from "./eventParser";
import {
    normalizeMilestoneUnlocked,
    normalizeStreamCreated,
    normalizeTokensClaimed,
} from "./eventNormalizer";

dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);

export async function startIndexer() {
    console.log("Starting indexer...");

    connection.onLogs(
        PROGRAM_ID,
        async (logInfo) => {
            try {
                console.log("TX:", logInfo.signature);

                // =========================
                // GET TX
                // =========================
                const tx = await connection.getTransaction(logInfo.signature, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0,
                });

                if (!tx) return;

                const logs = tx.meta?.logMessages || [];

                // =========================
                // PARSE EVENTS
                // =========================
                const events = parseEventsSafely(logs);

                console.log("EVENTS:", events);

                // =========================
                // HANDLE EVENTS
                // =========================
                for (const event of events) {
                    console.log("EVENT:", event.name);

                    if (event.name === "StreamCreated") {
                        await handleStreamCreated(
                            event.data,
                            tx,
                            logInfo.signature
                        );
                    } else if (event.name === "TokensClaimed") {
                        await handleTokensClaimed(
                            event.data,
                            tx,
                            logInfo.signature
                        );
                    } else if (event.name === "MilestoneUnlocked") {
                        await handleMilestoneUnlocked(
                            event.data,
                            tx,
                            logInfo.signature
                        );
                    }
                }
            } catch (err) {
                console.error("Error in indexing transaction log logs:", err);
            }
        },
        "confirmed"
    );
}

async function handleStreamCreated(
    event: any,
    tx: any,
    signature: string
) {
    console.log("STREAM CREATED:", event);

    const normalized = normalizeStreamCreated(event);
    if (!normalized) {
        console.warn("Skipping StreamCreated event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;

    await prisma.stream.upsert({
        where: { id: streamId },
        update: {},
        create: {
            id: streamId,
            creator: normalized.creator,
            recipient: normalized.recipient,
            mint: normalized.mint,
            vault: normalized.vault,
            totalAmount: normalized.totalAmount,
            withdrawn: BigInt(0),
            startTs: normalized.startTs,
            cliffTs: normalized.cliffTs,
            endTs: normalized.endTs,
            vestingType: normalized.vestingType,
            status: 1, // ACTIVE
            cancelable: normalized.cancelable,
            milestoneCount: normalized.milestoneCount,
            nonce: normalized.nonce,
            bump: 0,
        }
    });

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: streamId,
            type: "CREATE_STREAM",
            raw: JSON.parse(JSON.stringify(tx)),
        },
    });

    console.log("Indexed stream:", streamId);
}

async function handleTokensClaimed(
    event: any,
    tx: any,
    signature: string
) {
    console.log("TOKENS CLAIMED:", event);

    const normalized = normalizeTokensClaimed(event);
    if (!normalized) {
        console.warn("Skipping TokensClaimed event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;
    const withdrawnTotal = normalized.withdrawnTotal;

    // Fetch stream totalAmount to check if it's completed
    const stream = await prisma.stream.findUnique({
        where: { id: streamId }
    });

    if (stream) {
        let newStatus = 1; // ACTIVE
        if (withdrawnTotal >= stream.totalAmount) {
            newStatus = 2; // COMPLETED
        }

        await prisma.stream.update({
            where: { id: streamId },
            data: {
                withdrawn: withdrawnTotal,
                status: newStatus
            }
        });
    } else {
        console.log(`Stream ${streamId} not found in database, skipping balance update.`);
    }

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: stream ? streamId : null,
            type: "WITHDRAW",
            raw: JSON.parse(JSON.stringify(tx)),
        }
    });

    console.log(`Indexed withdrawal for stream ${streamId}: ${normalized.claimable.toString()} tokens`);
}

async function handleMilestoneUnlocked(
    event: any,
    tx: any,
    signature: string
) {
    console.log("MILESTONE UNLOCKED:", event);

    const normalized = normalizeMilestoneUnlocked(event);
    if (!normalized) {
        console.warn("Skipping MilestoneUnlocked event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;
    const milestoneAmount = normalized.amount;

    // Fetch stream to update its unlockedAmount
    const stream = await prisma.stream.findUnique({
        where: { id: streamId }
    });

    if (stream) {
        const currentUnlocked = stream.unlockedAmount || BigInt(0);
        await prisma.stream.update({
            where: { id: streamId },
            data: {
                unlockedAmount: currentUnlocked + milestoneAmount
            }
        });
    } else {
        console.log(`Stream ${streamId} not found in database during milestone unlock, skipping.`);
    }

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: stream ? streamId : null,
            type: "MILESTONE_UNLOCKED",
            raw: JSON.parse(JSON.stringify(tx)),
        }
    });

    console.log(`Indexed milestone unlock for stream ${streamId}: unlocked ${milestoneAmount.toString()} tokens`);
}
