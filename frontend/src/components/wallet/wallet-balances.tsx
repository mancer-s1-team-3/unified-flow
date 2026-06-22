"use client";

import { useEffect, useState } from "react";
import { Coins, RefreshCw } from "lucide-react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useNetwork } from "@/components/wallet/network-context";
import { getMintPresets } from "@/components/dashboard/token-mints";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

type TokenBalance = {
  label: string;
  mint: string;
  amount: number;
  logoURI: string;
  accent: string;
};

function formatAmount(value: number) {
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function WalletBalances({
  address,
  onUnwrapWsol,
  unwrapping = false,
}: {
  address: string;
  onUnwrapWsol?: (mint: string) => void;
  unwrapping?: boolean;
}) {
  const { network } = useNetwork();

  const [sol, setSol] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);

      try {
        const connection = new Connection(network.rpc, "confirmed");
        const owner = new PublicKey(address);

        const lamports = await connection.getBalance(owner);
        if (!cancelled) setSol(lamports / LAMPORTS_PER_SOL);

        const presets = getMintPresets(network.rpc);

        const results = await Promise.all(
          presets.map(async (preset) => {
            try {
              const accounts =
                await connection.getParsedTokenAccountsByOwner(owner, {
                  mint: new PublicKey(preset.mint),
                });

              const amount =
                accounts.value[0]?.account.data.parsed.info.tokenAmount
                  .uiAmount ?? 0;

              return {
                label: preset.label,
                mint: preset.mint,
                amount,
                logoURI: preset.logoURI,
                accent: preset.accent,
              };
            } catch {
              return {
                label: preset.label,
                mint: preset.mint,
                amount: 0,
                logoURI: preset.logoURI,
                accent: preset.accent,
              };
            }
          })
        );

        if (!cancelled) setTokens(results);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [address, network.rpc, reloadKey]);

  const visibleTokens = (tokens ?? []).filter(
    (t, i) => i === 0 || t.amount > 0
  );

  return (
    <div>
      {/* header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <Coins className="h-3 w-3" /> Balances
        </span>

        <button
          onClick={() => setReloadKey((v) => v + 1)}
          disabled={loading}
          className="rounded-md p-1 text-zinc-500 hover:text-zinc-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="text-[11px] text-red-300">
          Failed to load balances
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* SOL */}
          <div className="flex justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <span className="text-xs text-zinc-200">SOL</span>
            <span className="font-mono text-xs">
              {sol === null ? "…" : `${formatAmount(sol)} SOL`}
            </span>
          </div>

          {/* TOKENS */}
          {loading && !tokens ? (
            <div className="text-[11px] text-zinc-500">
              Loading tokens...
            </div>
          ) : (
            visibleTokens.map((token) => {
              const isWsol = token.mint === WSOL_MINT;

              return (
                <div
                  key={token.mint}
                  className="flex justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <span className="text-xs text-zinc-200">
                    {token.label}
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {formatAmount(token.amount)} {token.label}
                    </span>

                    {isWsol && token.amount > 0 && onUnwrapWsol && (
                      <button
                        onClick={() => onUnwrapWsol(token.mint)}
                        disabled={unwrapping}
                        className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20"
                      >
                        {unwrapping ? "..." : "Unwrap"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}