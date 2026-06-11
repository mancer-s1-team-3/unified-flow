import * as anchor from "@coral-xyz/anchor";
import {
    Keypair,
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import { connection } from "./services/rpc";
import idl from "./idl/unified_flow.json";

dotenv.config();

// ============================================================================
// COLORS & FORMATTING FOR GORGEOUS TERMINAL
// ============================================================================
const C_RESET = "\x1b[0m";
const C_GREEN = "\x1b[32m";
const C_BLUE = "\x1b[34m";
const C_CYAN = "\x1b[36m";
const C_YELLOW = "\x1b[33m";
const C_RED = "\x1b[31m";
const C_MAGENTA = "\x1b[35m";
const C_BOLD = "\x1b[1m";
const packageJson = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, "../package.json"),
        "utf-8"
    )
);

const CLI_VERSION = packageJson.version;
function logSuccess(msg: string) { console.log(`${C_GREEN}${C_BOLD}✔ Success:${C_RESET} ${msg}`); }
function logInfo(msg: string) { console.log(`${C_BLUE}${C_BOLD}ℹ Info:${C_RESET} ${msg}`); }
function logWarn(msg: string) { console.log(`${C_YELLOW}${C_BOLD}⚠ Warning:${C_RESET} ${msg}`); }
function logError(msg: string) { console.log(`${C_RED}${C_BOLD}✘ Error:${C_RESET} ${msg}`); }

// ============================================================================
// SYSTEM & WALLET BOOT
// ============================================================================
const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID || "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

function loadWallet(filePath: string): Keypair {
    const resolvedPath = path.resolve(filePath.replace(/^~/, process.env.HOME || ""));
    const secret = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
}


