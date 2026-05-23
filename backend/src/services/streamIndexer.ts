import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { connection } from "./rpc";
import prisma from "../db/prisma";
import { parseEventsSafely } from "./eventParser";
import {
    normalizeStreamCancelled,
    normalizeMilestoneUnlocked,
    normalizeStreamCreated,
    normalizeTokensClaimed,
    normalizeMilestoneEdited,
    normalizeLinearEdited,
    normalizeCliffEdited,
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
                    } else if (event.name === "StreamCancelled") {
                        await handleStreamCancelled(
                            event.data,
                            tx,
                            logInfo.signature
                        );
                    } else if (event.name === "MilestoneEdited") {
                        await handleMilestoneEdited(event.data, tx, logInfo.signature);
                    } else if (event.name === "LinearEdited") {
                        await handleLinearEdited(event.data, tx, logInfo.signature);
                    } else if (event.name === "CliffEdited") {
                        await handleCliffEdited(event.data, tx, logInfo.signature);
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
    const unlockTs = normalized.unlockTs;
    const completionTs = unlockTs ?? (tx.blockTime !== null && tx.blockTime !== undefined ? BigInt(tx.blockTime) : null);

    // Fetch stream to update its unlockedAmount
    const stream = await prisma.stream.findUnique({
        where: { id: streamId }
    });

    if (stream) {
        const currentUnlocked = stream.unlockedAmount || BigInt(0);
        const updatedUnlocked = currentUnlocked + milestoneAmount;
        const completed = updatedUnlocked >= stream.totalAmount;
        await prisma.stream.update({
            where: { id: streamId },
            data: {
                unlockedAmount: updatedUnlocked,
                status: completed ? 2 : stream.status,
                completedAt: completed && completionTs !== null ? completionTs : stream.completedAt,
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

async function handleStreamCancelled(
    event: any,
    tx: any,
    signature: string
) {
    console.log("STREAM CANCELLED:", event);

    const normalized = normalizeStreamCancelled(event);
    if (!normalized) {
        console.warn("Skipping StreamCancelled event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;

    const stream = await prisma.stream.findUnique({
        where: { id: streamId }
    });

    if (stream) {
        const nextWithdrawn = stream.withdrawn + normalized.claimableForRecipient;

        await prisma.stream.update({
            where: { id: streamId },
            data: {
                withdrawn: nextWithdrawn,
                status: 3,
            }
        });
    } else {
        console.log(`Stream ${streamId} not found in database, skipping cancel update.`);
    }

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: stream ? streamId : null,
            type: "CANCEL",
            raw: JSON.parse(JSON.stringify(tx)),
        }
    });

    console.log(`Indexed cancel for stream ${streamId}: vested ${normalized.vestedAmount.toString()} tokens`);
}

async function handleMilestoneEdited(event: any, tx: any, signature: string) {
    console.log("MILESTONE EDITED:", event);

    const normalized = normalizeMilestoneEdited(event);
    if (!normalized) {
        console.warn("Skipping MilestoneEdited event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;
    const stream = await prisma.stream.findUnique({ where: { id: streamId } });

    if (stream) {
        const diff = normalized.newAmount - normalized.oldAmount;
        const updatedTotal = stream.totalAmount + diff;

        let milestonesArr = stream.milestones ? stream.milestones.split(";") : [];
        while (milestonesArr.length <= normalized.index) {
            milestonesArr.push("0");
        }
        milestonesArr[normalized.index] = normalized.newAmount.toString();

        await prisma.stream.update({
            where: { id: streamId },
            data: {
                totalAmount: updatedTotal,
                milestones: milestonesArr.join(";"),
            }
        });
    }

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: stream ? streamId : null,
            type: "MILESTONE_EDITED",
            raw: JSON.parse(JSON.stringify(tx)),
        }
    });
}

async function handleLinearEdited(event: any, tx: any, signature: string) {
    console.log("LINEAR EDITED:", event);

    const normalized = normalizeLinearEdited(event);
    if (!normalized) {
        console.warn("Skipping LinearEdited event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;
    const stream = await prisma.stream.findUnique({ where: { id: streamId } });

    if (stream) {
        await prisma.stream.update({
            where: { id: streamId },
            data: {
                endTs: normalized.newEndTs,
                totalAmount: normalized.newTotalAmount,
            }
        });
    }

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: stream ? streamId : null,
            type: "LINEAR_EDITED",
            raw: JSON.parse(JSON.stringify(tx)),
        }
    });
}

async function handleCliffEdited(event: any, tx: any, signature: string) {
    console.log("CLIFF EDITED:", event);

    const normalized = normalizeCliffEdited(event);
    if (!normalized) {
        console.warn("Skipping CliffEdited event with missing fields:", event);
        return;
    }

    const streamId = normalized.stream;
    const stream = await prisma.stream.findUnique({ where: { id: streamId } });

    if (stream) {
        await prisma.stream.update({
            where: { id: streamId },
            data: {
                cliffTs: normalized.newCliffTs,
            }
        });
    }

    await prisma.transaction.upsert({
        where: { signature },
        update: {},
        create: {
            id: signature,
            signature,
            slot: BigInt(tx.slot),
            streamId: stream ? streamId : null,
            type: "CLIFF_EDITED",
            raw: JSON.parse(JSON.stringify(tx)),
        }
    });
}
