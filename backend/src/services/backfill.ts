import dotenv from "dotenv";

import {
    PublicKey,
} from "@solana/web3.js";

import { connection } from "./rpc";

import prisma from "../db/prisma";

import { eventParser } from "./eventParser";

dotenv.config();

const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID!
);

export async function backfill() {
    console.log(
        "Starting backfill..."
    );

    let before:
        | string
        | undefined = undefined;

    while (true) {
        const signatures =
            await connection.getSignaturesForAddress(
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
                console.log(
                    "Backfill TX:",
                    sigInfo.signature
                );

                // =========================
                // SKIP EXISTING
                // =========================

                const existing =
                    await prisma.transaction.findUnique(
                        {
                            where: {
                                signature:
                                    sigInfo.signature,
                            },
                        }
                    );

                if (existing) {
                    continue;
                }

                // =========================
                // FETCH TX
                // =========================

                const tx =
                    await connection.getTransaction(
                        sigInfo.signature,
                        {
                            commitment:
                                "confirmed",

                            maxSupportedTransactionVersion: 0,
                        }
                    );

                if (!tx) {
                    continue;
                }

                const logs =
                    tx.meta?.logMessages || [];

                // =========================
                // PARSE EVENTS
                // =========================

                const events = [];

                for (const event of eventParser.parseLogs(
                    logs
                )) {
                    events.push(event);
                }

                // =========================
                // HANDLE EVENTS
                // =========================

                for (const event of events) {
                    if (
                        event.name ===
                        "StreamCreated"
                    ) {
                        await prisma.stream.upsert({
                            where: {
                                id: event.data.stream.toString(),
                            },

                            update: {},

                            create: {
                                id:
                                    event.data.stream.toString(),

                                creator:
                                    event.data.creator.toString(),

                                recipient:
                                    event.data.recipient.toString(),

                                mint:
                                    event.data.mint.toString(),

                                vault:
                                    event.data.vault.toString(),

                                totalAmount:
                                    BigInt(
                                        event.data.total_amount.toString()
                                    ),

                                withdrawn:
                                    BigInt(0),

                                startTs:
                                    BigInt(
                                        event.data.start_ts.toString()
                                    ),

                                cliffTs:
                                    BigInt(
                                        event.data.start_ts.toString()
                                    ),

                                endTs:
                                    BigInt(
                                        event.data.end_ts.toString()
                                    ),

                                vestingType: 0,

                                status: 1,

                                cancelable: true,

                                milestoneCount: 0,

                                nonce: BigInt(
                                    event.data.nonce.toString()
                                ),

                                bump: 0,
                            },
                        });

                        await prisma.transaction.create(
                            {
                                data: {
                                    id:
                                        sigInfo.signature,

                                    signature:
                                        sigInfo.signature,

                                    slot: BigInt(
                                        tx.slot
                                    ),

                                    streamId:
                                        event.data.stream.toString(),

                                    type:
                                        "CREATE_STREAM",

                                    raw: JSON.parse(
                                        JSON.stringify(tx)
                                    ),
                                },
                            }
                        );

                        console.log(
                            "Backfilled stream:",
                            event.data.stream.toString()
                        );
                    }
                }
            } catch (err) {
                console.error(err);
            }
        }

        before =
            signatures[
                signatures.length - 1
            ].signature;
    }

    console.log(
        "Backfill completed"
    );
}