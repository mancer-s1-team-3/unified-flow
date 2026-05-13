import {
    Connection,
    Keypair,
    PublicKey,
} from "@solana/web3.js";

import fs from "fs";

export const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
);

export function loadWallet(
    path: string
): Keypair {
    const secret = JSON.parse(
        fs.readFileSync(path, "utf-8")
    );

    return Keypair.fromSecretKey(
        Uint8Array.from(secret)
    );
}

export async function sleep(ms: number) {
    return new Promise((r) =>
        setTimeout(r, ms)
    );
}

export const PROGRAM_ID =
    new PublicKey(
        "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
    );