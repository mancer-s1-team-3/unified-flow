import * as anchor from "@coral-xyz/anchor";

import { PublicKey } from "@solana/web3.js";

import { coder } from "./decoder";

const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID!
);



export const eventParser =
    new anchor.EventParser(
        PROGRAM_ID,
        coder
    );

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
