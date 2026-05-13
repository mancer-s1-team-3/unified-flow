import dotenv from "dotenv";

import { PublicKey } from "@solana/web3.js";

import { connection } from "./rpc";

import prisma from "../db/prisma";

import { eventParser } from "./eventParser";

dotenv.config();

const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID!
);

export async function startIndexer() {
    console.log("Starting indexer...");

    connection.onLogs(
        PROGRAM_ID,

        async (logInfo) => {
            try {
                console.log(
                    "TX:",
                    logInfo.signature
                );

                // =========================
                // GET TX
                // =========================

                const tx =
                    await connection.getTransaction(
                        logInfo.signature,
                        {
                            commitment: "confirmed",
                            maxSupportedTransactionVersion: 0,
                        }
                    );

                if (!tx) return;

                const logs =
                    tx.meta?.logMessages || [];

                // =========================
                // DEBUG LOGS
                // =========================

                console.log(logs);

                // =========================
                // PARSE EVENTS
                // =========================

                const events = [];

                for (const event of eventParser.parseLogs(
                    logs
                )) {
                    events.push(event);
                }

                console.log(
                    "EVENTS:",
                    events
                );

                // =========================
                // HANDLE EVENTS
                // =========================

                for (const event of events) {
                    console.log(
                        "EVENT:",
                        event.name
                    );

                    if (
                        event.name ===
                        "StreamCreated"
                    ) {
                        await handleStreamCreated(
                            event.data,
                            tx,
                            logInfo.signature
                        );
                    }
                }
            } catch (err) {
                console.error(err);
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
    console.log(
        "STREAM CREATED:",
        event
    );

    await prisma.stream.upsert({
        where: {
            id: event.stream.toString(),
        },

        update: {},

        create: {
            id: event.stream.toString(),

            creator:
                event.creator.toString(),

            recipient:
                event.recipient.toString(),

            mint:
                event.mint.toString(),

            vault:
                event.vault.toString(),

            totalAmount: BigInt(
                event.total_amount.toString()
            ),

            withdrawn: BigInt(0),

            startTs: BigInt(
                event.start_ts.toString()
            ),

            cliffTs: BigInt(
                event.start_ts.toString()
            ),

            endTs: BigInt(
                event.end_ts.toString()
            ),

            vestingType: 0,

            status: 1,

            cancelable: true,

            milestoneCount: 0,

            nonce: BigInt(
                event.nonce.toString()
            ),

            bump: 0,
        }
    });

    await prisma.transaction.upsert({
        where: {
            signature,
        },

        update: {},

        create: {
            id: signature,

            signature,

            slot: BigInt(tx.slot),

            streamId:
                event.stream.toString(),

            type: "CREATE_STREAM",

            raw: tx,
        },
    });

    console.log(
        "Indexed stream:",
        event.stream.toString()
    );
}