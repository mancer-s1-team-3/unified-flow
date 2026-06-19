import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as anchor from "@coral-xyz/anchor";
import {
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";

import { connection } from "../services/rpc";
import idl from "../idl/unified_flow.json";
// Node-safe WSOL helpers from the SDK (anchor/spl-token/web3 only — no browser
// kit deps). Single source of truth for SOL→wSOL auto-wrap across all paths.
import {
    buildWsolWrapInstructions,
    isWrappedSolMint,
} from "@unifiedflow/unified-flow-sdk/dist/wsol-node";

dotenv.config();

// ============================================================================
// SOLANA CONNECTION & UTILITIES
// ============================================================================

const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID || "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);
const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function loadWallet(filePath: string): Keypair {
    const resolvedPath = path.resolve(filePath.replace(/^~/, process.env.HOME || ""));
    const secret = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function getSigner(customSecret?: string): Keypair {
    if (customSecret) {
        try {
            const trimmed = customSecret.trim();
            if (trimmed.startsWith("[")) {
                const arr = JSON.parse(trimmed);
                return Keypair.fromSecretKey(Uint8Array.from(arr));
            }
            return Keypair.fromSecretKey(bs58.decode(trimmed));
        } catch (e) {
            throw new Error(`Failed to parse custom signer private key: ${e}`);
        }
    }

    const defaultPath = process.env.WALLET_PATH || path.join(process.env.HOME || "", ".config/solana/id.json");
    try {
        return loadWallet(defaultPath);
    } catch (e) {
        throw new Error(
            `Failed to load default wallet from ${defaultPath}: ${e}. Please specify 'signerSecret' or configure WALLET_PATH.`
        );
    }
}

function getAnchorProgram(signer: Keypair) {
    const wallet = new anchor.Wallet(signer);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    return new anchor.Program(idl as anchor.Idl, provider);
}

async function fetchIndexedStreams() {
    const response = await fetch(`${API_BASE_URL}/streams`);

    if (!response.ok) {
        throw new Error(`Failed to fetch indexed streams from API (${response.status} ${response.statusText})`);
    }

    return response.json();
}

// Convert BigInt values to string representation recursively for JSON safe transfer
function serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "bigint") return obj.toString();
    if (Array.isArray(obj)) return obj.map(serializeBigInt);
    if (typeof obj === "object") {
        const res: any = {};
        for (const key in obj) {
            res[key] = serializeBigInt(obj[key]);
        }
        return res;
    }
    return obj;
}

// ============================================================================
// MCP SERVER INIT
// ============================================================================

const server = new McpServer({
    name: "unified-flow-mcp",
    version: "1.0.0",
});