export function loadCsv(filePath: string) {
    const raw = fs.readFileSync(filePath, "utf8");

    const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    const headers = lines[0].split(",");

    return lines.slice(1).map((line) => {
        const values = line.split(",");

        return headers.reduce((obj: any, header, idx) => {
            obj[header.trim()] = values[idx]?.trim();
            return obj;
        }, {});
    });
}
async function createStreamFromRow(row: any) {
    const signer = getSigner();
    const program = getAnchorProgram(signer);
    const programAccount: any = program.account;

    const recipientPubkey = new PublicKey(row.recipient.trim());
    const mintPubkey = new PublicKey(row.mint.trim());
    const typeNum = parseInt(row.type, 10);
    const amountBN = new anchor.BN(row.amount.trim());
    const finalNonce = new anchor.BN(Date.now());

    const startTs = Math.floor(Date.now() / 1000) + 10;
    let cliffTs = startTs;
    let endTs: number;
    let milestonesInputs: { amount: anchor.BN }[] = [];

    if (typeNum === 0 || typeNum === 1) {
        const duration = parseInt(row.duration, 10);
        if (isNaN(duration) || duration <= 0) {
            throw new Error(`Row for recipient ${row.recipient}: invalid duration.`);
        }
        endTs = startTs + duration;
        if (typeNum === 1) {
            const cliffDuration = parseInt(row.cliffDuration ?? row.cliff_duration ?? "0", 10);
            cliffTs = startTs + (cliffDuration > 0 ? cliffDuration : duration);
        }
    } else if (typeNum === 2) {
        const parts = (row.milestones as string).split(";").map((p) => p.trim());
        milestonesInputs = parts.map((p) => ({ amount: new anchor.BN(p) }));
        const total = milestonesInputs.reduce((sum, m) => sum.add(m.amount), new anchor.BN(0));
        if (!total.eq(amountBN)) {
            throw new Error(`Row for recipient ${row.recipient}: milestone sum ${total} != amount ${amountBN}`);
        }
        endTs = startTs + 60; // placeholder; milestone streams don't use endTs for vesting logic
    } else {
        throw new Error(`Row for recipient ${row.recipient}: invalid type ${typeNum}.`);
    }

    const [streamPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("stream"),
            signer.publicKey.toBuffer(),
            recipientPubkey.toBuffer(),
            finalNonce.toArrayLike(Buffer, "le", 8),
        ],
        PROGRAM_ID
    );
    const vaultAta = await getAssociatedTokenAddress(mintPubkey, streamPda, true);
    const creatorTokenAccount = await getAssociatedTokenAddress(mintPubkey, signer.publicKey, true);
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

    const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];
    if (typeNum === 2) {
        for (let i = 0; i < milestonesInputs.length; i++) {
            const [milestonePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("milestone"), streamPda.toBuffer(), Buffer.from([i])],
                PROGRAM_ID
            );
            remainingAccounts.push({ pubkey: milestonePda, isWritable: true, isSigner: false });
        }
    }

    logInfo(`Creating stream for recipient ${row.recipient}...`);
    const tx = await program.methods
        .createStream(
            amountBN,
            new anchor.BN(startTs),
            new anchor.BN(cliffTs),
            new anchor.BN(endTs),
            typeNum,
            milestonesInputs,
            finalNonce
        )
        .accounts({
            creator: signer.publicKey,
            recipient: recipientPubkey,
            mint: mintPubkey,
            config: configPda,
            stream: streamPda,
            vault: vaultAta,
            creatorTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .signers([signer])
        .rpc();

    logSuccess(`Stream created for ${row.recipient}: ${streamPda.toBase58()}`);
    logInfo(`Tx: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}

async function editBatchStream(row: any) {
    const signer = getSigner();
    const program = getAnchorProgram(signer);
    const programAccount: any = program.account;

    const streamPubkey = new PublicKey((row.id as string).trim());
    const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);
    const vestingType: number = streamState.vestingType;

    const durationRaw = String(row.duration ?? "").trim();
    const cliffRaw = String(row.cliffDuration ?? row.cliff_duration ?? "").trim();
    const amountRaw = String(row.amount ?? "").trim();
    const milestonesRaw = String(row.milestones ?? "").trim();

    const hasDuration = durationRaw !== "" && durationRaw !== "0";
    const hasCliff = cliffRaw !== "" && cliffRaw !== "0";
    const hasAmount = amountRaw !== "" && amountRaw !== "0";
    const hasMilestones = milestonesRaw !== "";

    if (vestingType === 0) {
        // Linear: extend duration and/or topup
        if (!hasDuration && !hasAmount) {
            logWarn(`Skipping linear stream ${row.id}: no duration or amount change.`);
            return;
        }

        const startTs = new anchor.BN(String(streamState.startTs));
        const currentEndTs = new anchor.BN(String(streamState.endTs));
        const currentTotal = new anchor.BN(String(streamState.totalAmount));

        const newEndTs = hasDuration
            ? startTs.add(new anchor.BN(durationRaw))
            : currentEndTs;
        const targetTotal = hasAmount ? new anchor.BN(amountRaw) : currentTotal;
        const topupAmount = targetTotal.gt(currentTotal)
            ? targetTotal.sub(currentTotal)
            : new anchor.BN(0);

        const mint = streamState.mint;
        const vault = streamState.vault;
        const creatorTokenAccount = await getAssociatedTokenAddress(mint, signer.publicKey, true);
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

        logInfo(`Editing linear stream ${row.id}...`);
        const tx = await program.methods
            .editLinear(newEndTs, topupAmount)
            .accounts({
                creator: signer.publicKey,
                mint,
                config: configPda,
                stream: streamPubkey,
                vault,
                creatorTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([signer])
            .rpc();

        logSuccess(`Linear stream ${row.id} updated.`);
        logInfo(`Tx: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    } else if (vestingType === 1) {
        // Cliff: update cliff duration
        if (!hasCliff) {
            logWarn(`Skipping cliff stream ${row.id}: no cliffDuration provided.`);
            return;
        }

        const startTs = new anchor.BN(String(streamState.startTs));
        const newCliffTs = startTs.add(new anchor.BN(cliffRaw));
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

        logInfo(`Editing cliff stream ${row.id}...`);
        const tx = await program.methods
            .editCliff(newCliffTs)
            .accounts({
                creator: signer.publicKey,
                config: configPda,
                stream: streamPubkey,
            })
            .signers([signer])
            .rpc();

        logSuccess(`Cliff stream ${row.id} updated.`);
        logInfo(`Tx: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    } else if (vestingType === 2) {
        // Milestone: update each milestone amount
        if (!hasMilestones) {
            logWarn(`Skipping milestone stream ${row.id}: no milestones provided.`);
            return;
        }

        const amounts = milestonesRaw.split(";").map((v) => v.trim()).filter(Boolean);

        for (let index = 0; index < amounts.length; index++) {
            const [milestonePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("milestone"), streamPubkey.toBuffer(), Buffer.from([index])],
                PROGRAM_ID
            );
            const mint = streamState.mint;
            const vault = streamState.vault;
            const creatorTokenAccount = await getAssociatedTokenAddress(mint, signer.publicKey, true);

            logInfo(`Editing milestone #${index} on stream ${row.id}...`);
            const tx = await program.methods
                .editMilestone(new anchor.BN(amounts[index]))
                .accounts({
                    creator: signer.publicKey,
                    stream: streamPubkey,
                    milestone: milestonePda,
                    mint,
                    vault,
                    creatorTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([signer])
                .rpc();

            logSuccess(`Milestone #${index} on stream ${row.id} updated.`);
            logInfo(`Tx: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        }
    } else {
        logWarn(`Skipping stream ${row.id}: unknown vesting type ${vestingType}.`);
    }
}
function getSigner(): Keypair {
    const defaultPath = process.env.WALLET_PATH || path.join(process.env.HOME || "", ".config/solana/id.json");
    try {
        return loadWallet(defaultPath);
    } catch (e) {
        logError(`Failed to load default wallet from ${defaultPath}: ${e}`);
        logInfo("Please configure WALLET_PATH in your .env or run: solana-keygen new");
        process.exit(1);
    }
}

function getAnchorProgram(signer: Keypair) {
    const wallet = new anchor.Wallet(signer);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    return new anchor.Program(idl as anchor.Idl, provider);
}

// ============================================================================
// CLI ROUTER & COMMANDS
// ============================================================================
function printHelp() {
    console.log(`
${C_CYAN}${C_BOLD}🌌 Solana Vesting & Distribution CLI Command Manual${C_RESET}
Usage: npm run cli <command> [args...]

${C_BOLD}READ COMMANDS:${C_RESET}
  ${C_GREEN}view <streamAddress>${C_RESET}              Fetch & print real-time on-chain stream & milestone details.
  ${C_GREEN}config${C_RESET}                            Print global protocol config (fees, admin, paused state).

${C_BOLD}WRITE TRANSACTION COMMANDS:${C_RESET}

  ${C_GREEN}create <recipient> <mint> <amount> <type> [duration|milestones]${C_RESET}
                                            Create a vesting stream.

  ${C_GREEN}create-batch <csvPath>${C_RESET}
                                            Create multiple streams from CSV file.

  ${C_GREEN}withdraw <streamAddress>${C_RESET}
                                            Withdraw claimable tokens.

  ${C_GREEN}cancel <streamAddress>${C_RESET}
                                            Cancel active stream.

  ${C_GREEN}unlock <streamAddress>${C_RESET}
                                            Unlock next milestone.

  ${C_GREEN}edit-milestone <stream> <idx> <amt>${C_RESET}
                                            Edit locked milestone allocation.

  ${C_GREEN}edit-linear <stream> [--duration] [--topup]${C_RESET}
                                            Extend duration and/or topup a linear stream.

  ${C_GREEN}edit-cliff <stream> <newCliffTs>${C_RESET}
                                            Edit cliff timestamp.

  ${C_GREEN}edit-batch <csvPath>${C_RESET}
                                            Bulk edit streams from CSV file.

${C_BOLD}UTILITY COMMANDS:${C_RESET}
  ${C_GREEN}version${C_RESET}                           Print CLI version information.
  ${C_GREEN}-v${C_RESET}                                Print CLI version information.
  ${C_GREEN}--version${C_RESET}                         Print CLI version information.
`);
}
export async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        printHelp();
        process.exit(0);
    }

    const command = args[0];
    const signer = getSigner();
    const program = getAnchorProgram(signer);
    const programAccount: any = program.account;

    try {
        switch (command) {
            case "config": {
                logInfo("Fetching global protocol config...");
                const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
                const config: any = await programAccount.configAccount.fetch(configPda);

                console.log(`
${C_BLUE}${C_BOLD}📋 Global Protocol Settings:${C_RESET}
  - Config PDA Address:   ${configPda.toBase58()}
  - Admin Authority:      ${config.adminAuthority.toBase58()}
  - Fee Authority:        ${config.feeAuthority.toBase58()}
  - Status:               ${config.paused ? `${C_RED}PAUSED${C_RESET}` : `${C_GREEN}ACTIVE/RUNNING${C_RESET}`}
  - Withdrawal Fee:       ${config.withdrawFeeBps / 100}% (${config.withdrawFeeBps} bps)
  - Max Permitted Fee:    ${config.maxWithdrawFeeBps / 100}% (${config.maxWithdrawFeeBps} bps)
  - Timelock Delay:       ${config.feeChangeTimelockSeconds.toString()} seconds
  - Allowed Mints:        ${config.allowedMints.length === 0 ? "Any SPL Token" : config.allowedMints.map((m: any) => m.toBase58()).join(", ")}
`);
                break;
            }

            case "view": {
                if (args.length < 2) {
                    logError("Missing stream address. Usage: npm run cli view <streamAddress>");
                    process.exit(1);
                }
                const streamAddress = args[1];
                const streamPubkey = new PublicKey(streamAddress);

                logInfo(`Fetching on-chain details for stream ${streamAddress}...`);
                const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

                const typeNames = ["Linear Vesting", "Cliff Vesting", "Milestone Vesting"];
                const statusNames = ["Unknown", "Active", "Completed", "Cancelled"];

                console.log(`
${C_BLUE}${C_BOLD}🌊 Vesting Stream Details:${C_RESET}
  - Address:              ${streamAddress}
  - Creator:              ${streamState.creator.toBase58()}
  - Recipient:            ${streamState.recipient.toBase58()}
  - Token Mint:           ${streamState.mint.toBase58()}
  - Vault Token ATA:      ${streamState.vault.toBase58()}
  - Total Allocation:     ${streamState.totalAmount.toString()} tokens
  - Claimed/Withdrawn:    ${streamState.withdrawn.toString()} tokens
  - Vesting Schedule:     ${C_MAGENTA}${C_BOLD}${typeNames[streamState.vestingType] || "Custom"}${C_RESET}
  - Status:               ${streamState.status === 1 ? C_GREEN : streamState.status === 2 ? C_BLUE : C_RED}${C_BOLD}${statusNames[streamState.status] || "Unknown"}${C_RESET}
  - Start Time:           ${new Date(streamState.startTs.toNumber() * 1000).toLocaleString()}
  - Cliff Time:           ${new Date(streamState.cliffTs.toNumber() * 1000).toLocaleString()}
  - End Time:             ${new Date(streamState.endTs.toNumber() * 1000).toLocaleString()}
  - Cancelable:           ${streamState.cancelable ? "Yes" : "No"}
  - Nonce Identifier:     ${streamState.nonce.toString()}
`);

                if (streamState.vestingType === 2) {
                    console.log(`  ${C_BOLD}Milestones status (${streamState.nextMilestoneIndex}/${streamState.milestoneCount} unlocked):${C_RESET}`);
                    for (let i = 0; i < streamState.milestoneCount; i++) {
                        const [milestonePda] = PublicKey.findProgramAddressSync(
                            [Buffer.from("milestone"), streamPubkey.toBuffer(), Buffer.from([i])],
                            PROGRAM_ID
                        );
                        try {
                            const milestoneState: any = await programAccount.milestoneAccount.fetch(milestonePda);
                            console.log(`    [Milestone #${i}] ${milestoneState.amount.toString()} tokens - ${milestoneState.unlocked ? `${C_GREEN}UNLOCKED${C_RESET}` : `${C_YELLOW}LOCKED (Pending Creator Approval)${C_RESET}`} (Address: ${milestonePda.toBase58()})`);
                        } catch (err) {
                            console.log(`    [Milestone #${i}] Address: ${milestonePda.toBase58()} - Fetch failed: ${err}`);
                        }
                    }
                }
                break;
            }

            case "init": {
                logInfo("Submitting initialize config transaction...");
                const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

                const tx = await program.methods
                    .initializeConfig()
                    .accounts({
                        admin: signer.publicKey,
                        config: configPda,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([signer])
                    .rpc();

                logSuccess(`Protocol configured. PDA address: ${configPda.toBase58()}`);
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }

            case "create": {
                if (args.length < 6) {
                    logError("Missing arguments. Usage:\n" +
                        "  Linear/Cliff: npm run cli create <recipient> <mint> <amount> <type: 0|1> <durationSecs>\n" +
                        "  Milestone:    npm run cli create <recipient> <mint> <amount> <type: 2> <milestones: 100,200,300>");
                    process.exit(1);
                }

                const recipientStr = args[1];
                const mintStr = args[2];
                const amountStr = args[3];
                const typeNum = parseInt(args[4], 10);

                const recipientPubkey = new PublicKey(recipientStr);
                const mintPubkey = new PublicKey(mintStr);
                const amountBN = new anchor.BN(amountStr);
                const finalNonce = new anchor.BN(Date.now());

                let startTs = Math.floor(Date.now() / 1000) + 10; // start 10s in future
                let cliffTs = startTs;
                let endTs = startTs + 60; // fallback duration 60s
                let milestonesInputs: { amount: anchor.BN }[] = [];

                if (typeNum === 0 || typeNum === 1) {
                    const duration = parseInt(args[5], 10);
                    if (isNaN(duration) || duration <= 0) {
                        throw new Error("Invalid duration. Must be a positive integer in seconds.");
                    }
                    endTs = startTs + duration;
                    if (typeNum === 1) {
                        cliffTs = endTs; // cliff unlocks at end
                    }
                } else if (typeNum === 2) {
                    const parts = args[5].split(",");
                    milestonesInputs = parts.map(p => ({ amount: new anchor.BN(p) }));
                    const totalMilestonesSum = milestonesInputs.reduce((sum, m) => sum.add(m.amount), new anchor.BN(0));
                    if (!totalMilestonesSum.eq(amountBN)) {
                        throw new Error(`Milestone sum (${totalMilestonesSum.toString()}) does not equal total amount (${amountStr})`);
                    }
                } else {
                    throw new Error("Invalid vesting type. Must be 0 (Linear), 1 (Cliff), or 2 (Milestone).");
                }

                const [streamPda] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("stream"),
                        signer.publicKey.toBuffer(),
                        recipientPubkey.toBuffer(),
                        new anchor.BN(endTs).toArrayLike(Buffer, "le", 8),
                    ],
                    PROGRAM_ID
                );
                const vaultAta = await getAssociatedTokenAddress(mintPubkey, streamPda, true);
                const creatorTokenAccount = await getAssociatedTokenAddress(mintPubkey, signer.publicKey, true);
                const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

                const remainingAccounts = [];
                if (typeNum === 2) {
                    for (let i = 0; i < milestonesInputs.length; i++) {
                        const [milestonePda] = PublicKey.findProgramAddressSync(
                            [Buffer.from("milestone"), streamPda.toBuffer(), Buffer.from([i])],
                            PROGRAM_ID
                        );
                        remainingAccounts.push({ pubkey: milestonePda, isWritable: true, isSigner: false });
                    }
                }

                logInfo("Creating stream on-chain...");
                const tx = await program.methods
                    .createStream(
                        amountBN,
                        new anchor.BN(startTs),
                        new anchor.BN(cliffTs),
                        new anchor.BN(endTs),
                        typeNum,
                        milestonesInputs,
                        finalNonce
                    )
                    .accounts({
                        creator: signer.publicKey,
                        recipient: recipientPubkey,
                        mint: mintPubkey,
                        config: configPda,
                        stream: streamPda,
                        vault: vaultAta,
                        creatorTokenAccount: creatorTokenAccount,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .remainingAccounts(remainingAccounts)
                    .signers([signer])
                    .rpc();

                logSuccess(`Vesting Stream created successfully!`);
                console.log(`  - Stream address:  ${streamPda.toBase58()}`);
                console.log(`  - Vault address:   ${vaultAta.toBase58()}`);
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }

            case "withdraw": {
                if (args.length < 2) {
                    logError("Missing stream address. Usage: npm run cli withdraw <streamAddress>");
                    process.exit(1);
                }
                const streamPubkey = new PublicKey(args[1]);
                const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

                const mint = streamState.mint;
                const vault = streamState.vault;
                const recipientAta = await getAssociatedTokenAddress(mint, signer.publicKey, true);

                const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
                const feeReceiver = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], PROGRAM_ID)[0];

                const chainlinkFeed = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

                logInfo("Submitting claim/withdrawal transaction...");
                const tx = await program.methods
                    .withdraw()
                    .accounts({
                        recipient: signer.publicKey,
                        mint: mint,
                        config: configPda,
                        stream: streamPubkey,
                        vault: vault,
                        recipientAta: recipientAta,
                        feeReceiver: feeReceiver,
                        chainlinkFeed: chainlinkFeed,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any)
                    .signers([signer])
                    .rpc();

                logSuccess("Tokens withdrawn successfully!");
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }

            case "cancel": {
                if (args.length < 2) {
                    logError("Missing stream address. Usage: npm run cli cancel <streamAddress>");
                    process.exit(1);
                }
                const streamPubkey = new PublicKey(args[1]);
                const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

                const mint = streamState.mint;
                const vault = streamState.vault;
                const creatorTokenAccount = await getAssociatedTokenAddress(mint, signer.publicKey, true);
                const recipientTokenAccount = await getAssociatedTokenAddress(mint, streamState.recipient, true);

                logInfo("Cancelling stream on-chain...");
                const tx = await program.methods
                    .cancel()
                    .accounts({
                        creator: signer.publicKey,
                        mint,
                        stream: streamPubkey,
                        vault,
                        creatorTokenAccount,
                        recipientTokenAccount,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .signers([signer])
                    .rpc();

                logSuccess("Stream successfully cancelled.");
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }

            case "unlock": {
                if (args.length < 2) {
                    logError("Missing stream address. Usage: npm run cli unlock <streamAddress>");
                    process.exit(1);
                }
                const streamPubkey = new PublicKey(args[1]);
                const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

                const nextIndex = streamState.nextMilestoneIndex;
                if (nextIndex >= streamState.milestoneCount) {
                    throw new Error("All milestones are already unlocked.");
                }

                const [milestonePda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("milestone"), streamPubkey.toBuffer(), Buffer.from([nextIndex])],
                    PROGRAM_ID
                );

                logInfo(`Unlocking milestone #${nextIndex} (${milestonePda.toBase58()})...`);
                const tx = await program.methods
                    .unlockMilestone()
                    .accountsStrict({
                        creator: signer.publicKey,
                        stream: streamPubkey,
                        milestone: milestonePda,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([signer])
                    .rpc();

                logSuccess(`Successfully unlocked milestone #${nextIndex}!`);
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }

            case "edit-milestone": {
                if (args.length < 4) {
                    logError("Missing arguments. Usage: npm run cli edit-milestone <stream> <idx> <amt>");
                    process.exit(1);
                }
                const streamPubkey = new PublicKey(args[1]);
                const idx = parseInt(args[2], 10);
                const amtStr = args[3];

                const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);
                const mint = streamState.mint;
                const vault = streamState.vault;

                const [milestonePda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("milestone"), streamPubkey.toBuffer(), Buffer.from([idx])],
                    PROGRAM_ID
                );
                const creatorTokenAccount = await getAssociatedTokenAddress(mint, signer.publicKey, true);

                logInfo(`Modifying milestone #${idx} allocation to ${amtStr} tokens...`);
                const tx = await program.methods
                    .editMilestone(new anchor.BN(amtStr))
                    .accounts({
                        creator: signer.publicKey,
                        stream: streamPubkey,
                        milestone: milestonePda,
                        mint: mint,
                        vault: vault,
                        creatorTokenAccount: creatorTokenAccount,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .signers([signer])
                    .rpc();

                logSuccess("Milestone modified successfully!");
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }
            case "edit-linear": {
                if (args.length < 3) {
                    logError(
                        "Usage: npm run cli edit-linear <stream> <newDuration> [topup]"
                    );
                    process.exit(1);
                }

                const streamPubkey = new PublicKey(args[1]);
                const newDuration = new anchor.BN(args[2]);
                const topupAmount =
                    args[3] ? new anchor.BN(args[3]) : new anchor.BN(0);

                const streamState: any =
                    await programAccount.streamAccount.fetch(streamPubkey);

                const mint = streamState.mint;
                const vault = streamState.vault;

                const creatorTokenAccount =
                    await getAssociatedTokenAddress(
                        mint,
                        signer.publicKey,
                        true
                    );

                const tx = await program.methods
                    .editLinear(newDuration, topupAmount)
                    .accounts({
                        creator: signer.publicKey,
                        stream: streamPubkey,
                        mint,
                        vault,
                        creatorTokenAccount,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .signers([signer])
                    .rpc();

                logSuccess("Linear stream updated.");
                logInfo(
                    `Tx Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`
                );

                break;
            }
            case "create-batch": {
                if (args.length < 2) {
                    logError(
                        "Usage: npm run cli create-batch <csvPath>"
                    );
                    process.exit(1);
                }

                const csvPath = args[1];

                logInfo(`Loading CSV ${csvPath}`);

                const rows = loadCsv(csvPath);

                for (const row of rows) {
                    await createStreamFromRow(row);
                }

                logSuccess(
                    `${rows.length} streams created successfully`
                );

                break;
            }
            case "edit-batch": {
                if (args.length < 2) {
                    logError(
                        "Usage: npm run cli edit-batch <csvPath>"
                    );
                    process.exit(1);
                }

                const rows = loadCsv(args[1]);

                for (const row of rows) {
                    await editBatchStream(row);
                }

                logSuccess(
                    `${rows.length} streams updated successfully`
                );

                break;
            }
            case "edit-cliff": {
                if (args.length < 3) {
                    logError("Missing arguments. Usage: npm run cli edit-cliff <stream> <newCliffTs>");
                    process.exit(1);
                }
                const streamPubkey = new PublicKey(args[1]);
                const newCliffTs = parseInt(args[2], 10);

                logInfo(`Modifying stream cliff timestamp to ${new Date(newCliffTs * 1000).toLocaleString()}...`);
                const tx = await program.methods
                    .editCliff(new anchor.BN(newCliffTs))
                    .accounts({
                        creator: signer.publicKey,
                        stream: streamPubkey,
                    })
                    .signers([signer])
                    .rpc();

                logSuccess("Cliff timestamp successfully updated!");
                logInfo(`Tx Explorer link: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                break;
            }
            case "version":
            case "-v":
            case "--version": {
                console.log(`
${C_CYAN}${C_BOLD}🌌 Unified Flow CLI${C_RESET}

  Version:     ${C_GREEN}${CLI_VERSION}${C_RESET}
  Program ID:  ${PROGRAM_ID.toBase58()}
  RPC:         ${connection.rpcEndpoint}

`);
                break;
            }
            default:
                logError(`Unknown command: ${command}`);
                printHelp();
                process.exit(1);
        }
    } catch (e: any) {
        logError(`Execution failed: ${e.message || e}`);
        if (e.logs) {
            console.log(`${C_RED}Transaction Logs:${C_RESET}`);
            console.log(e.logs.join("\n"));
        }
        process.exit(1);
    }
}


