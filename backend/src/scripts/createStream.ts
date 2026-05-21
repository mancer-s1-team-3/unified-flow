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
import idl from "../idl/solana_program.json";

// =====================================================
// CONFIG
// =====================================================

const PROGRAM_ID = new PublicKey(
    "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

const DEFAULT_AMOUNT = new anchor.BN(500_000_000);
const DEFAULT_LINEAR_DURATION = 3600;
const DEFAULT_CLIFF_DELAY = 900;
const DEFAULT_CLIFF_DURATION = 3600;
const DEFAULT_MILESTONE_DURATION = 7200;

type StreamMode = "linear" | "cliff" | "milestone";

type StreamConfig = {
    vestingType: number;
    amount: anchor.BN;
    startTs: anchor.BN;
    cliffTs: anchor.BN;
    endTs: anchor.BN;
    milestoneInputs: { amount: anchor.BN }[];
};

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

function parseMode(raw: string | undefined): StreamMode {
    const value = (raw || "linear").toLowerCase();

    if (value === "0") return "linear";
    if (value === "1") return "cliff";
    if (value === "2") return "milestone";
    if (value === "linear" || value === "cliff" || value === "milestone") return value;

    throw new Error(`Unknown mode "${raw}". Use linear, cliff, milestone, 0, 1, or 2.`);
}

function parseAmount(value: string | undefined, fallback: anchor.BN): anchor.BN {
    return new anchor.BN(value ?? fallback.toString());
}

function parseMilestones(csv: string | undefined): anchor.BN[] {
    const raw = csv || "150000000,150000000,200000000";
    const parts = raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    if (parts.length === 0) {
        throw new Error("Milestone stream requires at least one milestone amount.");
    }

    return parts.map((value) => new anchor.BN(value));
}

function sumAmounts(values: anchor.BN[]): anchor.BN {
    return values.reduce((sum, value) => sum.add(value), new anchor.BN(0));
}

function buildStreamConfig(mode: StreamMode, args: string[]): StreamConfig {
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 10);

    if (mode === "linear") {
        const durationSecs = Number(args[0] || DEFAULT_LINEAR_DURATION);
        const amount = parseAmount(args[1], DEFAULT_AMOUNT);
        const endTs = new anchor.BN(startTs.toNumber() + durationSecs);

        return {
            vestingType: 0,
            amount,
            startTs,
            cliffTs: startTs,
            endTs,
            milestoneInputs: [],
        };
    }

    if (mode === "cliff") {
        const cliffDelaySecs = Number(args[0] || DEFAULT_CLIFF_DELAY);
        const durationSecs = Number(args[1] || DEFAULT_CLIFF_DURATION);
        const amount = parseAmount(args[2], DEFAULT_AMOUNT);

        const endTs = new anchor.BN(startTs.toNumber() + durationSecs);
        const cliffTs = new anchor.BN(startTs.toNumber() + cliffDelaySecs);

        return {
            vestingType: 1,
            amount,
            startTs,
            cliffTs,
            endTs,
            milestoneInputs: [],
        };
    }

    const milestoneAmounts = parseMilestones(args[0]);
    const amount = args[1]
        ? new anchor.BN(args[1])
        : sumAmounts(milestoneAmounts);
    const totalMilestoneAmount = sumAmounts(milestoneAmounts);

    if (!amount.eq(totalMilestoneAmount)) {
        throw new Error(
            `Milestone total ${totalMilestoneAmount.toString()} must equal stream amount ${amount.toString()}.`
        );
    }

    return {
        vestingType: 2,
        amount,
        startTs,
        cliffTs: startTs,
        endTs: new anchor.BN(startTs.toNumber() + DEFAULT_MILESTONE_DURATION),
        milestoneInputs: milestoneAmounts.map((milestoneAmount) => ({
            amount: milestoneAmount,
        })),
    };
}

// =====================================================
// MAIN
// =====================================================

async function main() {
    const [modeArg, ...args] = process.argv.slice(2);
    const mode = parseMode(modeArg);

    // =====================================================
    // WALLET
    // =====================================================

    const creator = loadWallet(
        process.env.HOME +
        "/.config/solana/id.json"
    );

    const recipient = Keypair.generate();

    const nonce = new anchor.BN(Date.now());

    console.log("Mode:", mode);
    console.log("Nonce:", nonce.toString());
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

    const streamConfig = buildStreamConfig(mode, args);

    await mintTo(
        connection,
        creator,
        mint,
        creatorAta.address,
        creator,
        Number(streamConfig.amount.toString())
    );

    console.log("Minted tokens:", streamConfig.amount.toString());

    // =====================================================
    // STREAM PDA
    // =====================================================

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

    console.log("Stream config:", {
        vestingType: streamConfig.vestingType,
        amount: streamConfig.amount.toString(),
        startTs: streamConfig.startTs.toString(),
        cliffTs: streamConfig.cliffTs.toString(),
        endTs: streamConfig.endTs.toString(),
        milestoneInputs: streamConfig.milestoneInputs.map((m) => m.amount.toString()),
    });

    const remainingAccounts =
            streamConfig.vestingType === 2
            ? streamConfig.milestoneInputs.map((_, index) => {
                const [milestonePda] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("milestone"),
                        streamPda.toBuffer(),
                        Buffer.from([index]),
                    ],
                    PROGRAM_ID
                );

                return {
                    pubkey: milestonePda,
                    isWritable: true,
                    isSigner: false,
                };
            })
            : [];

    // =====================================================
    // CREATE STREAM
    // =====================================================

    const tx = await program.methods
        .createStream(
            streamConfig.amount,
            streamConfig.startTs,
            streamConfig.cliffTs,
            streamConfig.endTs,
            streamConfig.vestingType,
            streamConfig.milestoneInputs,
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

            tokenProgram:
                TOKEN_PROGRAM_ID,

            associatedTokenProgram:
                ASSOCIATED_TOKEN_PROGRAM_ID,

            systemProgram:
                SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
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

    if (err instanceof Error) {
        console.error(err.message);
    }

    if ("logs" in (err as any)) {
        console.log(
            "Transaction Logs:"
        );

        console.log((err as any).logs);
    }

    process.exit(1);
});
