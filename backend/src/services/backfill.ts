import { PublicKey } from "@solana/web3.js";
import { connection } from "./rpc";

const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID!
);

export async function backfill() {
    let before: string | undefined = undefined;

    while (true) {
        const signatures =
            await connection.getSignaturesForAddress(
                PROGRAM_ID,
                {
                    before,
                    limit: 1000,
                }
            );

        if (signatures.length === 0) break;

        for (const sig of signatures) {
            console.log(sig.signature);
        }

        before =
            signatures[
                signatures.length - 1
            ].signature;
    }
}
