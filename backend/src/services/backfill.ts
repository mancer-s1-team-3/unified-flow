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
import { recordTransaction } from "./transactionRecorder";

dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);

export async function backfill() {
    console.log("Starting backfill...");

    let before: string | undefined = undefined;

    while (true) {
        const signatures = await connection.getSignaturesForAddress(
            PROGRAM_ID,
            {
                before,
                limit: 100,
            }
        );

        if (signatures.length === 0) {
            break;
        }

        for (const sigInfo of signatures) {
            try {
                console.log("Backfill TX:", sigInfo.signature);

                // =========================
                // FETCH TX
                // =========================
                await new Promise((r) => setTimeout(r, 800));

                const tx = await connection.getTransaction(sigInfo.signature, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0,
                });

                if (!tx) {
                    continue;
                }

                const logs = tx.meta?.logMessages || [];

                // =========================
                // PARSE EVENTS
                // =========================
                const events = parseEventsSafely(logs);

                // =========================
                // HANDLE EVENTS
                // =========================
                for (const event of events) {
                    if (event.name === "StreamCreated") {
                        await handleStreamCreated(event.data, tx, sigInfo.signature);
                    } else if (event.name === "TokensClaimed") {
                        await handleTokensClaimed(event.data, tx, sigInfo.signature);
                    } else if (event.name === "MilestoneUnlocked") {
                        await handleMilestoneUnlocked(event.data, tx, sigInfo.signature);
                    } else if (event.name === "StreamCancelled") {
                        await handleStreamCancelled(event.data, tx, sigInfo.signature);
                    } else if (event.name === "MilestoneEdited") {
                        await handleMilestoneEdited(event.data, tx, sigInfo.signature);
                    } else if (event.name === "LinearEdited") {
                        await handleLinearEdited(event.data, tx, sigInfo.signature);
                    } else if (event.name === "CliffEdited") {
                        await handleCliffEdited(event.data, tx, sigInfo.signature);
                    }
                }
            } catch (err) {
                console.error(`Error in backfilling transaction ${sigInfo.signature}:`, err);
            }
        }

        before = signatures[signatures.length - 1].signature;
    }

    console.log("Backfill completed");
}

async function handleStreamCreated(
    event: any,
    tx: any,
    signature: string
) {
    console.log("STREAM CREATED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: streamId, type: "CREATE_STREAM", raw: tx });

    console.log("Backfilled stream:", streamId);
}

async function handleTokensClaimed(
    event: any,
    tx: any,
    signature: string
) {
    console.log("TOKENS CLAIMED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: stream ? streamId : null, type: "WITHDRAW", raw: tx });

    console.log(`Backfilled withdrawal for stream ${streamId}: ${normalized.claimable.toString()} tokens`);
}

async function handleMilestoneUnlocked(
    event: any,
    tx: any,
    signature: string
) {
    console.log("MILESTONE UNLOCKED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: stream ? streamId : null, type: "MILESTONE_UNLOCKED", raw: tx });

    console.log(`Backfilled milestone unlock for stream ${streamId}: unlocked ${milestoneAmount.toString()} tokens`);
}

async function handleStreamCancelled(
    event: any,
    tx: any,
    signature: string
) {
    console.log("STREAM CANCELLED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: stream ? streamId : null, type: "CANCEL", raw: tx });

    console.log(`Backfilled cancel for stream ${streamId}: vested ${normalized.vestedAmount.toString()} tokens`);
}

async function handleMilestoneEdited(event: any, tx: any, signature: string) {
    console.log("MILESTONE EDITED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: stream ? streamId : null, type: "MILESTONE_EDITED", raw: tx });
}

async function handleLinearEdited(event: any, tx: any, signature: string) {
    console.log("LINEAR EDITED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: stream ? streamId : null, type: "LINEAR_EDITED", raw: tx });
}

async function handleCliffEdited(event: any, tx: any, signature: string) {
    console.log("CLIFF EDITED (BACKFILL):", event);

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

    await recordTransaction({ signature, slot: tx.slot, streamId: stream ? streamId : null, type: "CLIFF_EDITED", raw: tx });
}
