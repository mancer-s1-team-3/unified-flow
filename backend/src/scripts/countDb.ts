import dotenv from "dotenv";
import path from "path";

// Load dotenv
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

import prisma from "../db/prisma";

async function main() {
    console.log("--- DIRECT DATABASE COUNT ---");
    const dbStreams = await prisma.stream.findMany();
    const dbTransactions = await prisma.transaction.findMany();

    console.log(`\nDB STREAMS COUNT: ${dbStreams.length}`);
    dbStreams.forEach((s) => {
        console.log(`  - Stream ID: ${s.id} | Creator: ${s.creator.slice(0, 8)}... | Recipient: ${s.recipient.slice(0, 8)}... | totalAmount: ${s.totalAmount.toString()} | vestingType: ${s.vestingType}`);
    });

    console.log(`\nDB TRANSACTIONS COUNT: ${dbTransactions.length}`);
    dbTransactions.forEach((t) => {
        console.log(`  - Tx Sig: ${t.signature.slice(0, 16)}... | Type: ${t.type} | Stream ID: ${t.streamId}`);
    });
}

main()
    .catch((err) => console.error(err))
    .finally(() => process.exit(0));
