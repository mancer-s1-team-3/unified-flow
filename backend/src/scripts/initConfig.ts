import * as anchor from "@coral-xyz/anchor";

import {
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";

import idl from "../idl/unified_flow.json";

import {
    connection,
    loadWallet,
    PROGRAM_ID,
} from "./utils";

async function main() {
    // =========================
    // Wallet
    // =========================

    const admin = loadWallet(
        process.env.HOME +
        "/.config/solana/id.json"
    );

    console.log(
        "Admin:",
        admin.publicKey.toBase58()
    );

    // =========================
    // Provider
    // =========================

    const wallet =
        new anchor.Wallet(admin);

    const provider =
        new anchor.AnchorProvider(
            connection,
            wallet,
            {
                commitment: "confirmed",
            }
        );

    anchor.setProvider(provider);

    const program = new anchor.Program(
        idl as anchor.Idl,
        provider
    );

    // =========================
    // Config PDA
    // =========================

    const [configPda] =
        PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            PROGRAM_ID
        );

    console.log(
        "Config PDA:",
        configPda.toBase58()
    );

    // =========================
    // Initialize Config
    // =========================

    const tx = await program.methods
        .initializeConfig()
        .accounts({
            admin: admin.publicKey,

            config: configPda,

            systemProgram:
                SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

    console.log(
        "Initialize config tx:",
        tx
    );
}

main().catch(console.error);