// ============================================================================
// 1. GET STREAMS (INDEXED API QUERY)
// ============================================================================
server.tool(
    "get_streams",
    "Fetch vesting/token distribution streams from the indexed API with filtering options.",
    {
        creator: z.string().optional().describe("Filter streams created by this public key"),
        recipient: z.string().optional().describe("Filter streams intended for this recipient public key"),
        status: z.number().int().min(1).max(3).optional().describe("Filter by status (1: Active, 2: Completed, 3: Cancelled)"),
        vestingType: z.number().int().min(0).max(2).optional().describe("Filter by vesting type (0: Linear, 1: Cliff, 2: Milestone)"),
        limit: z.number().int().positive().optional().describe("Maximum number of streams to return (default: 50)"),
    },
    async ({ creator, recipient, status, vestingType, limit }) => {
        try {
            const streams = await fetchIndexedStreams();
            const filtered = streams
                .filter((stream: any) => {
                    if (creator && stream.creator !== creator) return false;
                    if (recipient && stream.recipient !== recipient) return false;
                    if (status !== undefined && stream.status !== status) return false;
                    if (vestingType !== undefined && stream.vestingType !== vestingType) return false;
                    return true;
                })
                .slice(0, limit || 50);

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(serializeBigInt(filtered), null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error fetching streams from API: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 2. GET STREAM DETAILS (ON-CHAIN ACCURATE STATE + MILESTONES)
// ============================================================================
server.tool(
    "get_stream_details",
    "Retrieve the real-time on-chain state of a specific stream and all its milestones if applicable.",
    {
        streamAddress: z.string().describe("The public key of the stream account"),
    },
    async ({ streamAddress }) => {
        try {
            const streamPubkey = new PublicKey(streamAddress);
            const dummySigner = Keypair.generate();
            const program = getAnchorProgram(dummySigner);
            const programAccount: any = program.account;

            const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);
            const details: any = {
                address: streamAddress,
                creator: streamState.creator.toBase58(),
                recipient: streamState.recipient.toBase58(),
                mint: streamState.mint.toBase58(),
                vault: streamState.vault.toBase58(),
                totalAmount: streamState.totalAmount.toString(),
                withdrawn: streamState.withdrawn.toString(),
                startTs: new Date(streamState.startTs.toNumber() * 1000).toISOString(),
                cliffTs: new Date(streamState.cliffTs.toNumber() * 1000).toISOString(),
                endTs: new Date(streamState.endTs.toNumber() * 1000).toISOString(),
                vestingType: streamState.vestingType,
                status: streamState.status,
                cancelable: streamState.cancelable,
                milestoneCount: streamState.milestoneCount,
                nextMilestoneIndex: streamState.nextMilestoneIndex,
                unlockedMilestoneAmount: streamState.unlockedMilestoneAmount?.toString() || "0",
                cancelled: streamState.cancelled,
                nonce: streamState.nonce.toString(),
                bump: streamState.bump,
            };

            // If it is a milestone stream, fetch all its milestones on-chain as well!
            if (streamState.vestingType === 2 && streamState.milestoneCount > 0) {
                details.milestones = [];
                for (let i = 0; i < streamState.milestoneCount; i++) {
                    const [milestonePda] = PublicKey.findProgramAddressSync(
                        [
                            Buffer.from("milestone"),
                            streamPubkey.toBuffer(),
                            Buffer.from([i]),
                        ],
                        PROGRAM_ID
                    );

                    try {
                        const milestoneState: any = await programAccount.milestoneAccount.fetch(milestonePda);
                        details.milestones.push({
                            index: i,
                            address: milestonePda.toBase58(),
                            amount: milestoneState.amount.toString(),
                            approved: milestoneState.approved,
                            unlocked: milestoneState.unlocked,
                            unlockTs: milestoneState.unlockTs.toNumber() > 0
                                ? new Date(milestoneState.unlockTs.toNumber() * 1000).toISOString()
                                : "N/A",
                            bump: milestoneState.bump,
                        });
                    } catch (err) {
                        details.milestones.push({
                            index: i,
                            address: milestonePda.toBase58(),
                            error: `Failed to fetch milestone PDA: ${err}`,
                        });
                    }
                }
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(details, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error fetching stream details: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 3. GET PROTOCOL CONFIG (ON-CHAIN GLOBAL CONFIG)
// ============================================================================
server.tool(
    "get_protocol_config",
    "Retrieve global on-chain program configurations, fee authorities, fee rates, and allowed mints.",
    {},
    async () => {
        try {
            const dummySigner = Keypair.generate();
            const program = getAnchorProgram(dummySigner);
            const programAccount: any = program.account;
            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );

            const config: any = await programAccount.configAccount.fetch(configPda);
            const details = {
                address: configPda.toBase58(),
                adminAuthority: config.adminAuthority.toBase58(),
                feeAuthority: config.feeAuthority.toBase58(),
                paused: config.paused,
                withdrawFeeBps: config.withdrawFeeBps,
                maxWithdrawFeeBps: config.maxWithdrawFeeBps,
                feeChangeTimelockSeconds: config.feeChangeTimelockSeconds.toString(),
                allowedMints: config.allowedMints.map((pubkey: any) => pubkey.toBase58()),
                bump: config.bump,
            };

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(details, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error fetching protocol config: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 4. CREATE STREAM (LINEAR, CLIFF, OR MILESTONE VESTING)
// ============================================================================
server.tool(
    "create_stream",
    "Initiate a new token distribution stream on Solana. Supports Linear, Cliff, and Milestone schedules.",
    {
        recipient: z.string().describe("Public key of the recipient"),
        mint: z.string().describe("Public key of the token mint"),
        amount: z.string().describe("Total amount of tokens to stream (including decimals, e.g. 1000000)"),
        startTs: z.number().int().describe("Stream start time (Unix timestamp in seconds)"),
        cliffTs: z.number().int().optional().describe("Vesting cliff time (Unix timestamp, defaults to startTs)"),
        endTs: z.number().int().describe("Stream end time (Unix timestamp in seconds)"),
        vestingType: z.number().int().min(0).max(2).describe("Vesting model (0: Linear, 1: Cliff, 2: Milestone)"),
        milestones: z.array(z.object({
            amount: z.string().describe("Milestone token amount")
        })).optional().describe("Ordered array of milestone allocations (required if vestingType is 2)"),
        nonce: z.number().int().optional().describe("Unique stream identifier (defaults to current time millisecond)"),
        signerSecret: z.string().optional().describe("Optional custom signer private key (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ recipient, mint, amount, startTs, cliffTs, endTs, vestingType, milestones, nonce, signerSecret }) => {
        try {
            const creator = getSigner(signerSecret);
            const program = getAnchorProgram(creator);

            const recipientPubkey = new PublicKey(recipient);
            const mintPubkey = new PublicKey(mint);
            const finalNonce = new anchor.BN(nonce !== undefined ? nonce : Date.now());

            const amountBN = new anchor.BN(amount);
            const startBN = new anchor.BN(startTs);
            const cliffBN = new anchor.BN(cliffTs !== undefined ? cliffTs : startTs);
            const endBN = new anchor.BN(endTs);

            // 1. Derive stream PDA
            const [streamPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("stream"),
                    creator.publicKey.toBuffer(),
                    recipientPubkey.toBuffer(),
                    finalNonce.toArrayLike(Buffer, "le", 8),
                ],
                PROGRAM_ID
            );

            // 2. Derive Vault ATA
            const vaultAta = await getAssociatedTokenAddress(mintPubkey, streamPda, true);

            // 3. Get creator token account
            const creatorTokenAccount = await getAssociatedTokenAddress(mintPubkey, creator.publicKey, true);

            // 4. Derive config PDA
            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );

            // 5. Structure milestones
            const milestoneInputs = (milestones || []).map(m => ({
                amount: new anchor.BN(m.amount),
            }));

            // 6. Build remaining accounts for milestones if type is Milestone
            const remainingAccounts = [];
            if (vestingType === 2) {
                if (milestoneInputs.length === 0) {
                    throw new Error("Milestones inputs are required when vestingType is 2 (Milestone)");
                }
                for (let i = 0; i < milestoneInputs.length; i++) {
                    const [milestonePda] = PublicKey.findProgramAddressSync(
                        [
                            Buffer.from("milestone"),
                            streamPda.toBuffer(),
                            Buffer.from([i]),
                        ],
                        PROGRAM_ID
                    );
                    remainingAccounts.push({
                        pubkey: milestonePda,
                        isWritable: true,
                        isSigner: false,
                    });
                }
            }

            // 6b. Auto-wrap SOL → wSOL when streaming native SOL, so the
            // creator's wSOL ATA holds enough before the program draws funds.
            const wrapInstructions = isWrappedSolMint(mintPubkey)
                ? await buildWsolWrapInstructions({
                    connection,
                    owner: creator.publicKey,
                    payer: creator.publicKey,
                    amountBn: amountBN,
                })
                : [];

            // 7. Execute createStream transaction
            const tx = await program.methods
                .createStream(
                    amountBN,
                    startBN,
                    cliffBN,
                    endBN,
                    vestingType,
                    milestoneInputs,
                    finalNonce
                )
                .accounts({
                    creator: creator.publicKey,
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
                .preInstructions(wrapInstructions)
                .remainingAccounts(remainingAccounts)
                .signers([creator])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Successfully created stream!",
                        streamAddress: streamPda.toBase58(),
                        vaultAddress: vaultAta.toBase58(),
                        nonce: finalNonce.toString(),
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error creating stream: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 5. WITHDRAW FROM STREAM (CLAIM VESTED TOKENS)
// ============================================================================
server.tool(
    "withdraw_from_stream",
    "Withdraw all claimable/vested tokens from an active stream. Calculates fee using Chainlink on-chain feed.",
    {
        streamAddress: z.string().describe("Public key of the stream PDA account"),
        signerSecret: z.string().optional().describe("Optional custom signer private key of the recipient (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ streamAddress, signerSecret }) => {
        try {
            const recipient = getSigner(signerSecret);
            const program = getAnchorProgram(recipient);
            const programAccount: any = program.account;

            const streamPubkey = new PublicKey(streamAddress);
            const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

            // Double check recipient
            if (streamState.recipient.toBase58() !== recipient.publicKey.toBase58()) {
                throw new Error(
                    `Signer (${recipient.publicKey.toBase58()}) is not the authorized stream recipient (${streamState.recipient.toBase58()})`
                );
            }

            const mint = streamState.mint;
            const vault = streamState.vault;

            // 1. Derive config PDA
            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );
            const feeReceiver = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], PROGRAM_ID)[0];

            // 2. Recipient ATA (ensure it exists — a fresh wSOL recipient may
            // not have one yet, which would make withdraw fail).
            const recipientAta = await getAssociatedTokenAddress(mint, recipient.publicKey, true);
            const ensureRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
                recipient.publicKey,
                recipientAta,
                recipient.publicKey,
                mint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            // 3. Fixed Chainlink feed & Program constraints
            const chainlinkFeed = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

            // 4. Run withdraw (program takes no args; fee account is the fee_vault PDA).
            const tx = await program.methods
                .withdraw()
                .accounts({
                    recipient: recipient.publicKey,
                    mint: mint,
                    config: configPda,
                    stream: streamPubkey,
                    vault: vault,
                    recipientAta: recipientAta,
                    feeVault: feeReceiver,
                    chainlinkFeed: chainlinkFeed,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                } as any)
                .preInstructions([ensureRecipientAtaIx])
                .signers([recipient])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Withdrawal successful!",
                        streamAddress,
                        recipient: recipient.publicKey.toBase58(),
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error withdrawing from stream: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 6. CANCEL STREAM (CREATOR CANCELS ACTIVE STREAM)
// ============================================================================
server.tool(
    "cancel_stream",
    "Cancel an active vesting stream and return unvested tokens to the creator.",
    {
        streamAddress: z.string().describe("Public key of the stream PDA account"),
        signerSecret: z.string().optional().describe("Optional custom signer private key of the creator (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ streamAddress, signerSecret }) => {
        try {
            const creator = getSigner(signerSecret);
            const program = getAnchorProgram(creator);
            const programAccount: any = program.account;

            const streamPubkey = new PublicKey(streamAddress);
            const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

            if (streamState.creator.toBase58() !== creator.publicKey.toBase58()) {
                throw new Error(
                    `Signer (${creator.publicKey.toBase58()}) is not the stream creator (${streamState.creator.toBase58()})`
                );
            }

            const mint = streamState.mint;
            const vault = streamState.vault;

            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );
            const creatorTokenAccount = await getAssociatedTokenAddress(mint, creator.publicKey, true);
            const recipientTokenAccount = await getAssociatedTokenAddress(mint, streamState.recipient, true);

            // Ensure both token accounts exist before the payout. For wSOL the
            // recipient often has no ATA yet — cancel would otherwise fail. The
            // creator (signer) pays the rent; idempotent = no-op if present.
            const ensureAtaInstructions = [
                createAssociatedTokenAccountIdempotentInstruction(
                    creator.publicKey,
                    creatorTokenAccount,
                    creator.publicKey,
                    mint,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                ),
                createAssociatedTokenAccountIdempotentInstruction(
                    creator.publicKey,
                    recipientTokenAccount,
                    streamState.recipient,
                    mint,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                ),
            ];

            const tx = await program.methods
                .cancel()
                .accounts({
                    creator: creator.publicKey,
                    mint,
                    config: configPda,
                    stream: streamPubkey,
                    vault,
                    creatorTokenAccount,
                    recipientTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(ensureAtaInstructions)
                .signers([creator])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Successfully cancelled stream!",
                        streamAddress,
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error cancelling stream: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 7. UNLOCK MILESTONE (CREATOR UNLOCKS THE NEXT MILESTONE)
// ============================================================================
server.tool(
    "unlock_milestone",
    "Approve and unlock the next sequential milestone in a milestone stream, making its allocated funds claimable.",
    {
        streamAddress: z.string().describe("Public key of the stream account"),
        signerSecret: z.string().optional().describe("Optional custom signer private key of the creator (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ streamAddress, signerSecret }) => {
        try {
            const creator = getSigner(signerSecret);
            const program = getAnchorProgram(creator);
            const programAccount: any = program.account;

            const streamPubkey = new PublicKey(streamAddress);
            const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

            if (streamState.vestingType !== 2) {
                throw new Error("Milestones can only be unlocked on a Milestone Stream (vestingType = 2)");
            }

            if (streamState.creator.toBase58() !== creator.publicKey.toBase58()) {
                throw new Error(
                    `Signer (${creator.publicKey.toBase58()}) is not the authorized stream creator (${streamState.creator.toBase58()})`
                );
            }

            const nextIndex = streamState.nextMilestoneIndex;
            if (nextIndex >= streamState.milestoneCount) {
                throw new Error(`All ${streamState.milestoneCount} milestones have already been unlocked!`);
            }

            const [milestonePda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("milestone"),
                    streamPubkey.toBuffer(),
                    Buffer.from([nextIndex]),
                ],
                PROGRAM_ID
            );

            const tx = await program.methods
                .unlockMilestone()
                .accountsStrict({
                    creator: creator.publicKey,
                    stream: streamPubkey,
                    milestone: milestonePda,
                    systemProgram: SystemProgram.programId,
                })
                .signers([creator])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Successfully unlocked milestone!",
                        streamAddress,
                        unlockedMilestoneIndex: nextIndex,
                        milestonePda: milestonePda.toBase58(),
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error unlocking milestone: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 8. EDIT MILESTONE (CREATOR EDITS ALLOCATION OF LOCKED MILESTONE)
// ============================================================================
server.tool(
    "edit_milestone",
    "Modify the token allocation of a specific milestone. Corrects on-chain vault funding automatically.",
    {
        streamAddress: z.string().describe("Public key of the stream account"),
        milestoneIndex: z.number().int().min(0).describe("The index of the milestone to edit"),
        newAmount: z.string().describe("New token amount for this milestone (including decimals, e.g. 1500000)"),
        signerSecret: z.string().optional().describe("Optional custom signer private key of the creator (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ streamAddress, milestoneIndex, newAmount, signerSecret }) => {
        try {
            const creator = getSigner(signerSecret);
            const program = getAnchorProgram(creator);
            const programAccount: any = program.account;

            const streamPubkey = new PublicKey(streamAddress);
            const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

            if (streamState.creator.toBase58() !== creator.publicKey.toBase58()) {
                throw new Error(
                    `Signer (${creator.publicKey.toBase58()}) is not the stream creator (${streamState.creator.toBase58()})`
                );
            }

            const mint = streamState.mint;
            const vault = streamState.vault;

            const [milestonePda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("milestone"),
                    streamPubkey.toBuffer(),
                    Buffer.from([milestoneIndex]),
                ],
                PROGRAM_ID
            );

            // Fetch current milestone state to print comparison
            const milestoneState: any = await programAccount.milestoneAccount.fetch(milestonePda);
            const oldAmount = milestoneState.amount.toString();

            const creatorTokenAccount = await getAssociatedTokenAddress(mint, creator.publicKey, true);
            const amountBN = new anchor.BN(newAmount);

            // Top-up (new > old): wrap SOL → wSOL (also creates the creator ATA).
            // Otherwise (decrease/equal): the program refunds freed tokens to the
            // creator ATA, so ensure it exists first (a wSOL creator may have
            // closed it). Idempotent = no-op when present.
            const oldAmountBN = new anchor.BN(oldAmount);
            const topUpDiff = amountBN.gt(oldAmountBN) ? amountBN.sub(oldAmountBN) : new anchor.BN(0);
            const wrapInstructions =
                isWrappedSolMint(mint) && topUpDiff.gt(new anchor.BN(0))
                    ? await buildWsolWrapInstructions({
                        connection,
                        owner: creator.publicKey,
                        payer: creator.publicKey,
                        amountBn: topUpDiff,
                    })
                    : [
                        createAssociatedTokenAccountIdempotentInstruction(
                            creator.publicKey,
                            creatorTokenAccount,
                            creator.publicKey,
                            mint,
                            TOKEN_PROGRAM_ID,
                            ASSOCIATED_TOKEN_PROGRAM_ID
                        ),
                    ];

            const tx = await program.methods
                .editMilestone(amountBN)
                .accounts({
                    creator: creator.publicKey,
                    stream: streamPubkey,
                    milestone: milestonePda,
                    mint: mint,
                    vault: vault,
                    creatorTokenAccount: creatorTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(wrapInstructions)
                .signers([creator])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Successfully edited milestone!",
                        streamAddress,
                        milestoneIndex,
                        milestoneAddress: milestonePda.toBase58(),
                        oldAmount,
                        newAmount,
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error editing milestone: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// 9. EDIT CLIFF (CREATOR EDITS UNSTARTED STREAM CLIFF)
// ============================================================================
server.tool(
    "edit_cliff",
    "Change the cliff timestamp for an active stream before it starts.",
    {
        streamAddress: z.string().describe("Public key of the stream account"),
        newCliffTs: z.number().int().describe("New Unix timestamp for the cliff in seconds"),
        signerSecret: z.string().optional().describe("Optional custom signer private key of the creator (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ streamAddress, newCliffTs, signerSecret }) => {
        try {
            const creator = getSigner(signerSecret);
            const program = getAnchorProgram(creator);
            const programAccount: any = program.account;

            const streamPubkey = new PublicKey(streamAddress);
            const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);

            if (streamState.creator.toBase58() !== creator.publicKey.toBase58()) {
                throw new Error(
                    `Signer (${creator.publicKey.toBase58()}) is not the stream creator (${streamState.creator.toBase58()})`
                );
            }

            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );
            const newCliffBN = new anchor.BN(newCliffTs);
            const tx = await program.methods
                .editCliff(newCliffBN)
                .accounts({
                    creator: creator.publicKey,
                    config: configPda,
                    stream: streamPubkey,
                })
                .signers([creator])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Successfully modified stream cliff timestamp!",
                        streamAddress,
                        newCliffTime: new Date(newCliffTs * 1000).toISOString(),
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error editing cliff: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);
server.tool(
    "edit_linear",
    "Extend a linear/cliff stream duration and/or top up additional tokens.",
    {
        streamAddress: z.string().describe("Public key of the stream"),
        newEndTs: z.number().int().optional().describe(
            "New stream end timestamp (unix seconds)"
        ),
        topupAmount: z.string().optional().describe(
            "Additional token amount to add"
        ),
        signerSecret: z.string().optional(),
    },
    async ({ streamAddress, newEndTs, topupAmount, signerSecret }) => {
        try {
            const creator = getSigner(signerSecret);
            const program = getAnchorProgram(creator);
            const programAccount: any = program.account;

            const streamPubkey = new PublicKey(streamAddress);
            const streamState: any =
                await programAccount.streamAccount.fetch(streamPubkey);

            if (
                streamState.creator.toBase58() !== creator.publicKey.toBase58()
            ) {
                throw new Error(
                    `Signer (${creator.publicKey.toBase58()}) is not the stream creator (${streamState.creator.toBase58()})`
                );
            }

            const mint = streamState.mint;
            const vault = streamState.vault;

            const creatorTokenAccount =
                await getAssociatedTokenAddress(
                    mint,
                    creator.publicKey,
                    true
                );

            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );

            const endTsBN = new anchor.BN(
                newEndTs ?? streamState.endTs.toNumber()
            );

            const topupBN = new anchor.BN(
                topupAmount ?? "0"
            );

            // Auto-wrap SOL → wSOL for the top-up portion when streaming native SOL.
            const wrapInstructions =
                isWrappedSolMint(mint) && topupBN.gt(new anchor.BN(0))
                    ? await buildWsolWrapInstructions({
                        connection,
                        owner: creator.publicKey,
                        payer: creator.publicKey,
                        amountBn: topupBN,
                    })
                    : [];

            const tx = await program.methods
                .editLinear(
                    endTsBN,
                    topupBN
                )
                .accounts({
                    creator: creator.publicKey,
                    mint,
                    config: configPda,
                    stream: streamPubkey,
                    vault,
                    creatorTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(wrapInstructions)
                .signers([creator])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Successfully edited stream!",
                        streamAddress,
                        newEndTs: endTsBN.toString(),
                        topupAmount: topupBN.toString(),
                        signature: tx,
                        explorer:
                            `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error editing stream: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }

);
// ============================================================================
// 10. INITIALIZE PROTOCOL CONFIG (ADMIN CONFIG INITIALIZATION)
// ============================================================================
server.tool(
    "initialize_protocol",
    "Deploy/Initialize global protocol config PDA state. Must be called by authorized admin.",
    {
        signerSecret: z.string().optional().describe("Optional custom signer private key of the admin (base58 or JSON array). Defaults to backend wallet."),
    },
    async ({ signerSecret }) => {
        try {
            const admin = getSigner(signerSecret);
            const program = getAnchorProgram(admin);

            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                PROGRAM_ID
            );

            const tx = await program.methods
                .initializeConfig()
                .accounts({
                    admin: admin.publicKey,
                    config: configPda,
                    systemProgram: SystemProgram.programId,
                })
                .signers([admin])
                .rpc();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: "Protocol configuration initialized successfully!",
                        admin: admin.publicKey.toBase58(),
                        configAddress: configPda.toBase58(),
                        signature: tx,
                        explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error initializing protocol: ${error.message || error}`,
                }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// SERVER MAIN RUNNER
// ============================================================================
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Unified Flow MCP Server connected via Stdio.");
}

run().catch((err) => {
    console.error("Failed to start Unified Flow MCP Server:", err);
    process.exit(1);
});
