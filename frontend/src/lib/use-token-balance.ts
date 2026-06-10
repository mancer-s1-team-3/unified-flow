// hooks/use-token-balance.ts
import { useEffect, useState, useCallback, useRef } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

const SOL_MINT = "So11111111111111111111111111111111111111112"; // wrapped SOL sentinel

export interface TokenBalanceResult {
    balance: number | null;    // in human-readable token units
    rawBalance: bigint | null; // in base units
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
    const { publicKey } = useWallet();
    const [balance, setBalance] = useState<number | null>(null);
    const [rawBalance, setRawBalance] = useState<bigint | null>(null);
    const [resolvedDecimals, setResolvedDecimals] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchBalance = useCallback(async () => {
        if (!publicKey || !mint?.trim()) {
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
                const lamports = await connection.getBalance(publicKey);
                if (controller.signal.aborted) return;
                const dec = 9;
                const raw = BigInt(lamports);
                setRawBalance(raw);
                setResolvedDecimals(dec);
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

            const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                mint: mintPubkey,
            });

            if (controller.signal.aborted) return;

            if (accounts.value.length === 0) {
                setBalance(0);
                setRawBalance(BigInt(0));
                setResolvedDecimals(decimals ?? null);
                return;
            }

            const info = accounts.value[0].account.data.parsed.info;
            const tokenAmount = info.tokenAmount;
            const dec = tokenAmount.decimals as number;
            const rawAmt = BigInt(tokenAmount.amount as string);

            setRawBalance(rawAmt);
            setResolvedDecimals(dec);
            setBalance(tokenAmount.uiAmount as number);
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const msg = err instanceof Error ? err.message : "Failed to fetch balance";
            setError(msg);
            setBalance(null);
            setRawBalance(null);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [publicKey, mint, endpoint, decimals]);

    useEffect(() => {
        fetchBalance();
        return () => abortRef.current?.abort();
    }, [fetchBalance]);

    // Re-fetch every 30s while mounted
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