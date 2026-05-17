import dotenv from "dotenv";
import path from "path";

// Load dotenv immediately
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

import { Connection, PublicKey } from "@solana/web3.js";
import { eventParser } from "../services/eventParser";

const RPC_HTTP = process.env.RPC_HTTP || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID || "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

async function main() {
    console.log("--- PARSING ALL DEVNET TRANSACTIONS FOR EVENTS ---");
    const connection = new Connection(RPC_HTTP, "confirmed");
    const signatures = await connection.getSignaturesForAddress(PROGRAM_ID);
    
    console.log(`Total transactions fetched: ${signatures.length}`);
    
    let parsedCreatedCount = 0;
    let parsedClaimedCount = 0;
    let parsedOtherCount = 0;

    for (let i = 0; i < signatures.length; i++) {
        const sigInfo = signatures[i];
        if (sigInfo.err) {
            // Skip failed transactions
            continue;
        }

        try {
            const tx = await connection.getTransaction(sigInfo.signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });

            if (!tx) continue;

            const logs = tx.meta?.logMessages || [];
            const parsedEvents = Array.from(eventParser.parseLogs(logs));
            
            if (parsedEvents.length > 0) {
                console.log(`\n[Tx #${i}] Sig: ${sigInfo.signature} | Slot: ${sigInfo.slot}`);
                parsedEvents.forEach((ev) => {
                    console.log(`  -> Event Parsed: ${ev.name} (Data keys: ${Object.keys(ev.data).join(", ")})`);
                    if (ev.name === "StreamCreated") {
                        parsedCreatedCount++;
                        console.log(`     Stream ID: ${ev.data.stream.toString()} | Recipient: ${ev.data.recipient.toString()}`);
                    } else if (ev.name === "TokensClaimed") {
                        parsedClaimedCount++;
                    } else {
                        parsedOtherCount++;
                    }
                });
            }
        } catch (err: any) {
            console.error(`Error parsing sig ${sigInfo.signature}:`, err.message || err);
        }
    }

    console.log("\n--- PARSE SUMMARY ---");
    console.log(`Successful StreamCreated parsed: ${parsedCreatedCount}`);
    console.log(`Successful TokensClaimed parsed: ${parsedClaimedCount}`);
    console.log(`Other events parsed:             ${parsedOtherCount}`);
}

main()
    .catch((err) => console.error(err))
    .finally(() => process.exit(0));
