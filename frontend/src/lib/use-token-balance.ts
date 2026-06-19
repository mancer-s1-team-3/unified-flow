// hooks/use-token-balance.ts
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { Buffer } from "buffer";
import { useWalletConnection } from "@solana/react-hooks";
import { fetchWsolBalanceSnapshot, WRAPPED_SOL_MINT } from "@/lib/solana/wsol";

const SOL_MINT = WRAPPED_SOL_MINT;
const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

// ── Shared infra (module-level) ─────────────────────────────────────────────
// Reuse one Connection per endpoint instead of building a fresh one per fetch.
const connectionCache = new Map<string, Connection>();
function getConnection(endpoint: string): Connection {
    let conn = connectionCache.get(endpoint);
    if (!conn) {
        conn = new Connection(endpoint, "confirmed");
        connectionCache.set(endpoint, conn);
    }
    return conn;
}

interface BalanceData {
    balance: number;
    rawBalance: bigint;
    decimals: number | null;
}

// Short-lived cache + in-flight dedup so multiple hook instances asking for the
// same (endpoint, wallet, mint) share one RPC call instead of each firing their own.
const CACHE_TTL = 15_000;
const balanceCache = new Map<string, { ts: number; data: BalanceData }>();
const inflight = new Map<string, Promise<BalanceData>>();

async function loadBalance(
    endpoint: string,
    walletAddress: string,
    mint: string,
    decimals?: number
): Promise<BalanceData> {
    const connection = getConnection(endpoint);

    // ── WSOL: gabungkan saldo WSOL di ATA + native SOL ─────────────────────
    if (mint === SOL_MINT) {
        const snapshot = await fetchWsolBalanceSnapshot(
            connection,
            new PublicKey(walletAddress)
        );
        return {
            balance: Number(snapshot.combinedRaw) / LAMPORTS_PER_SOL,
            rawBalance: snapshot.combinedRaw,
            decimals: 9,
        };
    }

    // ── SPL token ───────────────────────────────────────────────────────────
    const mintPubkey = new PublicKey(mint);
    const owner = new PublicKey(walletAddress);

    // Derive the associated token account directly — a single light account read
    // instead of scanning + parsing every token account the wallet owns.
    const [ata] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
        const res = await connection.getTokenAccountBalance(ata, "confirmed");
        const amount = res.value;
        return {
            balance: amount.uiAmount ?? 0,
            rawBalance: BigInt(amount.amount),
            decimals: amount.decimals,
        };
    } catch {
        // ATA missing (balance 0) or a non-standard program (e.g. Token-2022,
        // whose ATA derivation differs). Fall back to the owner scan to stay correct.
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
            mint: mintPubkey,
        });
        if (accounts.value.length === 0) {
            return { balance: 0, rawBalance: BigInt(0), decimals: decimals ?? null };
        }
        const amount = accounts.value[0].account.data.parsed.info.tokenAmount;
        return {
            balance: (amount.uiAmount as number) ?? 0,
            rawBalance: BigInt(amount.amount as string),
            decimals: amount.decimals as number,
        };
    }
}

function fetchBalanceShared(
    endpoint: string,
    walletAddress: string,
    mint: string,
    decimals: number | undefined,
    force: boolean
): Promise<BalanceData> {
    const key = `${endpoint}|${walletAddress}|${mint}`;

    if (!force) {
        const cached = balanceCache.get(key);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            return Promise.resolve(cached.data);
        }
    }

    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = loadBalance(endpoint, walletAddress, mint, decimals)
        .then((data) => {
            balanceCache.set(key, { ts: Date.now(), data });
            inflight.delete(key);
            return data;
        })
        .catch((err) => {
            inflight.delete(key);
            throw err;
        });

    inflight.set(key, promise);
    return promise;
}

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
    // Monotonic request id: only the latest fetch for this instance is applied.
    const reqRef = useRef(0);

    const fetchBalance = useCallback(
        async (force = false) => {
            if (!walletAddress || !mint?.trim()) {
                setBalance(null);
                setRawBalance(null);
                setResolvedDecimals(null);
                setError(null);
                return;
            }

            if (mint !== SOL_MINT) {
                try {
                    new PublicKey(mint);
                } catch {
                    setError("Invalid mint address");
                    setBalance(null);
                    setRawBalance(null);
                    return;
                }
            }

            const reqId = ++reqRef.current;
            setLoading(true);
            setError(null);

            try {
                const data = await fetchBalanceShared(
                    endpoint,
                    walletAddress,
                    mint,
                    decimals,
                    force
                );
                if (reqId !== reqRef.current) return;
                setRawBalance(data.rawBalance);
                setResolvedDecimals(data.decimals);
                setBalance(data.balance);
            } catch {
                if (reqId !== reqRef.current) return;
                setError("Failed to fetch balance");
                setBalance(null);
                setRawBalance(null);
            } finally {
                if (reqId === reqRef.current) setLoading(false);
            }
        },
        [walletAddress, mint, endpoint, decimals]
    );

    useEffect(() => {
        fetchBalance();
        // Invalidate the latest-request guard on unmount/dep-change.
        return () => {
            reqRef.current++;
        };
    }, [fetchBalance]);

    useEffect(() => {
        const interval = setInterval(() => fetchBalance(true), 30_000);
        return () => clearInterval(interval);
    }, [fetchBalance]);

    return {
        balance,
        rawBalance,
        decimals: resolvedDecimals,
        loading,
        error,
        refetch: () => fetchBalance(true),
    };
}
