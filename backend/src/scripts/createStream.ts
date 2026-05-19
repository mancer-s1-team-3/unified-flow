import * as anchor from "@coral-xyz/anchor";

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createMint,
    getAssociatedTokenAddress,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from "@solana/spl-token";

import {
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";

import fs from "fs";

import { connection } from "../services/rpc";
import idl from "../../../target/idl/solana_program.json";

// =====================================================
// CONFIG
// =====================================================

const PROGRAM_ID = new PublicKey(
    "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

// =====================================================
// LOAD WALLET
// =====================================================

function loadWallet(path: string) {
    const secret = JSON.parse(
        fs.readFileSync(path, "utf-8")
    );

    return Keypair.fromSecretKey(
        Uint8Array.from(secret)
    );
}

// =====================================================
// MAIN
// =====================================================

async function main() {
    // =====================================================
    // WALLET
    // =====================================================

    const creator = loadWallet(
        process.env.HOME +
        "/.config/solana/id.json"
    );

    const recipient = Keypair.generate();

    console.log(
        "Creator:",
        creator.publicKey.toBase58()
    );

    console.log(
        "Recipient:",
        recipient.publicKey.toBase58()
    );

    // =====================================================
    // PROVIDER
    // =====================================================

    const wallet =
        new anchor.Wallet(creator);

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

    // =====================================================
    // CONFIG PDA
    // =====================================================

    const [configPda] =
        PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            PROGRAM_ID
        );

    console.log(
        "Config PDA:",
        configPda.toBase58()
    );

    // =====================================================
    // CREATE MINT
    // =====================================================

    const mint = await createMint(
        connection,
        creator,
        creator.publicKey,
        null,
        6
    );

    console.log(
        "Mint:",
        mint.toBase58()
    );

    // =====================================================
    // TOKEN ACCOUNTS
    // =====================================================

    const creatorAta =
        await getOrCreateAssociatedTokenAccount(
            connection,
            creator,
            mint,
            creator.publicKey
        );

    const recipientAta =
        await getOrCreateAssociatedTokenAccount(
            connection,
            creator,
            mint,
            recipient.publicKey
        );

    console.log(
        "Creator ATA:",
        creatorAta.address.toBase58()
    );

    console.log(
        "Recipient ATA:",
        recipientAta.address.toBase58()
    );

    // =====================================================
    // MINT TOKENS
    // =====================================================

    await mintTo(
        connection,
        creator,
        mint,
        creatorAta.address,
        creator,
        1_000_000_000
    );

    console.log("Minted tokens");

    // =====================================================
    // STREAM PDA
    // =====================================================

    const nonce = new anchor.BN(
        Date.now()
    );

    const [streamPda] =
        PublicKey.findProgramAddressSync(
            [
                Buffer.from("stream"),

                creator.publicKey.toBuffer(),

                recipient.publicKey.toBuffer(),

                nonce.toArrayLike(
                    Buffer,
                    "le",
                    8
                ),
            ],
            PROGRAM_ID
        );

    console.log(
        "Stream PDA:",
        streamPda.toBase58()
    );

    // =====================================================
    // VAULT PDA
    // =====================================================

    const vaultAta =
        await getAssociatedTokenAddress(
            mint,
            streamPda,
            true
        );

    console.log(
        "Vault ATA:",
        vaultAta.toBase58()
    );

    // =====================================================
    // STREAM PARAMS
    // =====================================================

    const now = Math.floor(
        Date.now() / 1000
    );

    const startTs =
        new anchor.BN(now);

    const endTs = new anchor.BN(
        now + 3600
    );

    const totalAmount =
        new anchor.BN(500_000_000);

    // =====================================================
    // DEBUG IDL
    // =====================================================

    const instruction =
        program.idl.instructions.find(
            (x) => x.name === "createStream"
        );

    console.log(
        "Instruction:",
        JSON.stringify(
            instruction,
            null,
            2
        )
    );

    // =====================================================
    // CREATE STREAM
    // =====================================================

    const tx = await program.methods
        .createStream(
            totalAmount,
            startTs,
            endTs,
            nonce
        )
        .accounts({
            creator: creator.publicKey,

            recipient:
                recipient.publicKey,

            config: configPda,

            stream: streamPda,

            vault: vaultAta,

            mint,

            creatorTokenAccount:
                creatorAta.address,

            recipientTokenAccount:
                recipientAta.address,

            tokenProgram:
                TOKEN_PROGRAM_ID,

            associatedTokenProgram:
                ASSOCIATED_TOKEN_PROGRAM_ID,

            rent: SYSVAR_RENT_PUBKEY,

            systemProgram:
                SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

    console.log(
        "Create stream tx:",
        tx
    );

    console.log(
        "Explorer:",
        `https://explorer.solana.com/tx/${tx}?cluster=devnet`
    );
}

main().catch((err) => {
    console.error(err);

    if ("logs" in err) {
        console.log(
            "Transaction Logs:"
        );

        console.log(err.logs);
    }
});
