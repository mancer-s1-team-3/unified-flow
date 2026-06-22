"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, RefreshCw, X } from "lucide-react";
import type { WalletSession } from "@solana/client";
import { useNotifications } from "@/lib/notification-context";
import { fetchWsolBalanceRaw, unwrapWsolOnChain } from "@/lib/solana/unwrap-wsol";

const WSOL_DECIMALS = 9;
const HIDE_AFTER_MS = 15_000;
const WSOL_MINT = "So11111111111111111111111111111111111111112";

const isWsolMint = (mint?: string | null) =>
  mint?.toLowerCase() === WSOL_MINT.toLowerCase();

const WSOL_OUT_ACTIONS = new Set([
  "withdraw",
  "cancel",
  "edit_milestone",
  "edit_linear",
  "edit_cliff",
  "edit_stream_csv",
]);

export function WsolUnwrapWidget({
  wallet,
  endpoint,
  connected,
  refreshSignal,
  activeMint,
}: {
  wallet: WalletSession | null;
  endpoint: string;
  connected: boolean;
  refreshSignal?: string | number;
  activeMint?: string | null;
}) {
  const { addNotification } = useNotifications();
  const [wsolRaw, setWsolRaw] = useState<bigint>(BigInt(0));
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);
  const prevSignalRef = useRef<string>("");

  const owner = connected && wallet?.account?.address ? String(wallet.account.address) : null;

  const refresh = useCallback(async (): Promise<bigint> => {
    if (!owner) {
      setWsolRaw(BigInt(0));
      return BigInt(0);
    }
    try {
      const raw = await fetchWsolBalanceRaw({ endpoint, owner });
      setWsolRaw(raw);
      return raw;
    } catch {
      return BigInt(0);
    }
  }, [owner, endpoint]);

  useEffect(() => {
    const curr = String(refreshSignal ?? "");
    const prevAction = prevSignalRef.current.split("-")[0];
    prevSignalRef.current = curr;

    const idleNow = curr === "" || curr === "-";
    if (!idleNow || !WSOL_OUT_ACTIONS.has(prevAction)) return;

    // Only show widget when the stream's mint is WSOL
    if (!isWsolMint(activeMint)) return;

    const t = setTimeout(async () => {
      const raw = await refresh();
      if (raw > BigInt(0)) setVisible(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [refreshSignal, activeMint, refresh]);

  useEffect(() => {
    if (!visible || hovered || busy) return;
    const t = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [visible, hovered, busy]);

  if (!owner || !visible || wsolRaw <= BigInt(0)) return null;

  const wsol = Number(wsolRaw) / 10 ** WSOL_DECIMALS;
  const wsolLabel = wsol.toLocaleString(undefined, { maximumFractionDigits: WSOL_DECIMALS });

  const handleUnwrap = async () => {
    if (!wallet || busy) return;
    setBusy(true);
    try {
      const res = await unwrapWsolOnChain({ wallet, endpoint });
      addNotification({
        type: "success",
        event: "generic",
        title: "Unwrapped to SOL",
        message: `${wsolLabel} wSOL converted to native SOL. Tx: ${res.signature.slice(0, 8)}…`,
        explorerUrl: res.explorerUrl,
      });
      await refresh();
      setVisible(false);
    } catch (e: any) {
      const msg = String(e?.message || e);
      const rejected = msg.toLowerCase().includes("user rejected") || e?.code === 4001;
      addNotification(
        rejected
          ? { type: "info", event: "generic", title: "Unwrap cancelled", message: "No funds were moved." }
          : { type: "error", event: "generic", title: "Unwrap failed", message: msg }
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed top-20 inset-x-0 z-40 px-4 pointer-events-none">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="pointer-events-auto mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-indigo-500/40 bg-indigo-950/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Coins className="h-5 w-5 shrink-0 text-indigo-300" />
          <div className="text-sm min-w-0">
            <span className="font-bold text-indigo-200">{wsolLabel} wSOL</span>
            <span className="text-zinc-400"> received — convert wrapped SOL back to native SOL.</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleUnwrap}
            disabled={busy}
            title="Unwrap your wSOL back to native SOL"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed px-3.5 py-2 text-xs font-bold text-white transition-all"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
            {busy ? "Unwrapping…" : "Unwrap to SOL"}
          </button>
          <button
            onClick={() => setVisible(false)}
            disabled={busy}
            title="Dismiss"
            aria-label="Dismiss"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-40 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}