import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { connection } from "./rpc";
import prisma from "../db/prisma";
import { eventParser } from "./eventParser";

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
                const events = [];
                for (const event of eventParser.parseLogs(logs)) {
                    events.push(event);
                }

                // =========================
                // HANDLE EVENTS
                // =========================
                for (const event of events) {
                    if (event.name === "StreamCreated") {
                        await handleStreamCreated(event.data, tx, sigInfo.signature);
                    } else if (event.name === "TokensClaimed") {
                        await handleTokensClaimed(event.data, tx, sigInfo.signature);
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

    const streamId = event.stream.toString();

    await prisma.stream.upsert({
        where: { id: streamId },
        update: {},
        create: {
            id: streamId,
            creator: event.creator.toString(),
            recipient: event.recipient.toString(),
            mint: event.mint.toString(),
            vault: event.vault.toString(),
            totalAmount: BigInt(event.total_amount.toString()),
            withdrawn: BigInt(0),
            startTs: BigInt(event.start_ts.toString()),
            cliffTs: BigInt(event.cliff_ts.toString()),
            endTs: BigInt(event.end_ts.toString()),
            vestingType: Number(event.vesting_type),
            status: 1, // ACTIVE
            cancelable: Boolean(event.cancelable),
            milestoneCount: Number(event.milestone_count),
            nonce: BigInt(event.nonce.toString()),
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

    const streamId = event.stream.toString();
    const withdrawnTotal = BigInt(event.withdrawn_total.toString());

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

    console.log(`Backfilled withdrawal for stream ${streamId}: ${event.claimable.toString()} tokens`);
}