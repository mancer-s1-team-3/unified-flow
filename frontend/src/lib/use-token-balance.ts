// hooks/use-token-balance.ts
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useWalletConnection } from "@solana/react-hooks";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenBalanceResult {
    balance: number | null;
    rawBalance: bigint | null;
    decimals: number | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useTokenBalance(
    mint: string,
    endpoint: string,
    decimals?: number
): TokenBalanceResult {
    const { wallet, connected } = useWalletConnection();
    const walletAddress =
        connected && wallet?.account.address
            ? String(wallet.account.address)
            : null;

    const [balance, setBalance] = useState<number | null>(null);
    const [rawBalance, setRawBalance] = useState<bigint | null>(null);
    const [resolvedDecimals, setResolvedDecimals] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchBalance = useCallback(async () => {
        if (!walletAddress || !mint?.trim()) {
            setBalance(null);
            setRawBalance(null);
            setResolvedDecimals(null);
            setError(null);
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const connection = new Connection(endpoint, "confirmed");

            // ── SOL (native) ──────────────────────────────────────────────────────
            if (mint === SOL_MINT) {
                const pubkey = new PublicKey(walletAddress);
                const lamports = await connection.getBalance(pubkey);
                if (controller.signal.aborted) return;
                setRawBalance(BigInt(lamports));
                setResolvedDecimals(9);
                setBalance(lamports / LAMPORTS_PER_SOL);
                return;
            }

            // ── SPL token ─────────────────────────────────────────────────────────
            let mintPubkey: PublicKey;
            try {
                mintPubkey = new PublicKey(mint);
            } catch {
                setError("Invalid mint address");
                setBalance(null);
                setRawBalance(null);
                return;
            }

            const wallet = new PublicKey(walletAddress);
            const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
                mint: mintPubkey,
            });

            if (controller.signal.aborted) return;

            if (accounts.value.length === 0) {
                // ATA belum exist = balance 0, bukan error
                setBalance(0);
                setRawBalance(BigInt(0));
                setResolvedDecimals(decimals ?? null);
                return;
            }

            const info = accounts.value[0].account.data.parsed.info;
            const tokenAmount = info.tokenAmount;
            setRawBalance(BigInt(tokenAmount.amount as string));
            setResolvedDecimals(tokenAmount.decimals as number);
            setBalance(tokenAmount.uiAmount as number);
        } catch {
            if (controller.signal.aborted) return;
            setError("Failed to fetch balance");
            setBalance(null);
            setRawBalance(null);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [walletAddress, mint, endpoint, decimals]);

    useEffect(() => {
        fetchBalance();
        return () => abortRef.current?.abort();
    }, [fetchBalance]);

    useEffect(() => {
        const interval = setInterval(fetchBalance, 30_000);
        return () => clearInterval(interval);
    }, [fetchBalance]);

    return {
        balance,
        rawBalance,
        decimals: resolvedDecimals,
        loading,
        error,
        refetch: fetchBalance,
    };
}