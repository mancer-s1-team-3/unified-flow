"use client";

import { useEffect, useState } from "react";
import { Coins, RefreshCw } from "lucide-react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useNetwork } from "@/components/wallet/network-context";
import { getMintPresets } from "@/components/dashboard/token-mints";

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

/**
 * Reads and displays the connected wallet's native SOL balance plus the SPL
 * token balances for the active cluster's known mints (USDC, etc.). Always
 * shows SOL and the primary stablecoin; other tokens appear only when held.
 */
export function WalletBalances({ address }: { address: string }) {
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
              const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
                mint: new PublicKey(preset.mint),
              });
              const amount =
                accounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
              return { label: preset.label, mint: preset.mint, amount, logoURI: preset.logoURI, accent: preset.accent };
            } catch {
              return { label: preset.label, mint: preset.mint, amount: 0, logoURI: preset.logoURI, accent: preset.accent };
            }
          }),
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

  // Always show SOL + the primary preset (index 0, typically USDC); other
  // tokens only when the wallet actually holds them — keeps the panel compact.
  const visibleTokens = (tokens ?? []).filter((token, index) => index === 0 || token.amount > 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <Coins className="h-3 w-3" /> Balances
        </span>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          title="Refresh balances"
          disabled={loading}
          className="rounded-md p-1 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          Unable to load balances. Check your connection and retry.
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Native SOL */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <span className="h-1.5 w-1.5 rounded-full bg-[#9945FF]" />
              SOL
            </span>
            <span className="font-mono text-xs text-zinc-100">
              {loading && sol === null ? "…" : `${formatAmount(sol ?? 0)} SOL`}
            </span>
          </div>

          {/* SPL tokens */}
          {loading && tokens === null ? (
            <div className="px-3 py-1.5 text-[11px] text-zinc-500">Loading token balances…</div>
          ) : (
            visibleTokens.map((token) => (
              <div
                key={token.mint}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: token.accent }} />
                  {token.label}
                </span>
                <span className="font-mono text-xs text-zinc-100">
                  {formatAmount(token.amount)} {token.label}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
