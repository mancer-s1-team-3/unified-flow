import * as anchor from "@coral-xyz/anchor";

import { PublicKey } from "@solana/web3.js";

import { coder } from "./decoder";

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);

const legacyIdl = {
    version: "0.1.0",
    name: "solana_program",
    instructions: [],
    accounts: [],
    types: [
        {
            name: "StreamCreated",
            type: {
                kind: "struct",
                fields: [
                    { name: "stream", type: "pubkey" },
                    { name: "creator", type: "pubkey" },
                    { name: "recipient", type: "pubkey" },
                    { name: "mint", type: "pubkey" },
                    { name: "vault", type: "pubkey" },
                    { name: "total_amount", type: "u64" },
                    { name: "start_ts", type: "i64" },
                    { name: "end_ts", type: "i64" },
                    { name: "nonce", type: "u64" },
                    { name: "created_at", type: "i64" },
                ],
            },
        },
        {
            name: "TokensClaimed",
            type: {
                kind: "struct",
                fields: [
                    { name: "stream", type: "pubkey" },
                    { name: "recipient", type: "pubkey" },
                    { name: "mint", type: "pubkey" },
                    { name: "claimable", type: "u64" },
                    { name: "fee_lamports", type: "u64" },
                    { name: "withdrawn_total", type: "u64" },
                    { name: "timestamp", type: "i64" },
                ],
            },
        },
    ],
    events: [
        {
            name: "StreamCreated",
            discriminator: [93, 150, 91, 15, 166, 8, 251, 166],
        },
        {
            name: "TokensClaimed",
            discriminator: [25, 128, 244, 55, 241, 136, 200, 91],
        },
    ],
    errors: [],
} as unknown as anchor.Idl;

const legacyCoder = new anchor.BorshCoder(legacyIdl);

function decodeEvent(logStr: string) {
    const decoders = [coder.events, legacyCoder.events];

    for (const eventCoder of decoders) {
        try {
            const event = eventCoder.decode(logStr);
            if (event) {
                return event;
            }
        } catch {
            // Fall through to the next layout. Older transactions can emit
            // events that no longer match the current IDL exactly.
        }
    }

    return null;
}

const safeCoder = {
    events: {
        decode: decodeEvent,
    },
} as unknown as anchor.Coder;

export const eventParser = new anchor.EventParser(PROGRAM_ID, safeCoder);

export function parseEventsSafely(logs: string[]) {
    const events: Array<{ name: string; data: any }> = [];

    try {
        for (const event of eventParser.parseLogs(logs)) {
            events.push(event);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("Skipping unparsable program logs:", message);
    }

    return events;
}
