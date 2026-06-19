import * as anchor from "@coral-xyz/anchor";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
    createSyncNativeInstruction,
} from "@solana/spl-token";

import {
    Connection,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    Commitment,
} from "@solana/web3.js";

export const WRAPPED_SOL_MINT =
    "So11111111111111111111111111111111111111112";

export const TOKEN_ACCOUNT_SIZE = 165;

export function isWrappedSolMint(
    mint: PublicKey | string
): boolean {
    return (
        (typeof mint === "string"
            ? mint
            : mint.toBase58()) === WRAPPED_SOL_MINT
    );
}

export function getWsolMint(): PublicKey {
    return NATIVE_MINT;
}

export function getWsolAta(owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
        NATIVE_MINT,
        owner,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
}

export type WsolBalanceSnapshot = {
    ata: PublicKey;
    ataExists: boolean;
    wsolRaw: bigint;
    nativeSolRaw: bigint;
    combinedRaw: bigint;
};

function isAccountNotFoundError(error: unknown) {
    const message = String(
        (error as Error)?.message ?? error
    ).toLowerCase();

    return (
        message.includes("could not find account") ||
        message.includes("account does not exist")
    );
}

export async function fetchWsolBalanceSnapshot(
    connection: Connection,
    owner: PublicKey,
    commitment: Commitment = "confirmed"
): Promise<WsolBalanceSnapshot> {
    const ata = getWsolAta(owner);

    const nativeSolRaw = BigInt(
        await connection.getBalance(owner, commitment)
    );

    let wsolRaw = 0n;
    let ataExists = false;

    try {
        const balance =
            await connection.getTokenAccountBalance(
                ata,
                commitment
            );

        wsolRaw = BigInt(balance.value.amount);
        ataExists = true;
    } catch (error) {
        if (!isAccountNotFoundError(error)) {
            throw error;
        }
    }

    return {
        ata,
        ataExists,
        wsolRaw,
        nativeSolRaw,
        combinedRaw: nativeSolRaw + wsolRaw,
    };
}

export function formatTokenAmountFromBaseUnits(
    amount: anchor.BN | bigint | string,
    decimals: number
) {
    const raw = String(amount);

    if (decimals === 0) {
        return raw;
    }

    const padded = raw.padStart(decimals + 1, "0");

    const whole = padded.slice(0, -decimals);
    const fraction = padded
        .slice(-decimals)
        .replace(/0+$/, "");

    return fraction
        ? `${whole}.${fraction}`
        : whole;
}

export async function buildWsolWrapInstructions({
    connection,
    owner,
    payer,
    amountBn,
    commitment = "confirmed",
}: {
    connection: Connection;
    owner: PublicKey;
    payer: PublicKey;
    amountBn: anchor.BN;
    commitment?: Commitment;
}): Promise<TransactionInstruction[]> {
    const snapshot =
        await fetchWsolBalanceSnapshot(
            connection,
            owner,
            commitment
        );

    const existingAmount = new anchor.BN(
        snapshot.wsolRaw.toString()
    );

    const topUpAmount =
        amountBn.sub(existingAmount);

    if (topUpAmount.lte(new anchor.BN(0))) {
        return [];
    }

    const rentLamports = snapshot.ataExists
        ? 0
        : await connection.getMinimumBalanceForRentExemption(
            TOKEN_ACCOUNT_SIZE,
            commitment
        );

    const requiredLamports =
        topUpAmount.add(
            new anchor.BN(String(rentLamports))
        );

    if (
        new anchor.BN(
            snapshot.nativeSolRaw.toString()
        ).lt(requiredLamports)
    ) {
        throw new Error(
            `Insufficient SOL balance. Need ${formatTokenAmountFromBaseUnits(
                requiredLamports,
                9
            )} SOL.`
        );
    }

    const instructions: TransactionInstruction[] = [];

    instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
            payer,
            snapshot.ata,
            owner,
            NATIVE_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        )
    );

    instructions.push(
        SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: snapshot.ata,
            lamports: Number(topUpAmount.toString()),
        })
    );

    instructions.push(
        createSyncNativeInstruction(
            snapshot.ata,
            TOKEN_PROGRAM_ID
        )
    );

    return instructions;
}