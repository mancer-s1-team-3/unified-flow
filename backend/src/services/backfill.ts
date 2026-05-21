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
                // SKIP EXISTING
                // =========================
                const existing = await prisma.transaction.findUnique({
                    where: { signature: sigInfo.signature },
                });

                if (existing) {
                    continue;
                }

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

    console.log(`Backfilled milestone unlock for stream ${streamId}: unlocked ${milestoneAmount.toString()} tokens`);
}
