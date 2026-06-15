"use client";

import type { ChangeEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AlertTriangle, Check, ChevronDown, Shield, Download, Layers, Lock, RefreshCw, Terminal, Upload, XCircle, Settings } from "lucide-react";
import { CsvDiffPanel } from "@/components/dashboard/csv-diff-panel";
import type { MintPreset } from "@/components/dashboard/token-mints";
import { PreflightChecklist } from "./preflight-checklist";
import { shorten } from "@/components/dashboard/utils";
import { useTokenBalance } from "@/lib/use-token-balance";
import { useAddressHistory } from "@/lib/use-address-history";
import { parseBaseUnits } from "./dashboard-home-client";
import { api } from "@/lib/api";
const QUICK_DURATIONS = [
  { label: "1M", value: 60 * 60 * 24 * 30 },
  { label: "3M", value: 60 * 60 * 24 * 90 },
  { label: "6M", value: 60 * 60 * 24 * 180 },
  { label: "1Y", value: 60 * 60 * 24 * 365 },
];

// ─── Cancel Confirmation Dialog ───────────────────────────────────────────
function CancelConfirmDialog({
  streamId,
  onConfirm,
  onClose,
}: {
  streamId: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLowerCase() === "cancel";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-rose-600 via-red-500 to-orange-500" />

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all"
          aria-label="Close"
        >
          <XCircle className="w-4 h-4" />
        </button>

        <div className="p-6 pt-7">
          {/* Icon */}
          <div className="flex items-center justify-center mb-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
              </div>
              <div className="absolute -inset-2 rounded-3xl bg-rose-500/5 blur-xl -z-10" />
            </div>
          </div>

          {/* Title & description */}
          <div className="text-center mb-5">
            <h3 className="text-lg font-extrabold text-zinc-50 mb-1.5">Cancel Stream?</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This action is <span className="text-rose-400 font-bold">permanent and irreversible</span>.
              All remaining locked tokens will be refunded to the creator wallet.
              The recipient will no longer be able to claim any unvested tokens.
            </p>
          </div>

          {/* Stream ID chip */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2.5 mb-5 text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">Stream being cancelled</div>
            <div className="font-mono text-[11px] text-zinc-300 break-all">{streamId || "—"}</div>
          </div>

          {/* What happens list */}
          <ul className="space-y-2 mb-6">
            {[
              { color: "bg-red-400", text: "Vesting schedule will be permanently terminated" },
              { color: "bg-orange-400", text: "Recipient loses access to all remaining unvested tokens" },
              { color: "bg-yellow-300", text: "Unlocked but unclaimed tokens remain claimable by recipient" },
              { color: "bg-green-400", text: "Locked tokens are refunded to creator wallet immediately" },
            ].map(({ color, text }) => (
              <li
                key={text}
                className="flex items-start gap-2.5 text-[11px] text-zinc-400"
              >
                <span
                  className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${color}`}
                />
                {text}
              </li>
            ))}
          </ul>

          {/* Typed confirmation */}
          <div className="mb-5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Type <span className="text-rose-400 font-extrabold">cancel</span> to confirm
            </label>
            <input
              autoFocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && confirmed) onConfirm(); }}
              placeholder="cancel"
              className={`w-full bg-zinc-900 border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none transition-all placeholder:text-zinc-700 ${
                confirmed
                  ? "border-rose-500/60 text-rose-300 focus:border-rose-500"
                  : "border-zinc-800 text-zinc-300 focus:border-zinc-600"
              }`}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 transition-all"
            >
              Keep Stream
            </button>
            <button
              disabled={!confirmed}
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                confirmed
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/30 hover:shadow-rose-900/50"
                  : "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Cancel Stream
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
// ──────────────────────────────────────────────────────────────────────────

function normalizeDecimalInput(value: string) {
  const replaced = value.replace(/,/g, ".");
  const parts = replaced.split(".");

  if (parts.length <= 2) {
    return replaced;
  }

  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function parseTokenAmountToBaseUnits(value: string, decimals: number) {
  const trimmed = String(value ?? "").trim().replace(/,/g, ".");

  if (trimmed === "" || !/^\d+(\.\d+)?$/.test(trimmed)) {
    return BigInt(0);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedFraction = fractionPart.slice(0, decimals).padEnd(decimals, "0");
  const raw = `${wholePart}${normalizedFraction}`.replace(/^0+(?=\d)/, "");

  try {
    return BigInt(raw || "0");
  } catch {
    return BigInt(0);
  }
}

function formatBaseUnitsToTokenAmount(amount: bigint, decimals: number) {
  if (decimals <= 0) return amount.toString();

  const negative = amount < BigInt(0);
  const unsigned = negative ? (amount * BigInt(-1)).toString() : amount.toString();
  const padded = unsigned.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// Format a duration (in seconds) into a compact "Xd Yh Zm" string. Pure: takes
// an explicit number so it is safe to call during render.
function formatDurationSecs(totalSecs: number) {
  if (!Number.isFinite(totalSecs) || totalSecs <= 0) return "0m";
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 && days === 0) parts.push(`${mins}m`);
  return parts.length > 0 ? parts.join(" ") : "0m";
}

// Format a unix-seconds timestamp into a readable local date/time. Pure: the
// timestamp is explicit (no Date.now()), so this is safe during render.
function formatUnixTs(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return new Date(ts * 1000).toLocaleString();
}
// ─── Unlock Milestone Panel ────────────────────────────────────────────────
function UnlockMilestonePanel({
  unlockForm,
  setUnlockForm,
  handleAction,
  streams,
  connectedWalletAddress,
  activeTxAction,
  activeTxPhase,
  connected,
  endpoint,
}: {
  unlockForm: { streamId: string };
  setUnlockForm: (value: { streamId: string }) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  streams: any[];
  connectedWalletAddress: string | null;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
  endpoint: string;
}) {
  // ── Local detail state ─────────────────────────────────────────────────
  const [streamDetail, setStreamDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Debounced fetch on streamId change ─────────────────────────────────
  useEffect(() => {
    const id = unlockForm.streamId.trim();
    setStreamDetail(null);
    setDetailError(null);

    if (!id) return;

    const timer = setTimeout(async () => {
      setDetailLoading(true);
      try {
        const res = await api.get(`/streams/${id}`);
        setStreamDetail(res.data);
      } catch (err: any) {
        setDetailError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to fetch stream details."
        );
      } finally {
        setDetailLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [unlockForm.streamId]);

  // ── Refetch after successful unlock ───────────────────────────────────
  const prevTxAction = useRef<string | null>(null);
  useEffect(() => {
    const wasUnlocking =
      prevTxAction.current === "unlock_milestone" && activeTxAction === null;
    prevTxAction.current = activeTxAction;
    if (!wasUnlocking) return;

    const id = unlockForm.streamId.trim();
    if (!id) return;
    api
      .get(`/streams/${id}`)
      .then((res) => setStreamDetail(res.data))
      .catch(() => {});
  }, [activeTxAction, unlockForm.streamId]);

  // ── Summary stream dari streams[] (for creator/type guard) ────────────
  const streamSummary = useMemo(
    () =>
      streams.find(
        (s) => String(s?.id || "") === unlockForm.streamId.trim()
      ) ?? null,
    [streams, unlockForm.streamId]
  );

  // Prefer detail data kalau sudah ada, fallback ke summary
  const stream = streamDetail ?? streamSummary;

  // ── Wallet vs creator check ────────────────────────────────────────────
  const isWrongWallet =
    !!unlockForm.streamId.trim() &&
    !!stream &&
    !!connectedWalletAddress &&
    stream.creator?.toLowerCase() !== connectedWalletAddress.toLowerCase();

  // ── Stream type / status guards ────────────────────────────────────────
  const isNotMilestoneType =
    !!stream && Number(stream.vestingType ?? -1) !== 2;
  const isStreamCancelled = !!stream && Number(stream.status) === 3;
  const isStreamCompleted = !!stream && Number(stream.status) === 2;

  // ── Milestone list dari /streams/:id ──────────────────────────────────
 const milestonePreview = useMemo(() => {
  if (!streamDetail) return null;

  const decimals =
    typeof streamDetail.mintDecimals === "number"
      ? streamDetail.mintDecimals
      : 6;

  const milestoneCount = Number(streamDetail.milestoneCount ?? 0);
  if (milestoneCount === 0) return null;

  // ── Parse amounts dari semicolon string ───────────────────────────────
  const rawStr = String(streamDetail.milestones || "").trim();
  const rawAmounts: bigint[] = rawStr
    ? rawStr.split(";").map((v) => {
        try { return BigInt(v.trim()); } catch { return BigInt(0); }
      })
    : [];

  // Fallback distribusi merata
  const totalBase = parseBaseUnits(streamDetail.totalAmount);
  let amounts: bigint[];
  if (rawAmounts.length === milestoneCount) {
    amounts = rawAmounts;
  } else {
    const base = totalBase / BigInt(milestoneCount);
    const remainder = totalBase % BigInt(milestoneCount);
    amounts = Array.from({ length: milestoneCount }, (_, i) =>
      base + (BigInt(i) < remainder ? BigInt(1) : BigInt(0))
    );
  }

  // ── Derive nextIndex dari unlockedAmount ──────────────────────────────
  // Hitung cumulative sum sampai cocok dengan unlockedAmount
  // Ini akurat karena unlock selalu sequential
  const unlockedAmountBase = parseBaseUnits(
    streamDetail.unlockedAmount ?? streamDetail.unlocked_amount ?? 0
  );

  let derivedNextIndex = 0;
  let cumulativeSum = BigInt(0);
  for (let i = 0; i < milestoneCount; i++) {
    cumulativeSum += amounts[i];
    if (cumulativeSum <= unlockedAmountBase) {
      derivedNextIndex = i + 1;
    } else {
      break;
    }
  }

  // Fallback ke field kalau ada (untuk future-proofing)
  const nextIndex =
    streamDetail.nextMilestoneIndex ??
    streamDetail.next_milestone_index ??
    derivedNextIndex;

  // ── Derive unlock timestamps dari transactions[] ───────────────────────
  const unlockTxs = (streamDetail.transactions ?? [])
    .filter((tx: any) => tx.type === "MILESTONE_UNLOCKED")
    .sort((a: any, b: any) => Number(a.slot) - Number(b.slot));

  const fmt = (v: bigint) =>
    Number(formatBaseUnitsToTokenAmount(v, decimals)).toLocaleString(
      undefined,
      { maximumFractionDigits: decimals }
    );

  // ── Build items ────────────────────────────────────────────────────────
  const items = Array.from({ length: milestoneCount }, (_, i) => {
    const amountBase = amounts[i] ?? BigInt(0);
    const isUnlocked = i < nextIndex;
    const isNext = i === nextIndex;
    const isLocked = i > nextIndex;
    const unlockTx = isUnlocked ? (unlockTxs[i] ?? null) : null;
    const unlockTs = unlockTx?.raw?.blockTime ?? null;

    return {
      index: i,
      amountBase,
      amount: fmt(amountBase),
      isUnlocked,
      isNext,
      isLocked,
      unlockTs,
    };
  });

  // ── Totals ─────────────────────────────────────────────────────────────
  const unlockedTotal = items
    .filter((m) => m.isUnlocked)
    .reduce((sum, m) => sum + m.amountBase, BigInt(0));
  const lockedTotal = items
    .filter((m) => m.isNext || m.isLocked)
    .reduce((sum, m) => sum + m.amountBase, BigInt(0));

  const allUnlocked = nextIndex >= milestoneCount;
  const nextMilestone = items.find((m) => m.isNext) ?? null;

  return {
    items,
    milestoneCount,
    nextIndex,
    unlockedCount: nextIndex,
    lockedCount: milestoneCount - nextIndex,
    unlockedAmount: fmt(unlockedTotal),
    lockedAmount: fmt(lockedTotal),
    nextMilestone,
    allUnlocked,
  };
}, [streamDetail]);

  const isSubmitting = activeTxAction === "unlock_milestone" && !!activeTxPhase;

  const getTxLabel = () => {
    if (activeTxAction !== "unlock_milestone" || !activeTxPhase)
      return milestonePreview?.nextMilestone
        ? `Unlock Milestone #${milestonePreview.nextMilestone.index}`
        : "Unlock Milestone";
    if (activeTxPhase === "wallet_approval") return "Approve In Wallet...";
    if (activeTxPhase === "sending") return "Sending Transaction...";
    return "Confirming On-Chain...";
  };

  const canSubmit =
    !!unlockForm.streamId.trim() &&
    !isSubmitting &&
    !isWrongWallet &&
    !isNotMilestoneType &&
    !isStreamCancelled &&
    !isStreamCompleted &&
    !detailLoading &&
    connected &&
    (milestonePreview ? !milestonePreview.allUnlocked : true);

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Unlock Milestone
        </h2>
        <p className="text-xs text-zinc-400">
          Release milestone allocations sequentially — only the creator can
          unlock each milestone in order
        </p>
      </div>

      {/* Stream ID input */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
          Stream ID (PDA Address)
        </label>
        <div className="relative">
          <input
            type="text"
            value={unlockForm.streamId}
            onChange={(e) =>
              setUnlockForm({ ...unlockForm, streamId: e.target.value })
            }
            placeholder="Paste stream PDA address"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono pr-10"
          />
          {/* Loading spinner inside input */}
          {detailLoading && (
            <div className="absolute inset-y-0 right-3 flex items-center">
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            </div>
          )}
        </div>

        {/* Fetch status row */}
        <div className="mt-1.5 h-4 flex items-center">
          {detailLoading && (
            <span className="text-[10px] font-mono text-zinc-600 animate-pulse">
              fetching stream details…
            </span>
          )}
          {detailError && !detailLoading && (
            <span className="text-[10px] font-semibold text-rose-400">
              {detailError}
            </span>
          )}
          {streamDetail && !detailLoading && !detailError && (
            <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Stream loaded
            </span>
          )}
        </div>
      </div>

      {/* ── Wrong wallet warning ─────────────────────────────────────────── */}
      {isWrongWallet && (
        <div className="mb-5 bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-amber-300 mb-1">
              Wrong wallet connected
            </p>
            <p className="text-[11px] text-amber-300/70 leading-relaxed">
              Only the stream creator can unlock milestones. This stream was
              created by{" "}
              <span className="font-mono text-amber-300 break-all">
                {stream?.creator
                  ? `${stream.creator.slice(0, 6)}…${stream.creator.slice(-4)}`
                  : "unknown"}
              </span>
              , but your connected wallet is{" "}
              <span className="font-mono text-amber-300 break-all">
                {`${connectedWalletAddress!.slice(0, 6)}…${connectedWalletAddress!.slice(-4)}`}
              </span>
              .
            </p>
          </div>
        </div>
      )}

      {/* ── Wrong vesting type warning ───────────────────────────────────── */}
      {isNotMilestoneType && (
        <div className="mb-5 bg-zinc-900/60 border border-zinc-700 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-zinc-300 mb-1">
              Not a milestone stream
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              This stream uses{" "}
              {Number(stream?.vestingType) === 0 ? "Linear" : "Cliff"} vesting
              — milestone unlock only applies to Milestone type streams.
            </p>
          </div>
        </div>
      )}

      {/* ── Cancelled warning ────────────────────────────────────────────── */}
      {isStreamCancelled && (
        <div className="mb-5 bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-300/80 leading-relaxed">
            This stream has been{" "}
            <strong className="text-rose-300">cancelled</strong>. Milestones
            can no longer be unlocked.
          </p>
        </div>
      )}

      {/* ── Milestone list preview ───────────────────────────────────────── */}
      {milestonePreview && !isNotMilestoneType && (
        <div className="mb-5 rounded-2xl border border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900 bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Milestone Progress
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-zinc-600">
                {milestonePreview.unlockedCount}/
                {milestonePreview.milestoneCount} unlocked
              </span>
              {milestonePreview.allUnlocked && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400">
                  All Done
                </span>
              )}
              {isStreamCompleted && !milestonePreview.allUnlocked && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400">
                  Completed
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-4 pt-4 pb-3 border-b border-zinc-900/60">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                Overall unlock progress
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {milestonePreview.milestoneCount > 0
                  ? (
                      (milestonePreview.unlockedCount /
                        milestonePreview.milestoneCount) *
                      100
                    ).toFixed(0)
                  : 0}
                %
              </span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    milestonePreview.milestoneCount > 0
                      ? (milestonePreview.unlockedCount /
                          milestonePreview.milestoneCount) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[9px] text-zinc-600">
                  Unlocked: {milestonePreview.unlockedAmount}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                <span className="text-[9px] text-zinc-600">
                  Locked: {milestonePreview.lockedAmount}
                </span>
              </div>
            </div>
          </div>

          {/* Milestone rows */}
          <div className="divide-y divide-zinc-900/60 max-h-72 overflow-y-auto">
            {milestonePreview.items.map((m) => (
              <div
                key={m.index}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  m.isNext
                    ? "bg-indigo-950/10"
                    : m.isUnlocked
                    ? "bg-zinc-950/20"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  {m.isUnlocked ? (
                    <div className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-amber-400" />
                    </div>
                  ) : m.isNext ? (
                    <div className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center shrink-0 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-indigo-400" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      <Lock className="w-3 h-3 text-zinc-600" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-bold ${
                          m.isUnlocked
                            ? "text-zinc-500"
                            : m.isNext
                            ? "text-indigo-300"
                            : "text-zinc-600"
                        }`}
                      >
                        Milestone #{m.index}
                      </span>
                      {m.isNext && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                          Next
                        </span>
                      )}
                      {m.isUnlocked && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500">
                          Unlocked
                        </span>
                      )}
                    </div>
                    {/* Unlock timestamp kalau ada */}
                    {m.isUnlocked && m.unlockTs && (
                      <div className="text-[9px] font-mono text-zinc-600 mt-0.5">
                        {new Date(
                          Number(m.unlockTs) * 1000
                        ).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <span
                  className={`font-mono text-sm font-bold ${
                    m.isUnlocked
                      ? "text-zinc-600"
                      : m.isNext
                      ? "text-indigo-300"
                      : "text-zinc-700"
                  }`}
                >
                  {m.amount}
                </span>
              </div>
            ))}
          </div>

          {/* All unlocked footer */}
          {milestonePreview.allUnlocked && (
            <div className="px-4 py-3 border-t border-zinc-900 bg-emerald-950/10 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-[10px] text-emerald-300/80">
                All{" "}
                <span className="font-bold">
                  {milestonePreview.milestoneCount}
                </span>{" "}
                milestones unlocked. The recipient can now claim the full
                allocation.
              </p>
            </div>
          )}

          {/* Sequential note */}
          {!milestonePreview.allUnlocked && milestonePreview.nextMilestone && (
            <div className="px-4 py-3 border-t border-zinc-900 flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0 mt-1.5" />
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Milestones must be unlocked in order. Unlock{" "}
                <span className="font-bold text-zinc-500">
                  #{milestonePreview.nextMilestone.index}
                </span>{" "}
                before proceeding to{" "}
                <span className="font-bold text-zinc-500">
                  #{milestonePreview.nextMilestone.index + 1}
                </span>
                .
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stream not found hint — hanya kalau bukan loading dan bukan error */}
      {unlockForm.streamId.trim() &&
        !stream &&
        !detailLoading &&
        !detailError && (
          <div className="mb-5 bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <span className="text-[11px] text-zinc-500">
              Stream not found in index — preview unavailable until the indexer
              syncs.
            </span>
          </div>
        )}

      {/* Submit button */}
      <button
        disabled={!canSubmit}
        onClick={() => handleAction("unlock_milestone", unlockForm)}
        className={`w-full mt-2 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
          !canSubmit
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
            : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Layers className="w-4 h-4" />
        )}
        {!connected
          ? "Connect wallet to unlock"
          : detailLoading
          ? "Loading stream..."
          : isWrongWallet
          ? "Wrong wallet — switch to creator wallet"
          : isNotMilestoneType
          ? "Not a milestone stream"
          : isStreamCancelled
          ? "Stream cancelled"
          : milestonePreview?.allUnlocked
          ? "All milestones already unlocked"
          : getTxLabel()}
      </button>
    </div>
  );
}
// ─── Withdraw Panel ────────────────────────────────────────────────────────
function WithdrawPanel({
  withdrawForm,
  setWithdrawForm,
  handleAction,
  streams,
  connectedWalletAddress,
  activeTxAction,
  activeTxPhase,
  connected,
}: {
  withdrawForm: { streamId: string };
  setWithdrawForm: (value: { streamId: string }) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  streams: any[];
  connectedWalletAddress: string | null;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
}) {
  const feeEstimate = useFeeEstimate();

  // ── Resolve stream ─────────────────────────────────────────────────────
  const stream = useMemo(
    () =>
      streams.find(
        (s) => String(s?.id || "") === withdrawForm.streamId.trim()
      ) ?? null,
    [streams, withdrawForm.streamId]
  );

  // ── Wallet vs recipient check ──────────────────────────────────────────
  const isWrongWallet =
    !!withdrawForm.streamId.trim() &&
    !!stream &&
    !!connectedWalletAddress &&
    stream.recipient?.toLowerCase() !== connectedWalletAddress.toLowerCase();

  // ── Claimable preview ──────────────────────────────────────────────────
  const withdrawPreview = useMemo(() => {
    if (!stream) return null;

    const decimals =
      typeof stream.mintDecimals === "number" ? stream.mintDecimals : 6;
    const nowTs = Math.floor(Date.now() / 1000);
    const totalBase = parseBaseUnits(stream.totalAmount);
    const withdrawnBase = parseBaseUnits(stream.withdrawn ?? 0);

    const vestingType = Number(stream.vestingType ?? 0);
    const startTs = Number(stream.startTs ?? 0);
    const endTs = Number(stream.endTs ?? 0);
    const cliffTs = Number(stream.cliffTs ?? 0);

    let vestedBase: bigint;

    if (vestingType === 2) {
      vestedBase = parseBaseUnits(
        stream.unlockedAmount ?? stream.unlocked_milestone_amount ?? 0
      );
    } else if (nowTs < startTs) {
      vestedBase = BigInt(0);
    } else if (vestingType === 1 && nowTs < cliffTs) {
      vestedBase = BigInt(0);
    } else if (nowTs >= endTs) {
      vestedBase = totalBase;
    } else {
      const elapsed = BigInt(nowTs - startTs);
      const duration = BigInt(Math.max(endTs - startTs, 1));
      vestedBase = (totalBase * elapsed) / duration;
    }

    const claimableBase =
      vestedBase > withdrawnBase ? vestedBase - withdrawnBase : BigInt(0);

    const fmt = (v: bigint) =>
      Number(formatBaseUnitsToTokenAmount(v, decimals)).toLocaleString(
        undefined,
        { maximumFractionDigits: decimals }
      );

    // Progress pct: withdrawn / total
    const totalNum = Number(totalBase);
    const withdrawnNum = Number(withdrawnBase);
    const vestedNum = Number(vestedBase);
    const claimableNum = Number(claimableBase);

    const withdrawnPct = totalNum > 0 ? (withdrawnNum / totalNum) * 100 : 0;
    const vestedPct = totalNum > 0 ? (vestedNum / totalNum) * 100 : 0;
    const claimablePct = totalNum > 0 ? (claimableNum / totalNum) * 100 : 0;

    // Time remaining
    const streamActive = Number(stream.status ?? 1) === 1;
    const secondsRemaining = Math.max(0, endTs - nowTs);
    const daysRemaining = Math.floor(secondsRemaining / 86400);
    const hoursRemaining = Math.floor((secondsRemaining % 86400) / 3600);

    // Cliff state (for cliff type)
    const cliffPending = vestingType === 1 && nowTs < cliffTs;
    const cliffSecondsRemaining = Math.max(0, cliffTs - nowTs);
    const cliffDaysRemaining = Math.floor(cliffSecondsRemaining / 86400);
    const cliffHoursRemaining = Math.floor(
      (cliffSecondsRemaining % 86400) / 3600
    );

    const isCompleted = Number(stream.status) === 2;
    const isCancelled = Number(stream.status) === 3;

    return {
      total: fmt(totalBase),
      withdrawn: fmt(withdrawnBase),
      claimable: fmt(claimableBase),
      vested: fmt(vestedBase),
      hasClaimable: claimableBase > BigInt(0),
      withdrawnPct,
      vestedPct,
      claimablePct,
      vestingType,
      streamActive,
      isCompleted,
      isCancelled,
      daysRemaining,
      hoursRemaining,
      cliffPending,
      cliffDaysRemaining,
      cliffHoursRemaining,
      decimals,
    };
  }, [stream]);

  const withdrawFeeUsd =
    feeEstimate.solCost && feeEstimate.solPrice
      ? feeEstimate.solCost * feeEstimate.solPrice
      : null;

  const isSubmitting = activeTxAction === "withdraw" && !!activeTxPhase;

  const getTxLabel = () => {
    if (activeTxAction !== "withdraw" || !activeTxPhase)
      return "Claim Claimable Tokens";
    if (activeTxPhase === "wallet_approval") return "Approve In Wallet...";
    if (activeTxPhase === "sending") return "Sending Transaction...";
    return "Confirming On-Chain...";
  };

  const canSubmit =
    !!withdrawForm.streamId.trim() &&
    !isSubmitting &&
    !isWrongWallet &&
    connected &&
    (withdrawPreview ? withdrawPreview.hasClaimable : true) &&
    !(withdrawPreview?.isCancelled);

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Withdraw Claim
        </h2>
        <p className="text-xs text-zinc-400">
          Withdraw matured/unlocked tokens from an active vesting stream
        </p>
      </div>

      {/* Stream ID input */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
          Stream ID (PDA Address)
        </label>
        <input
          type="text"
          value={withdrawForm.streamId}
          onChange={(e) =>
            setWithdrawForm({ ...withdrawForm, streamId: e.target.value })
          }
          placeholder="Paste stream PDA address"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
        />
      </div>

      {/* ── Wrong wallet warning ─────────────────────────────────────────── */}
      {isWrongWallet && (
        <div className="mb-5 bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-amber-300 mb-1">
              Wrong wallet connected
            </p>
            <p className="text-[11px] text-amber-300/70 leading-relaxed">
              Only the stream recipient can withdraw. This stream pays to{" "}
              <span className="font-mono text-amber-300 break-all">
                {stream?.recipient
                  ? `${stream.recipient.slice(0, 6)}…${stream.recipient.slice(-4)}`
                  : "unknown"}
              </span>
              , but your connected wallet is{" "}
              <span className="font-mono text-amber-300 break-all">
                {`${connectedWalletAddress!.slice(0, 6)}…${connectedWalletAddress!.slice(-4)}`}
              </span>
              .
            </p>
          </div>
        </div>
      )}

      {/* ── Claimable preview + fee card ────────────────────────────────── */}
      {withdrawPreview ? (
        <div className="mb-5 rounded-2xl border border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900 bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  withdrawPreview.isCancelled
                    ? "bg-rose-500"
                    : withdrawPreview.isCompleted
                    ? "bg-zinc-500"
                    : withdrawPreview.hasClaimable
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-amber-400"
                }`}
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Withdraw Preview
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-600">
                {withdrawPreview.vestingType === 0
                  ? "Linear"
                  : withdrawPreview.vestingType === 1
                  ? "Cliff"
                  : "Milestone"}
              </span>
              {withdrawPreview.isCancelled && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-950/50 border border-rose-500/30 text-rose-400">
                  Cancelled
                </span>
              )}
              {withdrawPreview.isCompleted && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400">
                  Completed
                </span>
              )}
            </div>
          </div>

          {/* ── Progress bar ── */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                Vesting Progress
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {withdrawPreview.vestedPct.toFixed(1)}% vested
              </span>
            </div>
            {/* Stacked bar: withdrawn (zinc) + claimable (emerald) + locked (zinc-900) */}
            <div className="relative h-2.5 w-full rounded-full bg-zinc-900 overflow-hidden">
              {/* Already withdrawn */}
              <div
                className="absolute left-0 top-0 h-full bg-zinc-600 rounded-l-full transition-all duration-500"
                style={{ width: `${withdrawPreview.withdrawnPct}%` }}
              />
              {/* Claimable now */}
              <div
                className="absolute top-0 h-full bg-emerald-500 transition-all duration-500"
                style={{
                  left: `${withdrawPreview.withdrawnPct}%`,
                  width: `${withdrawPreview.claimablePct}%`,
                }}
              />
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span className="text-[9px] text-zinc-600">Withdrawn</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[9px] text-zinc-600">Claimable now</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 border border-zinc-700" />
                <span className="text-[9px] text-zinc-600">Still locked</span>
              </div>
            </div>
          </div>

          {/* ── Token amounts ── */}
          <div className="divide-y divide-zinc-900/60 mt-1">
            {/* Claimable now — highlight */}
            <div
              className={`flex items-center justify-between px-4 py-3 ${
                withdrawPreview.hasClaimable ? "bg-emerald-950/10" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs text-zinc-300 font-semibold">
                  Claimable now
                </span>
              </div>
              <span
                className={`font-mono text-sm font-black ${
                  withdrawPreview.hasClaimable
                    ? "text-emerald-400"
                    : "text-zinc-600"
                }`}
              >
                {withdrawPreview.claimable}
              </span>
            </div>

            {/* Already withdrawn */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
                <span className="text-xs text-zinc-500">Already withdrawn</span>
              </div>
              <span className="font-mono text-sm font-bold text-zinc-500">
                {withdrawPreview.withdrawn}
              </span>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/40">
              <span className="text-xs font-bold text-zinc-400">
                Total allocation
              </span>
              <span className="font-mono text-sm font-bold text-zinc-200">
                {withdrawPreview.total}
              </span>
            </div>
          </div>

          {/* ── Status notes ── */}
          {withdrawPreview.cliffPending && (
            <div className="px-4 py-3 border-t border-zinc-900 bg-violet-950/10 flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-1" />
              <p className="text-[10px] text-violet-300/80 leading-relaxed">
                Cliff not yet reached — tokens unlock in{" "}
                <span className="font-bold text-violet-300">
                  {withdrawPreview.cliffDaysRemaining}d{" "}
                  {withdrawPreview.cliffHoursRemaining}h
                </span>
                .
              </p>
            </div>
          )}

          {!withdrawPreview.hasClaimable &&
            !withdrawPreview.cliffPending &&
            !withdrawPreview.isCancelled &&
            !withdrawPreview.isCompleted && (
              <div className="px-4 py-3 border-t border-zinc-900 bg-amber-950/10 flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1" />
                <p className="text-[10px] text-amber-300/80 leading-relaxed">
                  No tokens available to claim yet. Vesting has not started or
                  no new tokens have vested since the last withdrawal.
                </p>
              </div>
            )}

          {withdrawPreview.isCancelled && (
            <div className="px-4 py-3 border-t border-zinc-900 bg-rose-950/10 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-rose-300/80 leading-relaxed">
                This stream has been cancelled. No further withdrawals are
                possible.
              </p>
            </div>
          )}

          {withdrawPreview.streamActive &&
            withdrawPreview.vestingType !== 2 &&
            !withdrawPreview.cliffPending && (
              <div className="px-4 py-3 border-t border-zinc-900 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />
                <p className="text-[10px] text-zinc-600">
                  Stream ends in{" "}
                  <span className="text-zinc-500 font-semibold">
                    {withdrawPreview.daysRemaining}d{" "}
                    {withdrawPreview.hoursRemaining}h
                  </span>
                </p>
              </div>
            )}

          {/* ── Protocol fee section ── */}
          <div className="border-t border-amber-500/10 bg-amber-950/5">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-500/10">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <svg
                    className="w-3 h-3 text-amber-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v2m0 8v2M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 3-5 3-5 6h5M12 17h.01" />
                  </svg>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/80">
                  Protocol Fee (per withdraw)
                </span>
              </div>
              <button
                onClick={feeEstimate.refetch}
                disabled={feeEstimate.loading}
                title="Refresh SOL price"
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all disabled:opacity-40"
              >
                <RefreshCw
                  className={`w-3 h-3 ${feeEstimate.loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-100">$0.99 USD</div>
                {feeEstimate.solPrice && (
                  <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                    @ ${feeEstimate.solPrice.toFixed(2)}/SOL
                  </div>
                )}
              </div>
              <div className="text-right">
                {feeEstimate.loading ? (
                  <span className="text-xs text-zinc-500 font-mono animate-pulse">
                    fetching...
                  </span>
                ) : feeEstimate.error || !feeEstimate.solCost ? (
                  <span className="text-xs text-zinc-500 font-mono">
                    unavailable
                  </span>
                ) : (
                  <>
                    <div className="font-mono text-sm font-extrabold text-amber-300">
                      ◎ {feeEstimate.solCost.toFixed(6)} SOL
                    </div>
                    {withdrawFeeUsd && (
                      <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                        ≈ ${withdrawFeeUsd.toFixed(2)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="px-4 pb-3">
              <p className="text-[10px] text-amber-300/50 leading-relaxed">
                Charged in SOL from your wallet on every{" "}
                <code className="font-mono bg-amber-950/40 px-1 rounded">
                  withdraw
                </code>{" "}
                call, regardless of claim size.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Stream not found — tampilkan fee card standalone ── */
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-950/10 overflow-hidden mb-5">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-500/10">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-amber-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v2m0 8v2M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 3-5 3-5 6h5M12 17h.01" />
                </svg>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-400/80">
                Protocol Fee (per withdraw call)
              </span>
            </div>
            <button
              onClick={feeEstimate.refetch}
              disabled={feeEstimate.loading}
              title="Refresh SOL price"
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all disabled:opacity-40"
            >
              <RefreshCw
                className={`w-3 h-3 ${feeEstimate.loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <div className="px-4 py-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Fixed fee (USD)</span>
              <span className="font-mono text-sm font-extrabold text-zinc-100">
                $0.99
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Estimated SOL cost
                {feeEstimate.solPrice && (
                  <span className="ml-1.5 text-[10px] text-zinc-600">
                    @ ${feeEstimate.solPrice.toFixed(2)}/SOL
                  </span>
                )}
              </span>
              {feeEstimate.loading ? (
                <span className="text-xs text-zinc-500 font-mono animate-pulse">
                  fetching...
                </span>
              ) : feeEstimate.error || !feeEstimate.solCost ? (
                <span className="text-xs text-zinc-500 font-mono">
                  unavailable
                </span>
              ) : (
                <span className="font-mono text-sm font-extrabold text-amber-300">
                  ◎ {feeEstimate.solCost.toFixed(6)} SOL
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 pt-1 border-t border-amber-500/10">
              <div className="mt-0.5 w-1 h-1 rounded-full bg-amber-400/60 shrink-0" />
              <p className="text-[10px] text-amber-300/60 leading-relaxed">
                Fee is charged in SOL from{" "}
                <span className="font-bold text-amber-300/80">your wallet</span>{" "}
                on every{" "}
                <code className="font-mono bg-amber-950/40 px-1 rounded">
                  withdraw
                </code>{" "}
                call, regardless of how many tokens are claimed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stream not found hint */}
      {withdrawForm.streamId.trim() && !stream && (
        <div className="mb-5 bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          <span className="text-[11px] text-zinc-500">
            Stream not found in local index — preview unavailable until the
            indexer syncs.
          </span>
        </div>
      )}

      {/* Submit button */}
      <button
        disabled={!canSubmit}
        onClick={() => handleAction("withdraw", withdrawForm)}
        className={`w-full text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
          !canSubmit
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
            : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : null}
        {!connected
          ? "Connect wallet to withdraw"
          : isWrongWallet
          ? "Wrong wallet — switch to recipient wallet"
          : withdrawPreview?.isCancelled
          ? "Stream cancelled — cannot withdraw"
          : !withdrawPreview?.hasClaimable && withdrawPreview
          ? "No tokens to claim yet"
          : getTxLabel()}
      </button>
    </div>
  );
}
// ─── Cancel Panel ─────────────────────────────────────────────────────────
function CancelPanel({
  cancelForm,
  setCancelForm,
  handleAction,
  isSubmitting,
  submitLabel,
  streams,
  connectedWalletAddress,
}: {
  cancelForm: { streamId: string };
  setCancelForm: (value: { streamId: string }) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  isSubmitting: boolean;
  submitLabel: string;
  streams: any[];
  connectedWalletAddress: string | null;
}) {
  const [showDialog, setShowDialog] = useState(false);

  // ── Resolve stream dari streams[] ──────────────────────────────────────
  const stream = useMemo(
    () => streams.find((s) => String(s?.id || "") === cancelForm.streamId.trim()) ?? null,
    [streams, cancelForm.streamId]
  );

  // ── Wallet vs creator check ────────────────────────────────────────────
  const isWrongWallet =
    !!cancelForm.streamId.trim() &&
    !!stream &&
    !!connectedWalletAddress &&
    stream.creator?.toLowerCase() !== connectedWalletAddress.toLowerCase();

  const isNotConnected = !connectedWalletAddress;

  // ── Token breakdown preview ────────────────────────────────────────────
  const cancelPreview = useMemo(() => {
    if (!stream) return null;

    const decimals = typeof stream.mintDecimals === "number" ? stream.mintDecimals : 6;
    const nowTs = Math.floor(Date.now() / 1000);
    const totalBase = parseBaseUnits(stream.totalAmount);
    const withdrawnBase = parseBaseUnits(stream.withdrawn ?? 0);

    // Hitung vested amount berdasarkan vesting type
    let vestedBase: bigint;
    const vestingType = Number(stream.vestingType ?? 0);
    const startTs = Number(stream.startTs ?? 0);
    const endTs = Number(stream.endTs ?? 0);
    const cliffTs = Number(stream.cliffTs ?? 0);

    if (vestingType === 2) {
      // Milestone: vested = unlocked milestone amount
      vestedBase = parseBaseUnits(stream.unlockedAmount ?? stream.unlocked_milestone_amount ?? 0);
    } else if (nowTs < startTs) {
      vestedBase = BigInt(0);
    } else if (vestingType === 1 && nowTs < cliffTs) {
      // Cliff: belum lewat cliff
      vestedBase = BigInt(0);
    } else if (nowTs >= endTs) {
      vestedBase = totalBase;
    } else {
      const elapsed = BigInt(nowTs - startTs);
      const duration = BigInt(Math.max(endTs - startTs, 1));
      vestedBase = (totalBase * elapsed) / duration;
    }

    const claimableForRecipient =
      vestedBase > withdrawnBase ? vestedBase - withdrawnBase : BigInt(0);
    const returnedToCreator =
      totalBase > vestedBase ? totalBase - vestedBase : BigInt(0);

    const fmt = (v: bigint) =>
      Number(formatBaseUnitsToTokenAmount(v, decimals)).toLocaleString(undefined, {
        maximumFractionDigits: decimals,
      });

    return {
      total: fmt(totalBase),
      withdrawn: fmt(withdrawnBase),
      claimableForRecipient: fmt(claimableForRecipient),
      returnedToCreator: fmt(returnedToCreator),
      hasAnything: totalBase > BigInt(0),
      isPureZeroReturn: returnedToCreator === BigInt(0),
    };
  }, [stream]);

  const handleConfirm = () => {
    setShowDialog(false);
    handleAction("cancel", cancelForm);
  };

  const canSubmit =
    !!cancelForm.streamId.trim() &&
    !isSubmitting &&
    !isWrongWallet &&
    !isNotConnected;

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Cancel Stream</h2>
        <p className="text-xs text-zinc-400">Cancel vesting and refund remaining locked tokens back to creator</p>
      </div>

      {/* Stream ID */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
          Stream ID (PDA Address)
        </label>
        <input
          type="text"
          value={cancelForm.streamId}
          onChange={(e) => setCancelForm({ ...cancelForm, streamId: e.target.value })}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600 font-mono"
          placeholder="Paste stream PDA address"
        />
      </div>

      {/* ── Wrong wallet warning ───────────────────────────────────────── */}
      {isWrongWallet && (
        <div className="mb-5 bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-amber-300 mb-1">Wrong wallet connected</p>
            <p className="text-[11px] text-amber-300/70 leading-relaxed">
              Only the stream creator can cancel. This stream was created by{" "}
              <span className="font-mono text-amber-300 break-all">
                {stream?.creator
                  ? `${stream.creator.slice(0, 6)}…${stream.creator.slice(-4)}`
                  : "unknown"}
              </span>
              , but your connected wallet is{" "}
              <span className="font-mono text-amber-300 break-all">
                {`${connectedWalletAddress!.slice(0, 6)}…${connectedWalletAddress!.slice(-4)}`}
              </span>
              .
            </p>
          </div>
        </div>
      )}

      {/* ── Token breakdown preview ────────────────────────────────────── */}
      {cancelPreview && cancelPreview.hasAnything && (
        <div className="mb-5 rounded-2xl border border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-900 bg-zinc-950/60">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Cancel Preview
            </span>
            {stream && (
              <span className="ml-auto text-[10px] font-mono text-zinc-600">
                {Number(stream.vestingType) === 0
                  ? "Linear"
                  : Number(stream.vestingType) === 1
                  ? "Cliff"
                  : "Milestone"}
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-900/60">
            {/* Returned to creator */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs text-zinc-400">Returned to creator</span>
              </div>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {cancelPreview.returnedToCreator}
              </span>
            </div>

            {/* Claimable by recipient */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs text-zinc-400">Claimable by recipient</span>
              </div>
              <span className="font-mono text-sm font-bold text-amber-400">
                {cancelPreview.claimableForRecipient}
              </span>
            </div>

            {/* Already withdrawn */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
                <span className="text-xs text-zinc-500">Already withdrawn (non-refundable)</span>
              </div>
              <span className="font-mono text-sm font-bold text-zinc-500">
                {cancelPreview.withdrawn}
              </span>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/40">
              <span className="text-xs font-bold text-zinc-400">Total locked</span>
              <span className="font-mono text-sm font-bold text-zinc-200">
                {cancelPreview.total}
              </span>
            </div>
          </div>

          {/* Zero-return warning */}
          {cancelPreview.isPureZeroReturn && (
            <div className="px-4 py-3 border-t border-zinc-900 bg-amber-950/10 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-300/80 leading-relaxed">
                All tokens are already vested — nothing will be returned to the creator. Consider letting the stream complete naturally instead.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stream not found hint */}
      {cancelForm.streamId.trim() && !stream && (
        <div className="mb-5 bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          <span className="text-[11px] text-zinc-500">Stream not found in local index — preview unavailable until the indexer syncs.</span>
        </div>
      )}

      {/* Permanent warning card */}
      <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-rose-300/80 leading-relaxed">
          Cancelling a stream is <strong className="text-rose-300">permanent</strong>. The recipient will lose access
          to all unvested tokens. Locked funds will be returned to the creator wallet on-chain.
        </p>
      </div>

      {/* Trigger button */}
      <button
        disabled={!canSubmit}
        onClick={() => setShowDialog(true)}
        className={`w-full font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
          !canSubmit
            ? "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed shadow-none"
            : "bg-rose-950/30 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 hover:border-rose-600 hover:shadow-rose-900/30"
        }`}
      >
        {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
        {isNotConnected
          ? "Connect wallet to cancel"
          : isWrongWallet
          ? "Wrong wallet — switch to creator wallet"
          : submitLabel}
      </button>

      {showDialog && (
        <CancelConfirmDialog
          streamId={cancelForm.streamId}
          onConfirm={handleConfirm}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  activeTab: string;
  useMultisig: boolean;
  setUseMultisig: (value: boolean) => void;
  createMode: "manual" | "csv";
  setCreateMode: (value: "manual" | "csv") => void;
  clusterLabel: string;
  mintPresets: MintPreset[];
  createForm: any;
  setCreateForm: (value: any) => void;
  onMilestoneCountChange: (value: string) => void;
  milestoneAmounts: string[];
  setMilestoneAmounts: (value: string[]) => void;
  csvCreateText: string;
  setCsvCreateText: (value: string) => void;
  csvEditText: string;
  setCsvEditText: (value: string) => void;
  compareVersionSelected: string;
  setCompareVersionSelected: (value: string) => void;
  csvVersions: any[];
  handleDeleteCsvVersion: () => void;
  csvDiffResult: any;
  setCsvDiffResult: (value: any) => void;
  loadingDiff: boolean;
  handleAnalyzeDiff: (mode: "create" | "edit") => void;
  handleAction: (actionName: string, data: any) => void;
  downloadTemplate: (mode: "create" | "edit") => void;
  fileInputCreateRef: RefObject<HTMLInputElement | null>;
  fileInputEditRef: RefObject<HTMLInputElement | null>;
  handleCsvUpload: (e: ChangeEvent<HTMLInputElement>, mode: "create" | "edit") => void;
  withdrawForm: any;
  setWithdrawForm: (value: any) => void;
  cancelForm: any;
  setCancelForm: (value: any) => void;
  unlockForm: any;
  setUnlockForm: (value: any) => void;
  editMilestoneForm: any;
  setEditMilestoneForm: (value: any) => void;
  editLinearForm: any;
  setEditLinearForm: (value: any) => void;
  editCliffForm: any;
  setEditCliffForm: (value: any) => void;
  isStreamCsvCreated: (id: string) => boolean;
  isCliffPassed: (id: string) => boolean;
  isMilestoneUnlocked: (id: string) => boolean;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
  endpoint: string;
  streams: any[];
connectedWalletAddress: string | null;
};
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isValidSolanaAddress(address: string): boolean {
  if (!address?.trim()) return false;
  return BASE58_REGEX.test(address.trim());
}
export function DashboardActionPanels(props: Props) {
  const {
    activeTab,
    useMultisig,
    setUseMultisig,
    createMode,
    setCreateMode,
    clusterLabel,
    mintPresets,
    createForm,
    setCreateForm,
    onMilestoneCountChange,
    milestoneAmounts,
    setMilestoneAmounts,
    csvCreateText,
    setCsvCreateText,
    csvEditText,
    setCsvEditText,
    compareVersionSelected,
    setCompareVersionSelected,
    csvVersions,
    handleDeleteCsvVersion,
    csvDiffResult,
    setCsvDiffResult,
    loadingDiff,
    handleAnalyzeDiff,
    handleAction,
    downloadTemplate,
    fileInputCreateRef,
    fileInputEditRef,
    handleCsvUpload,
    withdrawForm,
    setWithdrawForm,
    cancelForm,
    setCancelForm,
    unlockForm,
    setUnlockForm,
    editMilestoneForm,
    setEditMilestoneForm,
    editLinearForm,
    setEditLinearForm,
    editCliffForm,
    setEditCliffForm,
    isStreamCsvCreated,
    isCliffPassed,
    isMilestoneUnlocked,
    activeTxAction,
    activeTxPhase,
    connected,
    endpoint,
    streams,
    connectedWalletAddress,
  } = props;

  const recipientHistory = useAddressHistory("recipient");
  const mintHistory = useAddressHistory("mint");
 
  const mintPickerRef = useRef<HTMLDivElement | null>(null);
  const [mintMenuOpen, setMintMenuOpen] = useState(false);
  const [cliffInputMode, setCliffInputMode] = useState<"duration" | "date">("duration");
  const [durationInputMode, setDurationInputMode] = useState<"duration" | "date">("duration");
  const feeEstimate = useFeeEstimate();
  const csvMilestoneValidation = useCsvMilestoneValidation(csvCreateText);
  const csvEditMilestoneValidation = useCsvMilestoneValidation(csvEditText);
  const csvEditIdValidation = useCsvIdValidation(csvEditText, streams, true);
  // ─── Solana pubkey validator ──────────────────────────────────────────────

  // ── Resolve mint dari stream yang sedang diedit ───────────────────────────
const editLinearStream = useMemo(
  () => streams.find((s) => String(s?.id || "") === editLinearForm.streamId) ?? null,
  [streams, editLinearForm.streamId]
);
const editMilestoneStream = useMemo(
  () => streams.find((s) => String(s?.id || "") === editMilestoneForm.streamId) ?? null,
  [streams, editMilestoneForm.streamId]
);

const editLinearMint = editLinearStream?.mint ?? "";
const editMilestoneMint = editMilestoneStream?.mint ?? "";

const editLinearDecimals = typeof editLinearStream?.mintDecimals === "number"
  ? editLinearStream.mintDecimals : 6;
const editMilestoneBalanceDecimals = typeof editMilestoneStream?.mintDecimals === "number"
  ? editMilestoneStream.mintDecimals : 6;

const editLinearBalance = useTokenBalance(editLinearMint, endpoint, editLinearDecimals);
const editMilestoneBalance = useTokenBalance(editMilestoneMint, endpoint, editMilestoneBalanceDecimals);

// Asset code shown next to balances. Prefer the preset label; fall back to a
// shortened mint address so the unit is never ambiguous for custom tokens.
const shortenMint = (mint: string) =>
  mint ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : "";
const editLinearSymbol =
  mintPresets.find((p) => p.mint === editLinearMint)?.label ?? shortenMint(editLinearMint);
const editMilestoneSymbol =
  mintPresets.find((p) => p.mint === editMilestoneMint)?.label ?? shortenMint(editMilestoneMint);

// ── Validasi topup linear ─────────────────────────────────────────────────
const editLinearTopupNum = parseFloat(String(editLinearForm.topupAmount ?? "")) || 0;
const editLinearExceedsBalance =
  editLinearBalance.balance !== null &&
  editLinearTopupNum > 0 &&
  editLinearTopupNum > editLinearBalance.balance;

// ── Validasi topup pada Edit Cliff ────────────────────────────────────────
// Cliff stream juga bisa di-topup (program menerima edit_linear untuk tipe
// cliff). Resolve mint & saldo dari stream yang sedang diedit.
const editCliffStream = useMemo(
  () => streams.find((s) => String(s?.id || "") === editCliffForm.streamId) ?? null,
  [streams, editCliffForm.streamId]
);
const editCliffMint = editCliffStream?.mint ?? "";
const editCliffDecimals = typeof editCliffStream?.mintDecimals === "number"
  ? editCliffStream.mintDecimals : 6;
const editCliffBalance = useTokenBalance(editCliffMint, endpoint, editCliffDecimals);
const editCliffSymbol =
  mintPresets.find((p) => p.mint === editCliffMint)?.label ?? shortenMint(editCliffMint);
const editCliffTopupNum = parseFloat(String(editCliffForm.topupAmount ?? "")) || 0;
const editCliffExceedsBalance =
  editCliffBalance.balance !== null &&
  editCliffTopupNum > 0 &&
  editCliffTopupNum > editCliffBalance.balance;
// Cliff dianggap "diubah" hanya jika durasi baru berbeda dari yang sekarang.
// Membiarkan nilai prefilled (sama dengan sekarang) = niat topup saja.
const editCliffCurrentDuration =
  editCliffStream?.cliffTs && editCliffStream?.startTs
    ? String(Number(editCliffStream.cliffTs) - Number(editCliffStream.startTs))
    : "";
const editCliffNewDuration = String(editCliffForm.newCliffDuration ?? "").trim();
const editCliffWantsChange =
  editCliffNewDuration !== "" && editCliffNewDuration !== editCliffCurrentDuration;
const editCliffHasTopup = editCliffTopupNum > 0;

// ── Info stream & estimasi untuk panel Edit Cliff ─────────────────────────
const toBigIntSafe = (raw: any) => {
  try { return BigInt(String(raw ?? "0")); } catch { return BigInt(0); }
};
const editCliffWrongType = Boolean(editCliffStream) && editCliffStream.vestingType !== 1;
const editCliffTotalBase = toBigIntSafe(editCliffStream?.totalAmount);
const editCliffWithdrawnBase = toBigIntSafe(editCliffStream?.withdrawn);
const editCliffHasWithdrawals = editCliffWithdrawnBase > BigInt(0);
const editCliffStartTsNum = Number(editCliffStream?.startTs ?? 0);
const editCliffEndTsNum = Number(editCliffStream?.endTs ?? 0);
const editCliffCurrentCliffTsNum = Number(editCliffStream?.cliffTs ?? 0);

// Feature 1 — total terkunci setelah top-up (base units → display).
const editCliffTopupBase = parseTokenAmountToBaseUnits(String(editCliffForm.topupAmount ?? "0"), editCliffDecimals);
const editCliffNewTotalBase = editCliffTotalBase + editCliffTopupBase;

// Feature 3 — cliff timestamp baru (start + durasi) + apakah di luar rentang.
const editCliffNewDurationNum = Number(editCliffNewDuration);
const editCliffNewCliffTs =
  editCliffStream && editCliffNewDuration !== "" && Number.isFinite(editCliffNewDurationNum)
    ? editCliffStartTsNum + editCliffNewDurationNum
    : null;
const editCliffNewCliffOutOfRange =
  editCliffNewCliffTs !== null &&
  (editCliffNewCliffTs < editCliffStartTsNum || editCliffNewCliffTs > editCliffEndTsNum);


// edit_milestone tidak transfer token baru (redistribute saja)
// jadi tidak perlu balance check untuk milestone edit
  const withdrawFeeUsd =
  feeEstimate.solCost && feeEstimate.solPrice
    ? feeEstimate.solCost * feeEstimate.solPrice
    : null;
  // ─── FIX: Auto-populate startDate with a future default when type is non-milestone ───
  useEffect(() => {
    if (createForm.type === "2") return;

    const getFutureIso = () => {
      const d = new Date(Date.now() + 60_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    if (!createForm.startDate) {
      setCreateForm((prev: any) => ({ ...prev, startDate: getFutureIso() }));
    }

    const interval = setInterval(() => {
      setCreateForm((prev: any) => {
        if (prev.type === "2") return prev;
        if (!prev.startDate) return { ...prev, startDate: getFutureIso() };
        const ms = new Date(prev.startDate).getTime();
        if (Number.isFinite(ms) && ms <= Date.now()) {
          return { ...prev, startDate: getFutureIso(), endDate: "", cliffDate: "" };
        }
        return prev;
      });
    }, 30_000);

    return () => clearInterval(interval);
  }, [createForm.type]); // eslint-disable-line react-hooks/exhaustive-deps
  // ──────────────────────────────────────────────────────────────────────────────────────

  const milestoneSum = useMemo(
    () => milestoneAmounts.reduce((acc, curr) => acc + Number(curr || 0), 0),
    [milestoneAmounts]
  );
  const hasInvalidMilestones = useMemo(
    () => milestoneAmounts.some((value) => !value || Number(value) <= 0 || !Number.isFinite(Number(value))),
    [milestoneAmounts]
  );
  const milestonesMatchTotal = Math.abs(milestoneSum - Number(createForm.amount || 0)) < 0.0000001;

  const durationSeconds = Number(createForm.duration || 0);
  const cliffDurationSeconds = Number(createForm.cliffDuration || 0);
  const startDateMs = (() => {
    if (!createForm.startDate) return Date.now() + 10_000;
    const ms = new Date(createForm.startDate).getTime();
    return Number.isFinite(ms) ? ms : Date.now() + 10_000;
  })();
  const startDateInPast = createForm.type !== "2" && startDateMs <= Date.now();

  const cliffExceedsDuration = createForm.type === "1" && cliffDurationSeconds > durationSeconds;
  const cliffDateInPast =
    createForm.type === "1" &&
    Boolean(createForm.cliffDuration?.trim()) &&
    cliffDurationSeconds <= 0;
  const endDateInPast =
    createForm.type !== "2" &&
    Boolean(createForm.duration?.trim()) &&
    durationSeconds <= 0;

  const startDateInLocalIso = (() => {
    if (createForm.startDate) return createForm.startDate;
    const d = new Date(Date.now() + 10_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const cliffDateInLocalIso = (() => {
    if (createForm.cliffDate) return createForm.cliffDate;
    const seconds = Number(createForm.cliffDuration || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const d = new Date(startDateMs + seconds * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const endDateInLocalIso = (() => {
    if (createForm.endDate) return createForm.endDate;
    const seconds = Number(createForm.duration || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const d = new Date(startDateMs + seconds * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();


  const selectedMintPreset = mintPresets.find((preset) => preset.mint === createForm.mint) ?? null;
  const tokenBalance = useTokenBalance(
  createForm.mint,
  endpoint,
  selectedMintPreset?.decimals
);
const recipientInvalid =
  Boolean(createForm.recipient?.trim()) &&
  !isValidSolanaAddress(createForm.recipient);
const exceedsBalance =
  tokenBalance.balance !== null &&
  Boolean(createForm.amount?.trim()) &&
  Number(createForm.amount) > tokenBalance.balance;
  const mobileNarrowFormClass = "mx-auto w-full max-w-[22rem] sm:max-w-none sm:mx-0";
  const getTxLabel = (action: string, idleLabel: string) => {
    if (activeTxAction !== action || !activeTxPhase) return idleLabel;
    if (activeTxPhase === "wallet_approval") return "Approve In Wallet...";
    if (activeTxPhase === "sending") return "Sending Transaction...";
    return "Confirming On-Chain...";
  };
  const createRequiredValid =
    Boolean(createForm.recipient?.trim()) &&
    Boolean(createForm.amount?.trim()) &&
    Boolean(createForm.mint?.trim()) &&
    Boolean(createForm.type?.trim()) &&
    (createForm.type === "2" || Boolean(createForm.startDate?.trim())) &&
    (createForm.type === "2" ? Boolean(createForm.milestoneCount?.trim()) : Boolean(createForm.duration?.trim())) &&
    (createForm.type !== "1" || Boolean(createForm.cliffDuration?.trim()));
const createDisabled =
  !connected ||
  !createRequiredValid ||
  startDateInPast ||
  cliffExceedsDuration ||
  cliffDateInPast ||
  endDateInPast ||
  exceedsBalance ||
  recipientInvalid ||   // ← tambah ini
  (createForm.type === "2" && (hasInvalidMilestones || !milestonesMatchTotal)) ||
  activeTxAction === "create_stream";
  const withdrawDisabled = !withdrawForm.streamId?.trim() || activeTxAction === "withdraw";
  const unlockDisabled = !unlockForm.streamId?.trim() || activeTxAction === "unlock_milestone";
const csvTotalByMint = useCsvTotalByMint(csvCreateText);
const csvExceedsBalance =
  !!createForm.mint &&
  tokenBalance.balance !== null &&
  (csvTotalByMint[createForm.mint] ?? 0) > tokenBalance.balance;

const createCsvDisabled =
  !csvCreateText?.trim() ||
  activeTxAction === "create_stream_csv" ||
  csvMilestoneValidation.hasErrors ||
  csvExceedsBalance; // ← tambah ini
const csvEditTotalByMint = useCsvEditTotalByMint(csvEditText);
const csvEditExceedsBalance =
  !!createForm.mint &&
  tokenBalance.balance !== null &&
  (csvEditTotalByMint[createForm.mint] ?? 0) > tokenBalance.balance;

const editCsvDisabled =
  !csvEditText?.trim() ||
  activeTxAction === "edit_stream_csv" ||
  csvEditMilestoneValidation.hasErrors ||
  csvEditIdValidation.hasErrors || // ← blok apply kalau ada id ngawur
  csvEditExceedsBalance; // ← tambah ini

 const editLinearDisabled =
  isStreamCsvCreated(editLinearForm.streamId) ||
  !editLinearForm.streamId?.trim() ||
  !String(editLinearForm.newEndDuration ?? "").trim() ||
  !String(editLinearForm.topupAmount ?? "").trim() ||
  editLinearExceedsBalance ||   // ← tambah ini
  activeTxAction === "edit_linear";
  const editCliffPeriodOver = isCliffPassed(editCliffForm.streamId);
  // Setelah cliff lewat, program tidak mengizinkan ubah cliff. Selama field New
  // Cliff Duration masih terisi, tombol di-disable; kosongkan field untuk lanjut
  // top-up saja (top-up tetap didukung program lewat edit_linear).
  const editCliffBlockedByPeriod = editCliffPeriodOver && editCliffNewDuration !== "";
  const editCliffDisabled =
    isStreamCsvCreated(editCliffForm.streamId) ||
    !editCliffForm.streamId?.trim() ||
    (!editCliffWantsChange && !editCliffHasTopup) ||   // butuh minimal satu aksi
    editCliffBlockedByPeriod ||                          // cliff sudah lewat & field belum dikosongkan
    (editCliffWantsChange && editCliffNewCliffOutOfRange) || // cliff di luar rentang start–end
    editCliffExceedsBalance ||
    activeTxAction === "edit_cliff";

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      if (!mintPickerRef.current) return;
      if (!mintPickerRef.current.contains(event.target as Node)) {
        setMintMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // ─── shared className for datetime-local inputs (mobile-safe) ────────────
  const dateInputClass =
    "block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-[11px] sm:text-sm focus:outline-none focus:border-indigo-500 font-mono [color-scheme:dark] truncate";
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <>
      {activeTab !== "streams" && (
        <div className="bg-zinc-950/65 border border-zinc-900 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200">Squads Multisig Execution</h4>
              <p className="text-[10px] text-zinc-400">Enable this option to bundle your action as a Squads multisig proposal instead of executing directly.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-850 px-4 py-2 rounded-xl shrink-0">
            <input
              type="checkbox"
              id="multisig-toggle"
              checked={useMultisig}
              onChange={(e) => setUseMultisig(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-800 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="multisig-toggle" className="text-xs font-bold text-zinc-300 cursor-pointer select-none">
              Use Squads Multisig
            </label>
          </div>
        </div>
      )}

      {activeTab === "create_streams" && (
        <div className="animate-in fade-in-30 duration-200 overflow-x-hidden max-w-full">
          <PreflightChecklist endpoint={endpoint} />  
          <div className="flex flex-col gap-4 border-b border-zinc-900 pb-4 mb-6 sm:flex-row sm:items-center sm:justify-between max-w-full min-w-0">
            <div className="min-w-0 max-w-full">
              <h2 className="text-2xl font-extrabold tracking-tight">Create Stream</h2>
              <p className="text-xs text-zinc-400">Deploy a manual stream or deploy multiple streams via CSV</p>
            </div>
            <div className={`flex w-full max-w-full min-w-0 flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1 sm:w-auto sm:flex-row ${mobileNarrowFormClass}`}>
              <button
                onClick={() => setCreateMode("manual")}
                className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all sm:w-auto ${createMode === "manual" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                Manual Form
              </button>
              <button
                onClick={() => setCreateMode("csv")}
                className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 sm:w-auto ${createMode === "csv" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                CSV Bulk Create
              </button>
            </div>
          </div>

          {createMode === "manual" ? (
            <div className={`grid min-w-0 gap-4 md:grid-cols-2 max-w-full ${mobileNarrowFormClass}`}>
              <div className="md:col-span-2 min-w-0 max-w-full">
  <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
    Recipient
  </label>
  <input
    type="text"
    list="uf-recipient-history" autoComplete="off" 
    value={createForm.recipient}
    onBlur={(e) => recipientHistory.remember(e.target.value)}
    onChange={(e) => setCreateForm({ ...createForm, recipient: e.target.value })}
    className={`block w-full max-w-full min-w-0 bg-zinc-950 border rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none font-mono transition-colors ${
      recipientInvalid
        ? "border-rose-500/60 focus:border-rose-500"
        : "border-zinc-800 focus:border-indigo-500"
    }`}
    placeholder="Solana wallet address (base58)"
  />
   <datalist id="uf-recipient-history">
                  {recipientHistory.addresses.map((addr) => (
                    <option key={addr} value={addr} />
                  ))}
                </datalist>
  {recipientInvalid && (
    <div className="mt-1.5 text-[10px] font-semibold text-rose-400">
      Invalid Solana address — must be a valid base58 public key (32–44 characters).
    </div>
  )}
  {!recipientInvalid && createForm.recipient?.trim() && (
    <div className="mt-1.5 text-[10px] font-semibold text-emerald-500 flex items-center gap-1">
      <Check className="w-3 h-3" /> Valid Solana address
    </div>
  )}
</div>
              
             <div className="min-w-0 max-w-full">
  <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
    Amount
  </label>
  <div className="relative">
    <input
      type="text"
      inputMode="decimal"
      lang="en"
      value={createForm.amount}
      onChange={(e) =>
        setCreateForm({
          ...createForm,
          amount: normalizeDecimalInput(e.target.value),
        })
      }
      className={`block w-full max-w-full min-w-0 bg-zinc-950 border rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none font-mono transition-colors ${
        exceedsBalance
          ? "border-rose-500/60 focus:border-rose-500"
          : "border-zinc-800 focus:border-indigo-500"
      }`}
    />
    {/* Max button */}
    {tokenBalance.balance !== null && tokenBalance.balance > 0 && (
      <button
        type="button"
       onClick={() => {
  if (tokenBalance.balance === null) return;
  // Format to avoid 0.9999999... floating point artifacts
  const dec = tokenBalance.decimals ?? selectedMintPreset?.decimals ?? 6;
  const formatted = tokenBalance.balance.toFixed(dec).replace(/\.?0+$/, "");
  setCreateForm({ ...createForm, amount: formatted });
}}
        className="absolute inset-y-0 right-3 flex items-center px-2 text-[10px] font-black uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        MAX
      </button>
    )}
  </div>

 {/* Balance row */}
<div className="mt-1.5 flex items-center gap-2">
  {!connected ? null
  : tokenBalance.loading ? (
    <span className="text-[10px] font-mono text-zinc-600 animate-pulse">
      fetching balance…
    </span>
  ) : tokenBalance.error ? (
    <span className="text-[10px] font-mono text-zinc-600">
      balance unavailable
    </span>
  ) : !createForm.mint?.trim() ? null
  : tokenBalance.balance !== null ? (
    // ← covers both 0 (no ATA) and >0
    <span className={`text-[10px] font-mono ${exceedsBalance ? "text-rose-400" : "text-zinc-500"}`}>
      Balance:{" "}
      {tokenBalance.balance.toLocaleString(undefined, {
        maximumFractionDigits: tokenBalance.decimals ?? selectedMintPreset?.decimals ?? 6,
      })}{" "}
      {selectedMintPreset?.label ?? ""}
    </span>
  ) : null}
</div>

  {exceedsBalance && (
    <div className="mt-1 text-[10px] font-semibold text-rose-400">
      Amount exceeds your wallet balance of{" "}
      {tokenBalance.balance!.toLocaleString(undefined, {
        maximumFractionDigits: tokenBalance.decimals ?? 6,
      })}{" "}
      {selectedMintPreset?.label ?? "tokens"}.
    </div>
  )}
</div>
              <div className="min-w-0 max-w-full">
                <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Mint</label>
                <div ref={mintPickerRef} className="relative min-w-0 max-w-full overflow-visible">
                  <button
                    type="button"
                    onClick={() => setMintMenuOpen((open) => !open)}
                    className="flex w-full max-w-full min-w-0 items-center justify-between gap-3 overflow-hidden bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center shrink-0"
                        style={{ boxShadow: selectedMintPreset ? `0 0 0 1px ${selectedMintPreset.accent}33` : undefined }}
                      >
                        {selectedMintPreset ? (
                          <Image src={selectedMintPreset.logoURI} alt={`${selectedMintPreset.label} logo`} width={36} height={36} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-black text-zinc-400">?</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-zinc-100 truncate">
                            {selectedMintPreset ? selectedMintPreset.label : "Custom mint"}
                          </span>
                          {selectedMintPreset && (
                            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                              {selectedMintPreset.decimals} dec
                            </span>
                          )}
                        </div>
                        <div className="hidden sm:block font-mono text-[10px] text-zinc-500 truncate">
                          {selectedMintPreset ? selectedMintPreset.mint : createForm.mint || "Select or paste a mint address"}
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${mintMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {mintMenuOpen && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 w-full max-w-full rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 overflow-hidden max-h-[72vh]">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900 bg-zinc-950/95">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Known mints for {clusterLabel}</div>
                          <div className="text-[10px] text-zinc-600">Pick a preset or keep a custom mint below</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCreateForm({ ...createForm, mint: "" })}
                          className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto p-2">
                        {mintPresets.map((preset) => {
                          const active = createForm.mint.trim() === preset.mint;

                          return (
                            <button
                              key={preset.mint}
                              type="button"
                              onClick={() => {
                                setCreateForm({ ...createForm, mint: preset.mint });
                                setMintMenuOpen(false);
                              }}
                              className={`w-full max-w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all overflow-hidden ${active ? "border-indigo-500/70 bg-indigo-500/10" : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"}`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0">
                                  <Image src={preset.logoURI} alt={`${preset.label} logo`} width={40} height={40} className="w-full h-full object-cover" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="text-sm font-extrabold text-zinc-100 truncate">{preset.label}</span>
                                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                                      {preset.decimals} dec
                                    </span>
                                  </div>
                                  <div className="hidden sm:block font-mono text-[10px] text-zinc-500 truncate">{preset.mint}</div>
                                  <div className="hidden sm:block text-[10px] text-zinc-600 truncate">{preset.note}</div>
                                </div>
                              </div>
                              {active && <Check className="w-4 h-4 text-indigo-300 shrink-0" />}
                            </button>
                          );
                        })}

                        <div className="mt-2 border-t border-zinc-900 pt-2 px-1 pb-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500 mb-2 px-2">Custom mint</div>
                          <input
                            type="text"
                            list="uf-mint-history"
                            autoComplete="off"
                            value={createForm.mint}
                            onChange={(e) => setCreateForm({ ...createForm, mint: e.target.value })}
                            onBlur={(e) => mintHistory.remember(e.target.value)}
                            placeholder="Paste a mint address"
                            className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                          />
                          <datalist id="uf-mint-history">
                            {mintHistory.addresses.map((addr) => (
                              <option key={addr} value={addr} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0 max-w-full">
                <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[26px]">
                  <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider">Type</label>
                </div>
                <select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })} className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-medium">
                  <option value="0">Linear Vesting</option>
                  <option value="1">Cliff Vesting</option>
                  <option value="2">Milestone-Based Vesting</option>
                </select>
              </div>

              {/* ─── Start Date ─────────────────────────────────────────────── */}
              {createForm.type !== "2" && (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input
                    type="datetime-local"
                    value={startDateInLocalIso}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCreateForm({
                        ...createForm,
                        startDate: value,
                        endDate: "",
                        cliffDate: "",
                      });
                    }}
                    className={dateInputClass}
                    style={{ WebkitAppearance: "none" }}
                  />
                  {startDateInPast && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-400">
                      Start date must be in the future.
                    </div>
                  )}
                </div>
              )}
              {/* ──────────────────────────────────────────────────────────────── */}

              {/* ─── Duration / End Date ────────────────────────────────────── */}
              {createForm.type !== "2" && (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[26px]">
                    <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider">{durationInputMode === "duration" ? "Duration" : "End Date"}</label>
                    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-[9px] font-black uppercase tracking-wider shrink-0">
                      <button
                        type="button"
                        onClick={() => setDurationInputMode("duration")}
                        className={`px-2 py-1 rounded-md transition-colors ${durationInputMode === "duration" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        Duration
                      </button>
                      <button
                        type="button"
                        onClick={() => setDurationInputMode("date")}
                        className={`px-2 py-1 rounded-md transition-colors ${durationInputMode === "date" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        Date
                      </button>
                    </div>
                  </div>
                  {durationInputMode === "duration" ? (
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={createForm.duration}
                        onChange={(e) => setCreateForm({ ...createForm, duration: e.target.value, endDate: "" })}
                        placeholder="Seconds from start date"
                        className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 pr-14 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-black uppercase tracking-wider text-zinc-500">sec</span>
                    </div>
                  ) : (
                    <input
                      type="datetime-local"
                      value={endDateInLocalIso}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) {
                          setCreateForm({ ...createForm, endDate: "", duration: "" });
                          return;
                        }
                        const target = new Date(value).getTime();
                        const seconds = Math.max(0, Math.floor((target - startDateMs) / 1000));
                        setCreateForm({ ...createForm, endDate: value, duration: String(seconds) });
                      }}
                      className={dateInputClass}
                      style={{ WebkitAppearance: "none" }}
                    />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
  {QUICK_DURATIONS.map((p) => (
    <button
      key={p.label}
      type="button"
      onClick={() =>
        setCreateForm({
          ...createForm,
          duration: String(p.value),
          endDate: "",
        })
      }
      className="px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase text-zinc-300 hover:border-indigo-500 hover:text-white transition"
    >
      {p.label}
    </button>
  ))}
</div>
                  {durationSeconds > 0 && (
                    <div className="mt-1.5 text-[10px] font-mono text-zinc-500">
                      {durationInputMode === "duration"
                        ? `≈ ends ${new Date(startDateMs + durationSeconds * 1000).toLocaleString()}`
                        : `≈ ${durationSeconds.toLocaleString()}s from start date`}
                    </div>
                  )}
                  {endDateInPast && durationInputMode === "date" && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-400">
                      End date must be in the future.
                    </div>
                  )}
                </div>
              )}
              {/* ──────────────────────────────────────────────────────────────── */}

              {/* ─── Cliff ──────────────────────────────────────────────────── */}
              {createForm.type === "1" && (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[26px]">
                    <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cliff</label>
                    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-[9px] font-black uppercase tracking-wider shrink-0">
                      <button
                        type="button"
                        onClick={() => setCliffInputMode("duration")}
                        className={`px-2 py-1 rounded-md transition-colors ${cliffInputMode === "duration" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        Duration
                      </button>
                      <button
                        type="button"
                        onClick={() => setCliffInputMode("date")}
                        className={`px-2 py-1 rounded-md transition-colors ${cliffInputMode === "date" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        Date
                      </button>
                    </div>
                  </div>
                  {cliffInputMode === "duration" ? (
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={createForm.cliffDuration}
                        onChange={(e) => setCreateForm({ ...createForm, cliffDuration: e.target.value, cliffDate: "" })}
                        placeholder="Seconds from start date"
                        className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 pr-14 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-black uppercase tracking-wider text-zinc-500">sec</span>
                    </div>
                  ) : (
                    <input
                      type="datetime-local"
                      value={cliffDateInLocalIso}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) {
                          setCreateForm({ ...createForm, cliffDate: "", cliffDuration: "" });
                          return;
                        }
                        const target = new Date(value).getTime();
                        const seconds = Math.max(0, Math.floor((target - startDateMs) / 1000));
                        setCreateForm({ ...createForm, cliffDate: value, cliffDuration: String(seconds) });
                      }}
                      className={dateInputClass}
                      style={{ WebkitAppearance: "none" }}
                    />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
  {QUICK_DURATIONS.map((p) => (
    <button
      key={p.label}
      type="button"
      onClick={() =>
        setCreateForm({
          ...createForm,
          cliffDuration: String(p.value),
          cliffDate: "",
        })
      }
      className="px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase text-zinc-300 hover:border-indigo-500 hover:text-white transition"
    >
      {p.label}
    </button>
  ))}
</div>
                  {cliffDurationSeconds > 0 && (
                    <div className="mt-1.5 text-[10px] font-mono text-zinc-500">
                      {cliffInputMode === "duration"
                        ? `≈ unlocks ${new Date(startDateMs + cliffDurationSeconds * 1000).toLocaleString()}`
                        : `≈ ${cliffDurationSeconds.toLocaleString()}s from start date`}
                    </div>
                  )}
                  {cliffDateInPast && cliffInputMode === "date" && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-400">
                      Cliff date must be in the future.
                    </div>
                  )}
                  {cliffExceedsDuration && (
                    <div className="mt-2 text-[10px] font-semibold text-amber-400">
                      Cliff must occur before the stream ends ({durationSeconds.toLocaleString()}s from start date).
                    </div>
                  )}
                </div>
              )}
              {/* ──────────────────────────────────────────────────────────────── */}

              {createForm.type === "2" && (
                <div className="md:col-span-2 grid min-w-0 gap-4 bg-zinc-900/30 border border-zinc-900 p-4 rounded-xl max-w-full overflow-hidden">
                  <div className="min-w-0 max-w-full">
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider">Count</label>
                      <span className="text-[10px] text-zinc-600 font-normal">max 17</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="17"
                      value={createForm.milestoneCount}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        const clamped = Number.isFinite(raw) ? String(Math.min(17, Math.max(1, raw))) : "";
                        onMilestoneCountChange(clamped);
                      }}
                      className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    {Number(createForm.milestoneCount) >= 17 && (
                      <div className="mt-1.5 text-[10px] font-semibold text-amber-400">
                        Maximum milestone count is 17.
                      </div>
                    )}
                  </div>
                  <div className="border-t border-zinc-900/60 pt-3">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Milestones</label>
                 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  {milestoneAmounts.map((amt, idx) => {
    const val = Number(amt || 0);
    const isEmpty = !amt || amt === "0";
    const isInvalid = isEmpty || val <= 0 || !Number.isFinite(val);
    const inputBorder = isInvalid
      ? "border-rose-500/50 focus:border-rose-500"
      : "border-emerald-500/40 focus:border-emerald-500";
    const pctOfTotal = Number(createForm.amount) > 0
      ? ((val / Number(createForm.amount)) * 100).toFixed(1)
      : "0.0";

    return (
      <div key={idx} className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 font-mono font-bold">#{idx}</span>
          <span className={`text-[9px] font-mono font-bold ${isInvalid ? "text-zinc-600" : "text-indigo-400"}`}>
            {isInvalid ? "—" : `${pctOfTotal}%`}
          </span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          lang="en"
          value={amt}
          onChange={(e) => {
            const next = [...milestoneAmounts];
            const normalized = normalizeDecimalInput(e.target.value);
            next[idx] = normalized === "" ? "0" : normalized;
            setMilestoneAmounts(next);
          }}
          className={`block w-full max-w-full min-w-0 bg-zinc-950 border rounded-xl px-3 py-2.5 text-xs focus:outline-none font-mono transition-colors duration-150 ${inputBorder}`}
          placeholder="0"
        />
      </div>
    );
  })}
</div>

{/* Live Counter — ganti teks status lama */}
<div className="mt-3">
  <MilestoneAllocationCounter
    amounts={milestoneAmounts}
    total={Number(createForm.amount || 0)}
    hasInvalid={hasInvalidMilestones}
    isMatch={milestonesMatchTotal}
  />
</div>
                  </div>
                </div>
              )}
{/* ─── Stream Preview Card ───────────────────────────── */}
<div className="md:col-span-2 mt-2 rounded-2xl border border-zinc-800 bg-zinc-950/80 overflow-hidden">
  <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Terminal className="w-4 h-4 text-indigo-400" />
      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">
        Stream Preview
      </span>
    </div>

    <span className="text-[10px] font-mono text-zinc-500">
      {clusterLabel}
    </span>
  </div>

  <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 text-[11px]">
    <div>
      <div className="text-zinc-500">Recipient</div>
      <div className="font-mono text-zinc-200 truncate">
        {createForm.recipient || "—"}
      </div>
    </div>

    <div>
      <div className="text-zinc-500">Amount</div>
      <div className="font-semibold text-zinc-100">
        {createForm.amount || "0"}
      </div>
    </div>

    <div>
      <div className="text-zinc-500">Mint</div>
      <div className="font-mono truncate text-zinc-300">
        {selectedMintPreset?.label || createForm.mint || "—"}
      </div>
    </div>

    <div>
      <div className="text-zinc-500">Schedule</div>
      <div className="text-zinc-100">
        {createForm.type === "0"
          ? "Linear"
          : createForm.type === "1"
          ? "Cliff"
          : "Milestone"}
      </div>
    </div>

    {createForm.type !== "2" && (
      <>
        <div>
          <div className="text-zinc-500">Start</div>
          <div className="font-mono text-zinc-300">
            {new Date(startDateMs).toLocaleString()}
          </div>
        </div>

        <div>
          <div className="text-zinc-500">Ends</div>
          <div className="font-mono text-zinc-300">
            {durationSeconds > 0
              ? new Date(
                  startDateMs + durationSeconds * 1000
                ).toLocaleString()
              : "—"}
          </div>
        </div>

        {createForm.type === "1" && cliffDurationSeconds > 0 && (
          <div>
            <div className="text-zinc-500">Cliff Date</div>
            <div className="font-mono text-amber-300">
              {cliffDateInLocalIso
                ? new Date(cliffDateInLocalIso).toLocaleString()
                : "—"}
            </div>
          </div>
        )}


      </>
    )}
            {/* Withdraw Fee Preview */}

<div>
  <div className="text-zinc-500">
    Withdraw Fee
  </div>

  {feeEstimate.loading ? (
    <div className="font-mono text-zinc-500 animate-pulse">
      fetching...
    </div>
  ) : feeEstimate.error || !feeEstimate.solCost ? (
    <div className="font-mono text-zinc-500">
      unavailable
    </div>
  ) : (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-amber-300">
          ${withdrawFeeUsd?.toFixed(2)}
        </span>

        <span className="text-[10px] text-zinc-500 font-mono">
          ◎ {feeEstimate.solCost.toFixed(6)} SOL
        </span>
      </div>

      {feeEstimate.solPrice && (
        <div className="mt-1 text-[9px] text-zinc-600 font-mono">
          @ ${feeEstimate.solPrice.toFixed(2)} / SOL
        </div>
      )}

      <div className="mt-1 text-[9px] text-zinc-600">
        charged on every withdraw call
      </div>
    </>
  )}
</div>
  </div>
</div>
              <button
                disabled={createDisabled}
                onClick={() => {
                  recipientHistory.remember(createForm.recipient);
                  mintHistory.remember(createForm.mint);
                  handleAction("create_stream", createForm);
                }}
                className={`md:col-span-2 w-full mt-4 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${createDisabled ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}
              >
                {activeTxAction === "create_stream" && activeTxPhase ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {getTxLabel("create_stream", "Deploy Stream")}
              </button>
            </div>
          ) : (
            <div className={`grid min-w-0 gap-4 max-w-full overflow-hidden ${mobileNarrowFormClass}`}>
              <div className="flex flex-col gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <button onClick={() => downloadTemplate("create")} className="flex w-full items-center justify-center gap-1.5 px-3 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-350 transition-all sm:w-auto"><Download className="w-3.5 h-3.5 text-indigo-400" />Template</button>
                  <button onClick={() => fileInputCreateRef.current?.click()} className="flex w-full items-center justify-center gap-1.5 px-3 py-2 border border-indigo-900/60 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-450 rounded-xl text-xs font-semibold transition-all sm:w-auto"><Upload className="w-3.5 h-3.5" />Upload CSV</button>
                  <input type="file" accept=".csv" ref={fileInputCreateRef} onChange={(e) => handleCsvUpload(e, "create")} className="hidden" />
                </div>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Baseline:</span>
                    <select value={compareVersionSelected} onChange={(e) => setCompareVersionSelected(e.target.value)} className="min-w-0 bg-zinc-900 border border-zinc-805 rounded-xl px-2.5 py-2 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-indigo-500">
                      <option value="0">Live Active DB</option>
                      {csvVersions.map((v) => <option key={v.id} value={v.version}>Version {v.version} ({v.filename})</option>)}
                    </select>
                    {compareVersionSelected !== "0" && (
                      <button
                        onClick={handleDeleteCsvVersion}
                        className="rounded-xl border border-rose-900/60 bg-rose-950/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-950/40 transition-all"
                      >
                        Delete Version
                      </button>
                    )}
                  </div>
                  <button onClick={() => handleAnalyzeDiff("create")} disabled={loadingDiff} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-650 hover:bg-indigo-600 border border-indigo-700 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-40 sm:w-auto">
                    {loadingDiff ? <RefreshCw className="w-3 h-3 animate-spin text-white" /> : <Layers className="w-3 h-3" />}Analyze Diff
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">CSV Payload Preview / Editor</label>
                <textarea rows={8} value={csvCreateText} onChange={(e) => setCsvCreateText(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              {/* ─── Milestone Validation ─── */}
           <CsvValidationPanel
  csvText={csvCreateText}
  walletBalance={tokenBalance.balance}
  walletMint={createForm.mint}
  walletMintLabel={selectedMintPreset?.label}
  walletDecimals={tokenBalance.decimals ?? selectedMintPreset?.decimals ?? 6}
/>
              <CsvDiffPanel csvDiffResult={csvDiffResult} compareVersionSelected={compareVersionSelected} onClose={() => setCsvDiffResult(null)} />

              <button
                disabled={createCsvDisabled}
                onClick={() => handleAction("create_stream_csv", null)}
                className={`w-full mt-4 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${createCsvDisabled ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}
              >
                {activeTxAction === "create_stream_csv" && activeTxPhase ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {getTxLabel("create_stream_csv", `Approve & Apply CSV Revision (Creates v${csvVersions.length + 1})`)}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "edit_csv" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-emerald-400">
              Bulk Edit CSV
            </h2>
            <p className="text-xs text-zinc-400">
              Modify multiple CSV-created streams simultaneously via CSV updates
            </p>
          </div>

          <div className={`grid min-w-0 gap-4 max-w-full overflow-hidden ${mobileNarrowFormClass}`}>
            <div className="flex flex-col gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Left actions */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  onClick={() => downloadTemplate("edit")}
                  className="flex w-full items-center justify-center gap-1.5 px-3 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-350 transition-all sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  Template
                </button>

                <button
                  onClick={() => fileInputEditRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 px-3 py-2 border border-emerald-900/60 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 rounded-xl text-xs font-semibold transition-all sm:w-auto"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV
                </button>

                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputEditRef}
                  onChange={(e) => handleCsvUpload(e, "edit")}
                  className="hidden"
                />
              </div>

              {/* Right actions */}
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">
                    Baseline:
                  </span>

                  <select
                    value={compareVersionSelected}
                    onChange={(e) => setCompareVersionSelected(e.target.value)}
                    className="min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-2 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="0">Live Active DB</option>
                    {csvVersions.map((v) => (
                      <option key={v.id} value={v.version}>
                        Version {v.version} ({v.filename})
                      </option>
                    ))}
                  </select>

                  {compareVersionSelected !== "0" && (
                    <button
                      onClick={handleDeleteCsvVersion}
                      className="rounded-xl border border-rose-900/60 bg-rose-950/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-950/40 transition-all"
                    >
                      Delete Version
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleAnalyzeDiff("edit")}
                  disabled={loadingDiff}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-700 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-40 sm:w-auto"
                >
                  {loadingDiff ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-white" />
                  ) : (
                    <Layers className="w-3 h-3" />
                  )}
                  Analyze Diff
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                CSV Edit Payload Preview / Editor
              </label>

              <textarea
                rows={6}
                value={csvEditText}
                onChange={(e) => setCsvEditText(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            {/* ─── Milestone Validation ─── */}
<CsvValidationPanel
  csvText={csvEditText}
  walletBalance={tokenBalance.balance}
  walletMint={createForm.mint}
  walletMintLabel={selectedMintPreset?.label}
  walletDecimals={tokenBalance.decimals ?? selectedMintPreset?.decimals ?? 6}
  editMode={true}              // ← flag supaya label lebih relevan
  editTotalByMint={csvEditTotalByMint}
  editStreams={streams}        // ← live DB untuk validasi kolom id
/>
            <CsvDiffPanel
              csvDiffResult={csvDiffResult}
              compareVersionSelected={compareVersionSelected}
              onClose={() => setCsvDiffResult(null)}
            />

            <button
              disabled={editCsvDisabled}
              onClick={() => handleAction("edit_stream_csv", null)}
              className={`w-full mt-4 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                editCsvDisabled
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
                  : "bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-500/20"
              }`}
            >
              {activeTxAction === "edit_stream_csv" && activeTxPhase ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              {getTxLabel("edit_stream_csv", "Approve & Apply CSV Revision")}
            </button>
          </div>
        </div>
      )}

      {activeTab === "withdraw" && (
        <WithdrawPanel
    withdrawForm={withdrawForm}
    setWithdrawForm={setWithdrawForm}
    handleAction={handleAction}
    streams={streams}
    connectedWalletAddress={connectedWalletAddress}
    activeTxAction={activeTxAction}
    activeTxPhase={activeTxPhase}
    connected={connected}
  />
      )}

{activeTab === "cancel" && (
  <CancelPanel
    cancelForm={cancelForm}
    setCancelForm={setCancelForm}
    handleAction={handleAction}
    isSubmitting={activeTxAction === "cancel" && !!activeTxPhase}
    submitLabel={getTxLabel("cancel", "Cancel and Refund Stream")}
    streams={streams}                            // ← tambah
    connectedWalletAddress={connectedWalletAddress}  // ← tambah
  />
)}

    {activeTab === "unlock_milestone" && (
  <UnlockMilestonePanel
  endpoint={endpoint}
    unlockForm={unlockForm}
    setUnlockForm={setUnlockForm}
    handleAction={handleAction}
    streams={streams}
    connectedWalletAddress={connectedWalletAddress}
    activeTxAction={activeTxAction}
    activeTxPhase={activeTxPhase}
    connected={connected}
  />
)}

     {activeTab === "edit_milestone" && (
  <EditMilestonePanel
    editMilestoneForm={editMilestoneForm}
    setEditMilestoneForm={setEditMilestoneForm}
    handleAction={handleAction}
    streams={streams}
    connectedWalletAddress={connectedWalletAddress}
    activeTxAction={activeTxAction}
    activeTxPhase={activeTxPhase}
    connected={connected}
    isStreamCsvCreated={isStreamCsvCreated}
    isMilestoneUnlocked={isMilestoneUnlocked}
    editMilestoneBalance={editMilestoneBalance}
    editMilestoneBalanceDecimals={editMilestoneBalanceDecimals}
    editMilestoneMint={editMilestoneMint}
  />
)}

    {activeTab === "edit_linear" && (
  <EditLinearPanel
    editLinearForm={editLinearForm}
    setEditLinearForm={setEditLinearForm}
    handleAction={handleAction}
    streams={streams}
    connectedWalletAddress={connectedWalletAddress}
    activeTxAction={activeTxAction}
    activeTxPhase={activeTxPhase}
    connected={connected}
    endpoint={endpoint}
    isStreamCsvCreated={isStreamCsvCreated}
    editLinearBalance={editLinearBalance}
    editLinearExceedsBalance={editLinearExceedsBalance}
    editLinearDecimals={editLinearDecimals}
    editLinearMint={editLinearMint}
  />
)}

     {activeTab === "edit_cliff" && (
  <EditCliffPanel
    editCliffForm={editCliffForm}
    setEditCliffForm={setEditCliffForm}
    handleAction={handleAction}
    streams={streams}
    connectedWalletAddress={connectedWalletAddress}
    activeTxAction={activeTxAction}
    activeTxPhase={activeTxPhase}
    connected={connected}
    isStreamCsvCreated={isStreamCsvCreated}
  />
)}

      <div className={`mt-12 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 font-mono text-[11px] relative overflow-hidden ${mobileNarrowFormClass}`}>
        <div className="absolute top-0 right-0 p-3 flex gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-green-500/60" /></div>
        <div className="flex items-center gap-2 text-indigo-400 font-bold mb-2"><Terminal className="w-4 h-4 shrink-0" /><span>Equivalent CLI / Agent Skill Call</span></div>
     <div className="text-zinc-400 select-all overflow-hidden whitespace-normal break-words py-1 sm:overflow-x-auto sm:whitespace-nowrap sm:break-normal">

  {activeTab === "create_streams" && (
    <span>
      {createMode === "manual"
        ? createForm.type === "2"
          ? `$ unifiedflow create ${createForm.recipient || "<recipient>"} ${createForm.mint || "<mint>"} ${createForm.amount || "<amount>"} 2 ${milestoneAmounts.filter(Boolean).join(",") || "<100,200,300>"}`
          : `$ unifiedflow create ${createForm.recipient || "<recipient>"} ${createForm.mint || "<mint>"} ${createForm.amount || "<amount>"} ${createForm.type || "0"}${createForm.type === "1" ? ` ${createForm.duration || "<duration_secs>"} ${createForm.cliffDuration || "<cliff_secs>"}` : ` ${createForm.duration || "<duration_secs>"}`}`
        : `$ unifiedflow create-batch ./streams.csv`}
    </span>
  )}

  {activeTab === "withdraw" && (
    <span>
      $ unifiedflow withdraw {withdrawForm.streamId || "<stream_address>"}
    </span>
  )}

  {activeTab === "cancel" && (
    <span>
      $ unifiedflow cancel {cancelForm.streamId || "<stream_address>"}
    </span>
  )}

  {activeTab === "unlock_milestone" && (
    <span>
      $ unifiedflow unlock {unlockForm.streamId || "<stream_address>"}
    </span>
  )}

  {activeTab === "edit_milestone" && (
    <span>
      $ unifiedflow edit-batch ./edits.csv
      {editMilestoneForm.streamId && (
        <>
          {"\n"}
          {`# or manually: $ unifiedflow edit-milestone ${editMilestoneForm.streamId} <idx> <amt>`}
        </>
      )}
    </span>
  )}

  {activeTab === "edit_linear" && (
    <span>
      $ unifiedflow edit-linear{" "}
      {editLinearForm.streamId || "<stream_address>"}{" "}
      {editLinearForm.newEndDuration || "<new_duration_secs>"}{" "}
      {editLinearForm.topupAmount && editLinearForm.topupAmount !== "0"
        ? editLinearForm.topupAmount
        : "<topup_amount>"}
    </span>
  )}

  {activeTab === "edit_cliff" && (
    <span>
      $ unifiedflow edit-cliff{" "}
      {editCliffForm.streamId || "<stream_address>"}{" "}
      {editCliffForm.newCliffDuration || "<new_cliff_duration_secs>"}
      {editCliffForm.topupAmount && editCliffForm.topupAmount !== "0"
        ? ` --topup ${editCliffForm.topupAmount}`
        : ""}
    </span>
  )}

  {activeTab === "edit_csv" && (
    <span>
      $ unifiedflow edit-batch ./edits.csv
    </span>
  )}

</div>  </div>
      
    </>
  );
}

// ─── useFeeEstimate hook ──────────────────────────────────────────────────
function useFeeEstimate() {
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchPrice = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json();
      setSolPrice(data?.solana?.usd ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  const FEE_USD = 0.99;
  const solCost = solPrice ? FEE_USD / solPrice : null;

  return { solPrice, solCost, loading, error, refetch: fetchPrice };
}
function useCsvEditTotalByMint(csvText: string): Record<string, number> {
  return useMemo(() => {
    if (!csvText?.trim()) return {};
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return {};

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const mintIdx = headers.indexOf("mint");
    const amountIdx = headers.indexOf("amount");
    const topupIdx = headers.indexOf("topup_amount");
    const milestonesIdx = headers.indexOf("milestones");
    const actionIdx = headers.indexOf("action");
    const typeIdx = headers.indexOf("type");

    const totals: Record<string, number> = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());

      // ── Resolve mint ──────────────────────────────────────────────────
      // Di dalam loop useCsvEditTotalByMint, ganti resolve mint:
const mint = mintIdx !== -1
  ? (values[mintIdx] ?? "unknown")
  : "__wallet_mint__"; // sentinel kalau tidak ada kolom mint

      // ── Detect action/type ────────────────────────────────────────────
      // Priority: explicit "action" col → fallback ke "type" col → infer dari kolom yang ada
      const explicitAction = actionIdx !== -1
        ? values[actionIdx]?.toLowerCase() ?? ""
        : "";
      const explicitType = typeIdx !== -1
        ? values[typeIdx]?.toLowerCase() ?? ""
        : "";

      const isEditCliff =
        explicitAction === "edit_cliff" ||
        explicitType === "edit_cliff" ||
        // Infer: punya cliff_duration tapi tidak punya milestones dan tidak punya topup
        (headers.includes("cliff_duration") &&
          milestonesIdx === -1 &&
          topupIdx === -1 &&
          !explicitAction &&
          !explicitType);

      // edit_cliff → skip, tidak ada token transfer
      if (isEditCliff) continue;

      const isEditLinear =
        explicitAction === "edit_linear" ||
        explicitType === "edit_linear" ||
        topupIdx !== -1;

      const isEditMilestone =
        explicitAction === "edit_milestone" ||
        explicitType === "edit_milestone" ||
        milestonesIdx !== -1;

      if (isEditLinear && topupIdx !== -1) {
        // Hanya topup yang menarik token dari wallet
        const topup = parseFloat(values[topupIdx] ?? "0") || 0;
        if (topup > 0) totals[mint] = (totals[mint] ?? 0) + topup;

      } else if (isEditMilestone && milestonesIdx !== -1) {
        // Sum semua milestone values di row ini
        const raw = values.slice(milestonesIdx).join(";");
        const milestones = raw
          .split(/[;,]/)
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => parseFloat(v) || 0);
        const total = milestones.reduce((a, b) => a + b, 0);
        if (total > 0) totals[mint] = (totals[mint] ?? 0) + total;

      } else if (amountIdx !== -1 && !isEditCliff) {
        // Fallback: kalau tidak bisa determine tipe tapi ada kolom amount,
        // dan bukan edit_cliff — treat sebagai token-consuming edit
        const amount = parseFloat(values[amountIdx] ?? "0") || 0;
        if (amount > 0) totals[mint] = (totals[mint] ?? 0) + amount;
      }
    }

    return totals;
  }, [csvText]);
}
function useCsvMilestoneValidation(csvText: string) {
  return useMemo(() => {
    if (!csvText?.trim()) return { rows: [], hasErrors: false };

    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return { rows: [], hasErrors: false };

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const typeIdx = headers.indexOf("type");
    const amountIdx = headers.indexOf("amount");
    const milestonesIdx = headers.indexOf("milestones");
    const recipientIdx = headers.indexOf("recipient");

    if (amountIdx === -1) return { rows: [], hasErrors: false };

    const rows: {
      rowNum: number;
      recipient: string;
      recipientInvalid: boolean;        // ← baru
      totalAmount: number;
      milestones: number[];
      milestoneSum: number;
      pct: number;
      remaining: number;
      isMatch: boolean;
      hasInvalid: boolean;
      isMilestoneRow: boolean;          // ← baru, supaya non-milestone bisa skip milestone check
    }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());

      const recipient = recipientIdx !== -1 ? (values[recipientIdx] ?? "") : "";
      const recipientInvalid = Boolean(recipient.trim()) && !isValidSolanaAddress(recipient);
      const isMilestoneRow = typeIdx !== -1 && values[typeIdx] === "2";
      const totalAmount = parseFloat(values[amountIdx] ?? "0") || 0;

      let milestones: number[] = [];
      let milestoneSum = 0;
      let remaining = 0;
      let pct = 0;
      let isMatch = true;
      let hasInvalid = false;

      if (isMilestoneRow) {
        if (milestonesIdx !== -1) {
          const raw = values.slice(milestonesIdx).join(";");
          milestones = raw
            .split(/[;,]/)
            .map((v) => v.trim())
            .filter(Boolean)
            .map((v) => parseFloat(v) || 0);
        }
        milestoneSum = milestones.reduce((a, b) => a + b, 0);
        remaining = totalAmount - milestoneSum;
        pct = totalAmount > 0 ? Math.min((milestoneSum / totalAmount) * 100, 100) : 0;
        isMatch = totalAmount > 0 && Math.abs(remaining) < 0.0000001;
        hasInvalid = milestones.length === 0 || milestones.some((v) => v <= 0 || !Number.isFinite(v));
      }

      // Hanya push row yang punya error (recipient invalid ATAU milestone mismatch)
      const hasAnyError = recipientInvalid || (isMilestoneRow && (!isMatch || hasInvalid));
      if (hasAnyError) {
        rows.push({
          rowNum: i,
          recipient,
          recipientInvalid,
          totalAmount,
          milestones,
          milestoneSum,
          pct,
          remaining,
          isMatch,
          hasInvalid,
          isMilestoneRow,
        });
      }
    }

    return { rows, hasErrors: rows.length > 0 };
  }, [csvText]);
}
// Validasi kolom `id` khusus mode edit. Mirror cek backend di
// /streams/edit-csv (server.ts): id harus ada di DB dan stream harus CSV-created.
// Tanpa ini, baris dengan id ngawur (mis. "xxx") tampil "valid" karena
// useCsvMilestoneValidation tidak pernah melihat kolom id.
function useCsvIdValidation(
  csvText: string,
  knownStreams: any[] | undefined,
  enabled: boolean
) {
  return useMemo(() => {
    if (!enabled || !csvText?.trim()) return { issues: [], hasErrors: false };

    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return { issues: [], hasErrors: false };

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idIdx = headers.indexOf("id");
    // Tanpa kolom id, edit memakai identity-match (recipient+mint+type),
    // jadi tidak ada id yang bisa divalidasi di sini.
    if (idIdx === -1) return { issues: [], hasErrors: false };

    const knownById = new Map<string, any>();
    (knownStreams ?? []).forEach((s) => {
      const sid = String(s?.id ?? "").trim();
      if (sid) knownById.set(sid, s);
    });

    const issues: { rowNum: number; id: string; reason: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());
      const id = (values[idIdx] ?? "").trim();
      // Baris tanpa id sengaja memakai identity-match — bukan error.
      if (!id) continue;

      const match = knownById.get(id);
      if (!match) {
        issues.push({ rowNum: i, id, reason: "ID not found in database" });
        continue;
      }
      if (!match.isCsvCreated) {
        issues.push({
          rowNum: i,
          id,
          reason: "Manually-created stream — cannot be edited via CSV",
        });
      }
    }

    return { issues, hasErrors: issues.length > 0 };
  }, [csvText, knownStreams, enabled]);
}

function CsvValidationPanel({
  csvText,
  walletBalance,
  walletMint,
  walletMintLabel,
  walletDecimals,
  editMode,
  editTotalByMint,
  editStreams,
}: {
  csvText: string;
  walletBalance: number | null;
  walletMint: string | null;
  walletMintLabel?: string;
  walletDecimals: number;
  editMode?: boolean;           // ← baru
  editTotalByMint?: Record<string, number>; // ← baru, override total calculation
  editStreams?: any[];          // ← baru, daftar stream live DB untuk validasi id
}) {
  const { rows, hasErrors } = useCsvMilestoneValidation(csvText);
  const { issues: idIssues, hasErrors: hasIdErrors } = useCsvIdValidation(
    csvText,
    editStreams,
    !!editMode
  );
  const totalByMint = useCsvTotalByMint(csvText);

  // ── Per-mint balance check ─────────────────────────────────────────────
 // Kalau editMode, pakai editTotalByMint (hanya milestone + topup linear)
// Kalau create mode, pakai totalByMint biasa dari CSV amount column
const effectiveTotalByMint = editMode && editTotalByMint
  ? editTotalByMint
  : totalByMint;

// Ganti effectiveTotalByMint lookup
const csvTotalForMint = walletMint
  ? ((effectiveTotalByMint[walletMint] ?? 0) +
     (effectiveTotalByMint["__wallet_mint__"] ?? 0))  // ← merge sentinel
  : 0;

const mintExceedsBalance =
  walletMint &&
  walletBalance !== null &&
  csvTotalForMint > walletBalance;

  const hasAnyError = hasErrors || !!mintExceedsBalance || hasIdErrors;

  if (rows.length === 0 && !mintExceedsBalance && idIssues.length === 0) return null;

  const allGood = !hasAnyError;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
      allGood ? "border-emerald-500/30" : "border-rose-500/30"
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        allGood
          ? "border-emerald-500/20 bg-emerald-950/10"
          : "border-rose-500/20 bg-rose-950/10"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${allGood ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
            CSV Validation
            {rows.length > 0 && ` · ${rows.length} milestone row${rows.length > 1 ? "s" : ""}`}
          </span>
        </div>
        <span className={`text-[10px] font-bold ${allGood ? "text-emerald-400" : "text-rose-400"}`}>
          {allGood
            ? "All checks passed"
            : [
                mintExceedsBalance && "insufficient balance",
                hasIdErrors && `${idIssues.length} invalid id${idIssues.length > 1 ? "s" : ""}`,
                hasErrors && `${rows.filter((r) => !r.isMatch || r.hasInvalid).length} unbalanced`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </div>

      {/* ── Balance exceed banner ────────────────────────────────────────── */}
      {mintExceedsBalance && walletBalance !== null && (
        <div className="px-4 py-3 bg-rose-950/20 border-b border-rose-500/20 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
         <div className="text-[11px] font-bold text-rose-300 mb-1">
  {editMode
    ? `Insufficient balance for ${walletMintLabel ?? "selected mint"} (milestone + topup)`
    : `Insufficient balance for ${walletMintLabel ?? "selected mint"}`}
</div>
            <div className="grid grid-cols-3 gap-3 text-[10px] font-mono">
              <div>
                <div className="text-zinc-600 text-[9px] uppercase mb-0.5">CSV Total</div>
                <div className="text-rose-400 font-black">
                  {csvTotalForMint.toLocaleString(undefined, { maximumFractionDigits: walletDecimals })}{walletMintLabel ? ` ${walletMintLabel}` : ""}
                </div>
              </div>
              <div>
                <div className="text-zinc-600 text-[9px] uppercase mb-0.5">Wallet Balance</div>
                <div className="text-zinc-300 font-black">
                  {walletBalance.toLocaleString(undefined, { maximumFractionDigits: walletDecimals })}{walletMintLabel ? ` ${walletMintLabel}` : ""}
                </div>
              </div>
              <div>
                <div className="text-zinc-600 text-[9px] uppercase mb-0.5">Shortfall</div>
                <div className="text-rose-400 font-black">
                  {(csvTotalForMint - walletBalance).toLocaleString(undefined, {
                    maximumFractionDigits: walletDecimals,
                  })}{walletMintLabel ? ` ${walletMintLabel}` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Invalid id rows (edit mode) ──────────────────────────────────── */}
      {idIssues.length > 0 && (
        <div className="border-b border-rose-500/20">
          {idIssues.map((issue) => (
            <div
              key={issue.rowNum}
              className="px-4 py-3 bg-rose-950/20 flex items-start gap-3 border-b border-rose-500/10 last:border-b-0"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-rose-300 mb-0.5">
                  Row #{issue.rowNum} · invalid id
                </div>
                <div className="text-[10px] font-mono text-rose-400/80 break-all mb-0.5">
                  {issue.id}
                </div>
                <div className="text-[10px] text-rose-300/70">{issue.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error rows ──────────────────────────────────────────────────── */}
{rows.length > 0 && (
  <div className="divide-y divide-zinc-900/60">
    {rows.map((row) => {
      const shortRecipient = row.recipient
        ? `${row.recipient.slice(0, 6)}…${row.recipient.slice(-4)}`
        : `Row #${row.rowNum}`;

      return (
        <div key={row.rowNum} className="px-4 py-3 bg-zinc-950/40 space-y-2">
          {/* Row header */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-zinc-500">
              Row #{row.rowNum}
            </span>
            <span className="text-[10px] font-black text-rose-400">
              {[
                row.recipientInvalid && "invalid recipient",
                row.isMilestoneRow && row.hasInvalid && "missing milestone",
                row.isMilestoneRow && !row.hasInvalid && !row.isMatch && "milestone mismatch",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>

          {/* Recipient error */}
          {row.recipientInvalid && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-950/20 px-3 py-2">
              <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-rose-300 mb-0.5">
                  Invalid Solana address
                </div>
                <div className="font-mono text-[10px] text-rose-400/80 break-all">
                  {row.recipient || "(empty)"}
                </div>
              </div>
            </div>
          )}

          {/* Milestone error — hanya kalau isMilestoneRow */}
          {row.isMilestoneRow && (
            <>
              <div className="relative h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                    row.hasInvalid ? "bg-rose-500" :
                    row.isMatch ? "bg-emerald-500" :
                    row.pct > 100 ? "bg-rose-500" : "bg-amber-400"
                  }`}
                  style={{ width: `${Math.min(row.pct, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                <div>
                  <div className="text-zinc-600 text-[9px] uppercase">Allocated</div>
                  <div className={row.isMatch ? "text-emerald-400" : "text-rose-400"}>
                    {row.milestoneSum.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-600 text-[9px] uppercase">Total</div>
                  <div className="text-zinc-300">{row.totalAmount.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-zinc-600 text-[9px] uppercase">
                    {row.remaining < 0 ? "Excess" : "Remaining"}
                  </div>
                  <div className={row.remaining < 0 ? "text-rose-400" : "text-amber-400"}>
                    {Math.abs(row.remaining).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {row.milestones.map((m, idx) => (
                  <span
                    key={idx}
                    className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold border ${
                      m <= 0
                        ? "border-rose-500/40 bg-rose-950/20 text-rose-400"
                        : "border-zinc-800 bg-zinc-900/50 text-zinc-400"
                    }`}
                  >
                    #{idx}: {m}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      );
    })}
  </div>
)}

     {/* Footer */}
{hasAnyError && (
  <div className="px-4 py-3 border-t border-rose-500/20 bg-rose-950/10 flex items-start gap-2">
    <span className="text-rose-400 text-[10px]">⚠</span>
    <p className="text-[10px] text-rose-300/80 leading-relaxed">
      {hasIdErrors
        ? "Fix the invalid id column before applying. Each edit row must reference an existing CSV-created stream id, or leave id blank to match by recipient."
        : mintExceedsBalance && hasErrors
        ? editMode
          ? "Fix balance shortfall (milestone + topup amounts) and milestone allocations before applying."
          : "Fix balance shortfall and milestone allocations before deploying."
        : mintExceedsBalance
        ? editMode
          ? "Top up your wallet or reduce topup/milestone amounts. edit_cliff rows are excluded from this check."
          : "Top up your wallet or reduce total CSV amounts before deploying."
        : "Fix milestone allocations before deploying. Each milestone row requires allocations that sum exactly to total amount."}
    </p>
  </div>
)}
    </div>
  );
}
function useCsvTotalByMint(csvText: string): Record<string, number> {
  return useMemo(() => {
    if (!csvText?.trim()) return {};
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return {};

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const amountIdx = headers.indexOf("amount");
    const mintIdx = headers.indexOf("mint");
    if (amountIdx === -1) return {};

    const totals: Record<string, number> = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());
      const amount = parseFloat(values[amountIdx] ?? "0") || 0;
      const mint = mintIdx !== -1 ? (values[mintIdx] ?? "unknown") : "unknown";
      totals[mint] = (totals[mint] ?? 0) + amount;
    }
    return totals;
  }, [csvText]);
}
function EditMilestonePanel({
  editMilestoneForm,
  setEditMilestoneForm,
  handleAction,
  streams,
  connectedWalletAddress,
  activeTxAction,
  activeTxPhase,
  connected,
  isStreamCsvCreated,
  isMilestoneUnlocked,
  editMilestoneBalance,
  editMilestoneBalanceDecimals,
  editMilestoneMint,
}: {
  editMilestoneForm: {
    streamId: string;
    amounts: string[];
    totalAmount: string;
    mintDecimals: number | null;
  };
  setEditMilestoneForm: (value: any) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  streams: any[];
  connectedWalletAddress: string | null;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
  isStreamCsvCreated: (id: string) => boolean;
  isMilestoneUnlocked: (id: string) => boolean;
  editMilestoneBalance: {
    balance: number | null;
    loading: boolean;
    error: string | null;
    decimals?: number | null;
  };
  editMilestoneBalanceDecimals: number;
  editMilestoneMint: string;
}) {
  // ── Local detail state ─────────────────────────────────────────────────
  const [streamDetail, setStreamDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Total draft — saat user edit total, simpan sementara di sini ───────
  const [editTotalDraft, setEditTotalDraft] = useState<string | null>(null);

  // ── Debounced fetch ────────────────────────────────────────────────────
  useEffect(() => {
    const id = editMilestoneForm.streamId.trim();
    setStreamDetail(null);
    setDetailError(null);
    setEditTotalDraft(null);
    if (!id) return;

    const timer = setTimeout(async () => {
      setDetailLoading(true);
      try {
        const res = await api.get(`/streams/${id}`);
        setStreamDetail(res.data);

        const decimals =
          typeof res.data.mintDecimals === "number"
            ? res.data.mintDecimals
            : 6;
        const rawStr = String(res.data.milestones || "").trim();
        const count = Number(res.data.milestoneCount ?? 0);

        if (rawStr && count > 0) {
          const parsed = rawStr.split(";").map((v: string) => {
            try {
              return formatBaseUnitsToTokenAmount(BigInt(v.trim()), decimals);
            } catch { return "0"; }
          });
          while (parsed.length < count) parsed.push("0");
          const trimmed = parsed.slice(0, count);

          setEditMilestoneForm((prev: any) => ({
            ...prev,
            amounts: trimmed,
            totalAmount: String(res.data.totalAmount ?? ""),
            mintDecimals: decimals,
          }));
        }
      } catch (err: any) {
        setDetailError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to fetch stream details."
        );
      } finally {
        setDetailLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [editMilestoneForm.streamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stream resolution ──────────────────────────────────────────────────
  const streamSummary = useMemo(
    () =>
      streams.find(
        (s) => String(s?.id || "") === editMilestoneForm.streamId.trim()
      ) ?? null,
    [streams, editMilestoneForm.streamId]
  );
  const stream = streamDetail ?? streamSummary;

  // ── Guards ─────────────────────────────────────────────────────────────
  const isCsvCreated = isStreamCsvCreated(editMilestoneForm.streamId);
  const alreadyUnlocked = isMilestoneUnlocked(editMilestoneForm.streamId);
  const isWrongWallet =
    !!editMilestoneForm.streamId.trim() &&
    !!stream &&
    !!connectedWalletAddress &&
    stream.creator?.toLowerCase() !== connectedWalletAddress.toLowerCase();
  const isWrongType = !!stream && Number(stream.vestingType) !== 2;
  const isNotActive = !!stream && Number(stream.status) !== 1;

  // ── Decimals ───────────────────────────────────────────────────────────
// Ganti baris decimals constant
const decimals = Math.max(
  typeof editMilestoneForm.mintDecimals === "number" &&
  editMilestoneForm.mintDecimals !== null
    ? editMilestoneForm.mintDecimals
    : typeof streamDetail?.mintDecimals === "number"
    ? streamDetail.mintDecimals
    : editMilestoneBalanceDecimals,
  0
);

  // ── totalAmount sebagai bigint ─────────────────────────────────────────
const totalAmountBase = useMemo(() => {
  const raw = editMilestoneForm?.totalAmount;
  if (!raw || raw === "" || raw === "null" || raw === "undefined") return BigInt(0);
  try { return BigInt(String(raw).trim()); } catch { return BigInt(0); }
}, [editMilestoneForm?.totalAmount]);

  // ── Display value untuk total input ───────────────────────────────────
  // Saat user sedang ngetik (draft != null), tampilkan draft
  // Saat blur atau tidak ada draft, tampilkan human-readable dari base units
const editTotalValue =
  editTotalDraft !== null
    ? editTotalDraft
    : totalAmountBase > BigInt(0) && decimals >= 0 && streamDetail !== null
    ? formatBaseUnitsToTokenAmount(totalAmountBase, decimals)
    : "";

  // ── Rescale semua milestone proportionally saat total diubah ──────────
 const rescaleMilestonesToTotal = (newTotalHuman: string) => {
  const amounts = Array.isArray(editMilestoneForm.amounts)
    ? editMilestoneForm.amounts
    : [];
  if (amounts.length === 0) return;

  // ← Guard: jangan rescale kalau decimals belum resolve dari stream
  if (!streamDetail && editMilestoneForm.mintDecimals === null) return;

  const safeDecimals =
    typeof editMilestoneForm.mintDecimals === "number"
      ? editMilestoneForm.mintDecimals
      : typeof streamDetail?.mintDecimals === "number"
      ? streamDetail.mintDecimals
      : editMilestoneBalanceDecimals;

  const newTotalBase = parseTokenAmountToBaseUnits(newTotalHuman, safeDecimals);
  if (newTotalBase <= BigInt(0)) return;

  const currentSum = amounts.reduce(
    (sum, v) =>
      sum + parseTokenAmountToBaseUnits(String(v || "0"), safeDecimals),
    BigInt(0)
  );

  let rescaled: string[];
  if (currentSum <= BigInt(0)) {
    const base = newTotalBase / BigInt(amounts.length);
    const remainder = newTotalBase % BigInt(amounts.length);
    rescaled = amounts.map((_, i) =>
      formatBaseUnitsToTokenAmount(
        base + (BigInt(i) < remainder ? BigInt(1) : BigInt(0)),
        safeDecimals
      )
    );
  } else {
    const scaled = amounts.map((v) => {
      const base = parseTokenAmountToBaseUnits(String(v || "0"), safeDecimals);
      return (base * newTotalBase) / currentSum;
    });
    const scaledSum = scaled.reduce((a, b) => a + b, BigInt(0));
    const diff = newTotalBase - scaledSum;
    if (scaled.length > 0) scaled[scaled.length - 1] += diff;
    rescaled = scaled.map((v) =>
      formatBaseUnitsToTokenAmount(v, safeDecimals)
    );
  }

  setEditMilestoneForm({
    ...editMilestoneForm,
    amounts: rescaled,
    totalAmount: String(newTotalBase),
  });
};

  // ── Allocation validation ──────────────────────────────────────────────
  const amounts = Array.isArray(editMilestoneForm.amounts)
    ? editMilestoneForm.amounts
    : [];

  const milestoneAmountBases = useMemo(
    () =>
      amounts.map((v) => {
        try {
          return parseTokenAmountToBaseUnits(String(v || "0"), decimals);
        } catch { return BigInt(0); }
      }),
    [amounts, decimals]
  );

  const milestoneSum = useMemo(
    () => milestoneAmountBases.reduce((a, b) => a + b, BigInt(0)),
    [milestoneAmountBases]
  );

  const hasInvalidAmounts = amounts.some(
    (v) => !v || Number(v) <= 0 || !Number.isFinite(Number(v))
  );

  const matchesTotal =
    totalAmountBase > BigInt(0) ? milestoneSum === totalAmountBase : true;

  const isSubmitting = activeTxAction === "edit_milestone" && !!activeTxPhase;

  const getTxLabel = () => {
    if (activeTxAction !== "edit_milestone" || !activeTxPhase)
      return "Apply All Milestone Edits";
    if (activeTxPhase === "wallet_approval") return "Approve In Wallet...";
    if (activeTxPhase === "sending") return "Sending Transaction...";
    return "Confirming On-Chain...";
  };

  const canSubmit =
    !!editMilestoneForm.streamId.trim() &&
    !isCsvCreated &&
    !isWrongWallet &&
    !isWrongType &&
    !isNotActive &&
    !alreadyUnlocked &&
    !detailLoading &&
    !hasInvalidAmounts &&
    matchesTotal &&
    amounts.length > 0 &&
    connected;

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Edit Milestone Structure
        </h2>
        <p className="text-xs text-zinc-400">
          Modify milestone details or adjust allocated milestone target amounts
        </p>
      </div>

      {/* CSV lock */}
      {isCsvCreated && (
        <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
          <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
            <p className="text-xs text-red-400/80 mt-1 leading-relaxed">
              This stream was created via CSV Import. To comply with consistency
              requirements, CSV-created streams must be edited exclusively using
              the Bulk Edit CSV console.
            </p>
          </div>
        </div>
      )}

      {!isCsvCreated && (
        <div className="grid gap-4 sm:grid-cols-2">

          {/* Stream ID — full width */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Stream ID (PDA Address)
            </label>
            <div className="relative">
              <input
                type="text"
                value={editMilestoneForm.streamId}
                onChange={(e) =>
                  setEditMilestoneForm({
                    ...editMilestoneForm,
                    streamId: e.target.value,
                  })
                }
                placeholder="Paste stream PDA address"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono pr-10"
              />
              {detailLoading && (
                <div className="absolute inset-y-0 right-3 flex items-center">
                  <RefreshCw className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                </div>
              )}
            </div>
            {/* Fetch status */}
            <div className="mt-1.5 h-4 flex items-center">
              {detailLoading && (
                <span className="text-[10px] font-mono text-zinc-600 animate-pulse">
                  fetching stream details…
                </span>
              )}
              {detailError && !detailLoading && (
                <span className="text-[10px] font-semibold text-rose-400">
                  {detailError}
                </span>
              )}
              {streamDetail && !detailLoading && !detailError && (
                <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Stream loaded
                </span>
              )}
            </div>
          </div>

          {/* ── Guards ──────────────────────────────────────────────── */}
          {isWrongWallet && (
            <div className="sm:col-span-2 bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-300 mb-1">
                  Wrong wallet connected
                </p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  Only the stream creator can edit milestones. Creator is{" "}
                  <span className="font-mono text-amber-300 break-all">
                    {stream?.creator
                      ? `${stream.creator.slice(0, 6)}…${stream.creator.slice(-4)}`
                      : "unknown"}
                  </span>
                  , connected wallet is{" "}
                  <span className="font-mono text-amber-300 break-all">
                    {`${connectedWalletAddress!.slice(0, 6)}…${connectedWalletAddress!.slice(-4)}`}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {isWrongType && (
            <div className="sm:col-span-2 bg-zinc-900/60 border border-zinc-700 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-zinc-300 mb-1">
                  Not a milestone stream
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  edit_milestone only applies to Milestone type (type 2)
                  streams. This stream is{" "}
                  {Number(stream?.vestingType) === 0 ? "Linear" : "Cliff"}{" "}
                  type.
                </p>
              </div>
            </div>
          )}

          {isNotActive && !isWrongType && (
            <div className="sm:col-span-2 bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-300/80 leading-relaxed">
                This stream is{" "}
                <strong className="text-rose-300">
                  {Number(stream?.status) === 2 ? "completed" : "cancelled"}
                </strong>{" "}
                and can no longer be edited.
              </p>
            </div>
          )}

          {alreadyUnlocked && !isNotActive && !isWrongType && (
            <div className="sm:col-span-2 bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 text-amber-300 flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-extrabold">
                  Milestone Already Unlocked
                </h4>
                <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">
                  At least one milestone on this stream has already been
                  unlocked, so its milestone structure can no longer be edited.
                </p>
              </div>
            </div>
          )}

          {/* ── Total amount input — full width ───────────────────────── */}
          {amounts.length > 0 && !isWrongType && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Total Amount
              </label>
              <input
                type="text"
                inputMode="decimal"
                lang="en"
                value={editTotalValue}
                onChange={(e) => {
                  const normalized = normalizeDecimalInput(e.target.value);
                  setEditTotalDraft(normalized);
                  rescaleMilestonesToTotal(
                    normalized === "" ? "0" : normalized
                  );
                }}
                onBlur={() => setEditTotalDraft(null)}
                className="w-full bg-zinc-950 border border-indigo-500/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="0"
              />
              <p className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed">
                Changing the total scales every milestone proportionally,
                keeping the ratio between milestones intact.
              </p>
            </div>
          )}

          {/* ── Per-milestone inputs ──────────────────────────────────── */}
          {amounts.map((amount: string, index: number) => {
            const val = Number(amount || 0);
            const isEmpty = !amount || amount === "0";
            const isInvalid =
              isEmpty || val <= 0 || !Number.isFinite(val);
            const pctOfTotal =
              totalAmountBase > BigInt(0)
                ? (
                    (Number(milestoneAmountBases[index] ?? BigInt(0)) /
                      Number(totalAmountBase)) *
                    100
                  ).toFixed(1)
                : "0.0";

            return (
              <div key={index}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Milestone #{index}
                  </label>
                  <span
                    className={`text-[9px] font-mono font-bold ${
                      isInvalid ? "text-zinc-600" : "text-indigo-400"
                    }`}
                  >
                    {isInvalid ? "—" : `${pctOfTotal}%`}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  lang="en"
                  value={amount}
                  onChange={(e) => {
                    const next = [
                      ...(Array.isArray(editMilestoneForm.amounts)
                        ? editMilestoneForm.amounts
                        : []),
                    ];
                    const normalized = normalizeDecimalInput(e.target.value);
                    next[index] = normalized === "" ? "0" : normalized;
                    setEditTotalDraft(null);
                    setEditMilestoneForm({
                      ...editMilestoneForm,
                      amounts: next,
                    });
                  }}
                  className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono transition-colors ${
                    isInvalid
                      ? "border-rose-500/50 focus:border-rose-500"
                      : "border-zinc-800 focus:border-indigo-500"
                  }`}
                  placeholder="0"
                />
              </div>
            );
          })}

          {/* ── Balance row ───────────────────────────────────────────── */}
          <div className="sm:col-span-2">
            {editMilestoneBalance.loading ? (
              <span className="text-[10px] font-mono text-zinc-600 animate-pulse">
                fetching balance…
              </span>
            ) : editMilestoneBalance.error !== null ? (
              <span className="text-[10px] font-mono text-zinc-600">
                balance unavailable
              </span>
            ) : editMilestoneMint &&
              editMilestoneBalance.balance !== null ? (
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="text-[10px] font-mono text-zinc-500">
                  Wallet Balance:{" "}
                  {editMilestoneBalance.balance.toLocaleString(undefined, {
                    maximumFractionDigits: editMilestoneBalanceDecimals,
                  })}
                </span>
              </div>
            ) : null}
          </div>

          {/* ── Allocation counter ────────────────────────────────────── */}
          <div className="sm:col-span-2">
            <MilestoneAllocationCounter
              amounts={amounts.map((v: string) =>
                formatBaseUnitsToTokenAmount(
                  parseTokenAmountToBaseUnits(
                    String(v || "0"),
                    decimals
                  ),
                  decimals
                )
              )}
              total={Number(
                formatBaseUnitsToTokenAmount(totalAmountBase, decimals)
              )}
              hasInvalid={hasInvalidAmounts}
              isMatch={matchesTotal}
            />
          </div>

          {/* Stream not found hint */}
          {editMilestoneForm.streamId.trim() &&
            !stream &&
            !detailLoading &&
            !detailError && (
              <div className="sm:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span className="text-[11px] text-zinc-500">
                  Stream not found in index — preview unavailable until the
                  indexer syncs.
                </span>
              </div>
            )}
        </div>
      )}

      {/* Submit button */}
      <button
        disabled={!canSubmit}
        onClick={() => handleAction("edit_milestone", editMilestoneForm)}
        className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
          !canSubmit
            ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50"
            : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Layers className="w-4 h-4" />
        )}
        {!connected
          ? "Connect wallet to edit"
          : isCsvCreated
          ? "Use CSV Console to edit"
          : isWrongWallet
          ? "Wrong wallet — switch to creator wallet"
          : isWrongType
          ? "Not a milestone stream"
          : isNotActive
          ? Number(stream?.status) === 2
            ? "Stream already completed"
            : "Stream cancelled"
          : alreadyUnlocked
          ? "Cannot edit — milestone already unlocked"
          : detailLoading
          ? "Loading stream..."
          : getTxLabel()}
      </button>
    </div>
  );
}
// ─── Edit Cliff Panel ──────────────────────────────────────────────────────
function EditCliffPanel({
  editCliffForm,
  setEditCliffForm,
  handleAction,
  streams,
  connectedWalletAddress,
  activeTxAction,
  activeTxPhase,
  connected,
  isStreamCsvCreated,
}: {
  editCliffForm: { streamId: string; newCliffDuration: string };
  setEditCliffForm: (value: any) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  streams: any[];
  connectedWalletAddress: string | null;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
  isStreamCsvCreated: (id: string) => boolean;
}) {
  const nowTs = Math.floor(Date.now() / 1000);

  // ── Resolve stream ─────────────────────────────────────────────────────
  const stream = useMemo(
    () =>
      streams.find(
        (s) => String(s?.id || "") === editCliffForm.streamId.trim()
      ) ?? null,
    [streams, editCliffForm.streamId]
  );

  // ── Guards ─────────────────────────────────────────────────────────────
  const isCsvCreated = isStreamCsvCreated(editCliffForm.streamId);

  const isWrongWallet =
    !!editCliffForm.streamId.trim() &&
    !!stream &&
    !!connectedWalletAddress &&
    stream.creator?.toLowerCase() !== connectedWalletAddress.toLowerCase();

  const isWrongType =
    !!stream && Number(stream.vestingType) !== 1;

  const isNotActive =
    !!stream && Number(stream.status) !== 1;

  const isCliffExpired =
    !!stream &&
    Number(stream.cliffTs ?? 0) > 0 &&
    nowTs >= Number(stream.cliffTs);

  const isStreamExpired =
    !!stream &&
    Number(stream.endTs ?? 0) > 0 &&
    nowTs >= Number(stream.endTs);

  const hasWithdrawn =
    !!stream && parseBaseUnits(stream.withdrawn ?? 0) > BigInt(0);

  // ── Current state preview ──────────────────────────────────────────────
  const currentPreview = useMemo(() => {
    if (!stream) return null;

    const decimals =
      typeof stream.mintDecimals === "number" ? stream.mintDecimals : 6;
    const startTs = Number(stream.startTs ?? 0);
    const endTs = Number(stream.endTs ?? 0);
    const cliffTs = Number(stream.cliffTs ?? 0);
    const currentCliffDuration = cliffTs - startTs;

    return {
      startTs,
      endTs,
      cliffTs,
      currentCliffDuration,
      cliffDateStr:
        cliffTs > 0 ? new Date(cliffTs * 1000).toLocaleString() : "—",
      endDateStr:
        endTs > 0 ? new Date(endTs * 1000).toLocaleString() : "—",
      totalAmount: Number(
        formatBaseUnitsToTokenAmount(parseBaseUnits(stream.totalAmount), decimals)
      ).toLocaleString(undefined, { maximumFractionDigits: decimals }),
    };
  }, [stream]);

  // ── New cliff preview ──────────────────────────────────────────────────
  const newCliffPreview = useMemo(() => {
    if (!currentPreview) return null;
    const newDuration = Number(editCliffForm.newCliffDuration ?? 0);
    if (!Number.isFinite(newDuration) || newDuration < 0) return null;

    const newCliffTs = currentPreview.startTs + newDuration;
    const newCliffDateStr = new Date(newCliffTs * 1000).toLocaleString();
    const isSame = newCliffTs === currentPreview.cliffTs;
    const isBeforeNow = newCliffTs <= nowTs;
    const isAfterEnd = newCliffTs > currentPreview.endTs;
    const diffSeconds = newCliffTs - currentPreview.cliffTs;

    return {
      newCliffTs,
      newCliffDateStr,
      isSame,
      isBeforeNow,
      isAfterEnd,
      diffSeconds,
      isValid: !isSame && !isBeforeNow && !isAfterEnd,
    };
  }, [currentPreview, editCliffForm.newCliffDuration, nowTs]);

  // ── Input-level validation ─────────────────────────────────────────────
  const newDurationEmpty = !String(editCliffForm.newCliffDuration ?? "").trim();
  const cliffBeforeNow = !!newCliffPreview?.isBeforeNow;
  const cliffAfterEnd = !!newCliffPreview?.isAfterEnd;
  const cliffSameAsCurrent = !!newCliffPreview?.isSame;

  const isSubmitting = activeTxAction === "edit_cliff" && !!activeTxPhase;

  const getTxLabel = () => {
    if (activeTxAction !== "edit_cliff" || !activeTxPhase)
      return "Adjust Cliff Timestamp";
    if (activeTxPhase === "wallet_approval") return "Approve In Wallet...";
    if (activeTxPhase === "sending") return "Sending Transaction...";
    return "Confirming On-Chain...";
  };

  const canSubmit =
    !!editCliffForm.streamId.trim() &&
    !isCsvCreated &&
    !isWrongWallet &&
    !isWrongType &&
    !isNotActive &&
    !isCliffExpired &&
    !isStreamExpired &&
    !hasWithdrawn &&
    !newDurationEmpty &&
    !cliffBeforeNow &&
    !cliffAfterEnd &&
    !cliffSameAsCurrent &&
    !isSubmitting &&
    connected;

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Edit Cliff Conditions
        </h2>
        <p className="text-xs text-zinc-400">
          Modify cliff release duration or shift lockup parameters
        </p>
      </div>

      {/* CSV lock */}
      {isCsvCreated && (
        <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
          <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
            <p className="text-xs text-red-400/80 mt-1 leading-relaxed">
              This stream was created via CSV Import. Edit it using the Bulk
              Edit CSV console.
            </p>
          </div>
        </div>
      )}

      {!isCsvCreated && (
        <div className="grid gap-4">
          {/* Stream ID */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Stream ID (PDA Address)
            </label>
            <input
              type="text"
              value={editCliffForm.streamId}
              onChange={(e) =>
                setEditCliffForm({
                  ...editCliffForm,
                  streamId: e.target.value,
                })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              placeholder="Paste stream PDA address"
            />
          </div>

          {/* ── Wrong wallet ──────────────────────────────────────────── */}
          {isWrongWallet && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-300 mb-1">
                  Wrong wallet connected
                </p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  Only the stream creator can edit the cliff. Creator is{" "}
                  <span className="font-mono text-amber-300 break-all">
                    {stream?.creator
                      ? `${stream.creator.slice(0, 6)}…${stream.creator.slice(-4)}`
                      : "unknown"}
                  </span>
                  , connected wallet is{" "}
                  <span className="font-mono text-amber-300 break-all">
                    {`${connectedWalletAddress!.slice(0, 6)}…${connectedWalletAddress!.slice(-4)}`}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {/* ── Wrong type ────────────────────────────────────────────── */}
          {isWrongType && (
            <div className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-zinc-300 mb-1">
                  Not a cliff stream
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  edit_cliff only applies to Cliff type (type 1) streams. This
                  stream is{" "}
                  {Number(stream?.vestingType) === 0
                    ? "Linear"
                    : "Milestone"}{" "}
                  type.
                </p>
              </div>
            </div>
          )}

          {/* ── Not active ────────────────────────────────────────────── */}
          {isNotActive && !isWrongType && (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-300/80 leading-relaxed">
                This stream is{" "}
                <strong className="text-rose-300">
                  {Number(stream?.status) === 2 ? "completed" : "cancelled"}
                </strong>{" "}
                and can no longer be edited.
              </p>
            </div>
          )}

          {/* ── Cliff already expired ─────────────────────────────────── */}
          {isCliffExpired && !isNotActive && !isWrongType && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-300 mb-1">
                  Cliff period has already passed
                </p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  The cliff timestamp{" "}
                  <span className="font-mono text-amber-300">
                    {currentPreview?.cliffDateStr}
                  </span>{" "}
                  has already elapsed — the cliff can no longer be adjusted.
                </p>
              </div>
            </div>
          )}

          {/* ── Stream expired ────────────────────────────────────────── */}
          {isStreamExpired && !isNotActive && !isWrongType && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Stream end date has already passed — the stream has expired.
              </p>
            </div>
          )}

          {/* ── Already withdrawn ─────────────────────────────────────── */}
          {hasWithdrawn && !isNotActive && !isWrongType && !isCliffExpired && (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
              <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-300/80 leading-relaxed">
                Tokens have already been withdrawn from this stream — the cliff
                timestamp can no longer be modified.
              </p>
            </div>
          )}

          {/* ── Current state preview ─────────────────────────────────── */}
          {currentPreview && !isWrongType && (
            <div className="rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-900 bg-zinc-950/60">
                <Lock className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Current Cliff State
                </span>
              </div>
              <div className="divide-y divide-zinc-900/60">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">
                    Current cliff date
                  </span>
                  <span className="font-mono text-sm font-bold text-violet-300">
                    {currentPreview.cliffDateStr}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">
                    Cliff duration (from start)
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-300">
                    {currentPreview.currentCliffDuration.toLocaleString()}s
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Stream end date</span>
                  <span className="font-mono text-sm font-bold text-zinc-500">
                    {currentPreview.endDateStr}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">
                    Total allocation
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-200">
                    {currentPreview.totalAmount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── New cliff duration input ──────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              New Cliff Duration{" "}
              <span className="text-zinc-600 normal-case font-normal">
                (seconds from original start)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                value={editCliffForm.newCliffDuration}
                onChange={(e) =>
                  setEditCliffForm({
                    ...editCliffForm,
                    newCliffDuration: e.target.value,
                  })
                }
                className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 pr-12 text-sm focus:outline-none font-mono transition-colors ${
                  (cliffBeforeNow || cliffAfterEnd || cliffSameAsCurrent) &&
                  !newDurationEmpty
                    ? "border-rose-500/60 focus:border-rose-500"
                    : "border-zinc-800 focus:border-indigo-500"
                }`}
                placeholder={
                  currentPreview
                    ? `Current: ${currentPreview.currentCliffDuration}s`
                    : "Seconds from start date"
                }
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-black uppercase tracking-wider text-zinc-500">
                sec
              </span>
            </div>

            {/* Quick presets relative to current cliff duration */}
            {currentPreview && (
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: "+1M", add: 60 * 60 * 24 * 30 },
                  { label: "+3M", add: 60 * 60 * 24 * 90 },
                  { label: "+6M", add: 60 * 60 * 24 * 180 },
                  { label: "+1Y", add: 60 * 60 * 24 * 365 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      setEditCliffForm({
                        ...editCliffForm,
                        newCliffDuration: String(
                          currentPreview.currentCliffDuration + p.add
                        ),
                      })
                    }
                    className="px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase text-zinc-300 hover:border-violet-500 hover:text-white transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {/* Validation messages */}
            {!newDurationEmpty && newCliffPreview && (
              <div className="mt-2 text-[10px] font-mono">
                {cliffBeforeNow ? (
                  <span className="text-rose-400">
                    ✕ New cliff timestamp would be in the past — must be after
                    now.
                  </span>
                ) : cliffAfterEnd ? (
                  <span className="text-rose-400">
                    ✕ New cliff must be before stream end date (
                    {currentPreview?.endDateStr}).
                  </span>
                ) : cliffSameAsCurrent ? (
                  <span className="text-zinc-500">
                    Same as current cliff — change the value to proceed.
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    ≈ new cliff{" "}
                    <span className="text-violet-300">
                      {newCliffPreview.newCliffDateStr}
                    </span>
                    {newCliffPreview.diffSeconds !== 0 && (
                      <span className="text-zinc-600 ml-2">
                        ({newCliffPreview.diffSeconds > 0 ? "+" : ""}
                        {newCliffPreview.diffSeconds.toLocaleString()}s from
                        current)
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Changes preview card ──────────────────────────────────── */}
          {currentPreview &&
            !isWrongType &&
            !isNotActive &&
            !isCliffExpired &&
            !isStreamExpired &&
            !hasWithdrawn &&
            newCliffPreview?.isValid && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-950/10 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-500/10">
                  <Check className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-400/80">
                    Changes Preview
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-400">Cliff date</span>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-zinc-600 line-through">
                      {currentPreview.cliffDateStr}
                    </div>
                    <div className="font-mono text-sm font-bold text-violet-300">
                      {newCliffPreview.newCliffDateStr}
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      {/* Submit button */}
      <button
        disabled={!canSubmit}
        onClick={() => handleAction("edit_cliff", editCliffForm)}
        className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
          !canSubmit
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
            : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Lock className="w-4 h-4" />
        )}
        {!connected
          ? "Connect wallet to edit"
          : isCsvCreated
          ? "Use CSV Console to edit"
          : isWrongWallet
          ? "Wrong wallet — switch to creator wallet"
          : isWrongType
          ? "Not a cliff stream"
          : isNotActive
          ? Number(stream?.status) === 2
            ? "Stream already completed"
            : "Stream cancelled"
          : isCliffExpired
          ? "Cliff period has already passed"
          : isStreamExpired
          ? "Stream has expired"
          : hasWithdrawn
          ? "Cannot edit — tokens already withdrawn"
          : getTxLabel()}
      </button>
    </div>
  );
}
// ─── Edit Linear Panel ─────────────────────────────────────────────────────
function EditLinearPanel({
  editLinearForm,
  setEditLinearForm,
  handleAction,
  streams,
  connectedWalletAddress,
  activeTxAction,
  activeTxPhase,
  connected,
  endpoint,
  isStreamCsvCreated,
  editLinearBalance,
  editLinearExceedsBalance,
  editLinearDecimals,
  editLinearMint,
}: {
  editLinearForm: { streamId: string; newEndDuration: string; topupAmount: string };
  setEditLinearForm: (value: any) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  streams: any[];
  connectedWalletAddress: string | null;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
  endpoint: string;
  isStreamCsvCreated: (id: string) => boolean;
editLinearBalance: { balance: number | null; loading: boolean; error: string | null; decimals?: number | null };
  editLinearExceedsBalance: boolean;
  editLinearDecimals: number;
  editLinearMint: string;
}) {
  // ── Resolve stream dari streams[] ──────────────────────────────────────
  const stream = useMemo(
    () =>
      streams.find(
        (s) => String(s?.id || "") === editLinearForm.streamId.trim()
      ) ?? null,
    [streams, editLinearForm.streamId]
  );

  const nowTs = Math.floor(Date.now() / 1000);

  // ── Validasi guards ────────────────────────────────────────────────────
  const isCsvCreated = isStreamCsvCreated(editLinearForm.streamId);

  const isWrongWallet =
    !!editLinearForm.streamId.trim() &&
    !!stream &&
    !!connectedWalletAddress &&
    stream.creator?.toLowerCase() !== connectedWalletAddress.toLowerCase();

  const isWrongType =
    !!stream &&
    Number(stream.vestingType) !== 0 &&
    Number(stream.vestingType) !== 1;

  const isNotActive =
    !!stream && Number(stream.status) !== 1;

  const isExpired =
    !!stream &&
    Number(stream.endTs ?? 0) > 0 &&
    nowTs >= Number(stream.endTs);

  // ── Current stream state preview ───────────────────────────────────────
  const currentPreview = useMemo(() => {
    if (!stream) return null;

    const decimals =
      typeof stream.mintDecimals === "number" ? stream.mintDecimals : 6;
    const startTs = Number(stream.startTs ?? 0);
    const endTs = Number(stream.endTs ?? 0);
    const currentDuration = endTs - startTs;

    const fmt = (v: any) =>
      Number(
        formatBaseUnitsToTokenAmount(parseBaseUnits(v), decimals)
      ).toLocaleString(undefined, { maximumFractionDigits: decimals });

    return {
      totalAmount: fmt(stream.totalAmount),
      withdrawn: fmt(stream.withdrawn ?? 0),
      startTs,
      endTs,
      currentDuration,
      decimals,
      vestingType: Number(stream.vestingType ?? 0),
      endDateStr: endTs > 0 ? new Date(endTs * 1000).toLocaleString() : "—",
    };
  }, [stream]);

  // ── New end timestamp preview ──────────────────────────────────────────
  const newEndPreview = useMemo(() => {
    if (!currentPreview) return null;
    const newDuration = Number(editLinearForm.newEndDuration ?? 0);
    if (!Number.isFinite(newDuration) || newDuration <= 0) return null;
    const newEndTs = currentPreview.startTs + newDuration;
    const extensionSeconds = newEndTs - currentPreview.endTs;
    return {
      newEndTs,
      newEndDateStr: new Date(newEndTs * 1000).toLocaleString(),
      extensionSeconds,
      isExtension: extensionSeconds > 0,
      isShorter: extensionSeconds < 0,
      isSame: extensionSeconds === 0,
    };
  }, [currentPreview, editLinearForm.newEndDuration]);

  // ── Duration must be longer than current ──────────────────────────────
  const durationNotExtended =
    !!newEndPreview && !newEndPreview.isExtension;

  // ── At least one of duration/topup must be provided ───────────────────
  const neitherProvided =
    !String(editLinearForm.newEndDuration ?? "").trim() &&
    !String(editLinearForm.topupAmount ?? "").trim();

  const isSubmitting = activeTxAction === "edit_linear" && !!activeTxPhase;

  const getTxLabel = () => {
    if (activeTxAction !== "edit_linear" || !activeTxPhase)
      return "Update End Timeline & Top-up Stream";
    if (activeTxPhase === "wallet_approval") return "Approve In Wallet...";
    if (activeTxPhase === "sending") return "Sending Transaction...";
    return "Confirming On-Chain...";
  };

  const canSubmit =
    !!editLinearForm.streamId.trim() &&
    !isCsvCreated &&
    !isWrongWallet &&
    !isWrongType &&
    !isNotActive &&
    !isExpired &&
    !isSubmitting &&
    !neitherProvided &&
    !durationNotExtended &&
    !editLinearExceedsBalance &&
    connected;

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Edit Linear Timeline
        </h2>
        <p className="text-xs text-zinc-400">
          Extend stream end date and/or top up token allocation
        </p>
      </div>

      {/* CSV lock */}
      {isCsvCreated && (
        <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
          <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
            <p className="text-xs text-red-400/80 mt-1 leading-relaxed">
              This stream was created via CSV Import. Edit it using the Bulk
              Edit CSV console.
            </p>
          </div>
        </div>
      )}

      {!isCsvCreated && (
        <div className="grid gap-4">
          {/* Stream ID */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Stream ID (PDA Address)
            </label>
            <input
              type="text"
              value={editLinearForm.streamId}
              onChange={(e) =>
                setEditLinearForm({
                  ...editLinearForm,
                  streamId: e.target.value,
                })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              placeholder="Paste stream PDA address"
            />
          </div>

          {/* ── Wrong wallet ──────────────────────────────────────────── */}
          {isWrongWallet && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-300 mb-1">
                  Wrong wallet connected
                </p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  Only the stream creator can edit. Creator is{" "}
                  <span className="font-mono text-amber-300 break-all">
                    {stream?.creator
                      ? `${stream.creator.slice(0, 6)}…${stream.creator.slice(-4)}`
                      : "unknown"}
                  </span>
                  , connected wallet is{" "}
                  <span className="font-mono text-amber-300 break-all">
                    {`${connectedWalletAddress!.slice(0, 6)}…${connectedWalletAddress!.slice(-4)}`}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {/* ── Wrong type ────────────────────────────────────────────── */}
          {isWrongType && (
            <div className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-zinc-300 mb-1">
                  Not a linear or cliff stream
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  edit_linear only applies to Linear (type 0) and Cliff (type
                  1) streams. This stream is Milestone type.
                </p>
              </div>
            </div>
          )}

          {/* ── Not active ────────────────────────────────────────────── */}
          {isNotActive && !isWrongType && (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-300/80 leading-relaxed">
                This stream is{" "}
                <strong className="text-rose-300">
                  {Number(stream?.status) === 2 ? "completed" : "cancelled"}
                </strong>{" "}
                and can no longer be edited.
              </p>
            </div>
          )}

          {/* ── Expired ───────────────────────────────────────────────── */}
          {isExpired && !isNotActive && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Stream end date has already passed — the stream has expired and
                cannot be extended.
              </p>
            </div>
          )}

          {/* ── Current state preview ─────────────────────────────────── */}
          {currentPreview && !isWrongType && (
            <div className="rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-900 bg-zinc-950/60">
                <Settings className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Current Stream State
                </span>
                <span className="ml-auto text-[10px] font-mono text-zinc-600">
                  {currentPreview.vestingType === 0 ? "Linear" : "Cliff"}
                </span>
              </div>
              <div className="divide-y divide-zinc-900/60">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Total allocation</span>
                  <span className="font-mono text-sm font-bold text-zinc-200">
                    {currentPreview.totalAmount}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Already withdrawn</span>
                  <span className="font-mono text-sm font-bold text-zinc-500">
                    {currentPreview.withdrawn}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Current end date</span>
                  <span className="font-mono text-sm font-bold text-zinc-300">
                    {currentPreview.endDateStr}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">
                    Current duration (from start)
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-300">
                    {currentPreview.currentDuration.toLocaleString()}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── New duration input ────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              New Stream Duration{" "}
              <span className="text-zinc-600 normal-case font-normal">
                (seconds from original start)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                value={editLinearForm.newEndDuration}
                onChange={(e) =>
                  setEditLinearForm({
                    ...editLinearForm,
                    newEndDuration: e.target.value,
                  })
                }
                className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 pr-12 text-sm focus:outline-none font-mono transition-colors ${
                  durationNotExtended
                    ? "border-rose-500/60 focus:border-rose-500"
                    : "border-zinc-800 focus:border-indigo-500"
                }`}
                placeholder={
                  currentPreview
                    ? `Current: ${currentPreview.currentDuration}s — enter larger value`
                    : "Seconds from start date"
                }
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-black uppercase tracking-wider text-zinc-500">
                sec
              </span>
            </div>

            {/* Quick preset buttons relative to current duration */}
            {currentPreview && (
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: "+1M", add: 60 * 60 * 24 * 30 },
                  { label: "+3M", add: 60 * 60 * 24 * 90 },
                  { label: "+6M", add: 60 * 60 * 24 * 180 },
                  { label: "+1Y", add: 60 * 60 * 24 * 365 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      setEditLinearForm({
                        ...editLinearForm,
                        newEndDuration: String(
                          currentPreview.currentDuration + p.add
                        ),
                      })
                    }
                    className="px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase text-zinc-300 hover:border-indigo-500 hover:text-white transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {/* New end date preview */}
            {newEndPreview && (
              <div
                className={`mt-2 text-[10px] font-mono ${
                  durationNotExtended ? "text-rose-400" : "text-zinc-500"
                }`}
              >
                {durationNotExtended ? (
                  <>
                    ✕ New duration must be longer than current (
                    {currentPreview?.currentDuration.toLocaleString()}s)
                  </>
                ) : (
                  <>
                    ≈ new end{" "}
                    <span className="text-indigo-300">
                      {newEndPreview.newEndDateStr}
                    </span>
                    {newEndPreview.extensionSeconds > 0 && (
                      <span className="text-zinc-600 ml-2">
                        (+{newEndPreview.extensionSeconds.toLocaleString()}s
                        extension)
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Top-up amount input ───────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Top-up Amount{" "}
              <span className="text-zinc-600 normal-case font-normal">
                (tokens to add — leave 0 to skip)
              </span>
            </label>
            <input
              type="number"
              min="0"
              value={editLinearForm.topupAmount}
              onChange={(e) =>
                setEditLinearForm({
                  ...editLinearForm,
                  topupAmount: e.target.value,
                })
              }
              className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono transition-colors ${
                editLinearExceedsBalance
                  ? "border-rose-500/60 focus:border-rose-500"
                  : "border-zinc-800 focus:border-indigo-500"
              }`}
              placeholder="0"
            />

            {/* Balance row */}
            <div className="mt-1.5 flex items-center gap-2">
              {!connected ? null : editLinearBalance.loading ? (
                <span className="text-[10px] font-mono text-zinc-600 animate-pulse">
                  fetching balance…
                </span>
              ) : editLinearBalance.error ? (
                <span className="text-[10px] font-mono text-zinc-600">
                  balance unavailable
                </span>
              ) : !editLinearMint ? null : editLinearBalance.balance !==
                null ? (
                <span
                  className={`text-[10px] font-mono ${
                    editLinearExceedsBalance
                      ? "text-rose-400"
                      : "text-zinc-500"
                  }`}
                >
                  Balance:{" "}
                  {editLinearBalance.balance.toLocaleString(undefined, {
                    maximumFractionDigits: editLinearDecimals,
                  })}
                </span>
              ) : null}
            </div>

            {editLinearExceedsBalance && (
              <div className="mt-1 text-[10px] font-semibold text-rose-400">
                Top-up amount exceeds wallet balance of{" "}
                {editLinearBalance.balance!.toLocaleString(undefined, {
                  maximumFractionDigits: editLinearDecimals,
                })}{" "}
                tokens.
              </div>
            )}
          </div>

          {/* ── Neither provided warning ──────────────────────────────── */}
          {neitherProvided && editLinearForm.streamId.trim() && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              <span className="text-[11px] text-zinc-500">
                Provide a new duration, a top-up amount, or both.
              </span>
            </div>
          )}

          {/* ── Change summary ────────────────────────────────────────── */}
          {currentPreview &&
            !isWrongType &&
            !isNotActive &&
            !isExpired &&
            (newEndPreview?.isExtension ||
              (Number(editLinearForm.topupAmount) > 0 &&
                !editLinearExceedsBalance)) && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/10 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-500/10">
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400/80">
                    Changes Preview
                  </span>
                </div>
                <div className="divide-y divide-indigo-500/10">
                  {newEndPreview?.isExtension && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-zinc-400">
                        End date
                      </span>
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-zinc-600 line-through">
                          {currentPreview.endDateStr}
                        </div>
                        <div className="font-mono text-sm font-bold text-indigo-300">
                          {newEndPreview.newEndDateStr}
                        </div>
                      </div>
                    </div>
                  )}
                  {Number(editLinearForm.topupAmount) > 0 &&
                    !editLinearExceedsBalance && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-xs text-zinc-400">
                          Total allocation
                        </span>
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-zinc-600 line-through">
                            {currentPreview.totalAmount}
                          </div>
                          <div className="font-mono text-sm font-bold text-emerald-300">
                            +{editLinearForm.topupAmount} tokens added
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Submit button */}
      <button
        disabled={!canSubmit}
        onClick={() => handleAction("edit_linear", editLinearForm)}
        className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
          !canSubmit
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
            : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Settings className="w-4 h-4" />
        )}
        {!connected
          ? "Connect wallet to edit"
          : isCsvCreated
          ? "Use CSV Console to edit"
          : isWrongWallet
          ? "Wrong wallet — switch to creator wallet"
          : isWrongType
          ? "Not a linear or cliff stream"
          : isNotActive
          ? Number(stream?.status) === 2
            ? "Stream already completed"
            : "Stream cancelled"
          : isExpired
          ? "Stream has expired"
          : getTxLabel()}
      </button>
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────
// ─── MilestoneAllocationCounter ──────────────────────────────────────────
function MilestoneAllocationCounter({
  amounts,
  total,
  hasInvalid,
  isMatch,
}: {
  amounts: string[];
  total: number;
  hasInvalid: boolean;
  isMatch: boolean;
}) {
  const filled = amounts.reduce((acc, v) => acc + Number(v || 0), 0);
  const remaining = total - filled;
  const pct = total > 0 ? Math.min(100, (filled / total) * 100) : 0;

  const barColor = hasInvalid
    ? "bg-rose-500"
    : isMatch
    ? "bg-emerald-500"
    : pct > 100
    ? "bg-rose-500"
    : "bg-amber-400";

  const borderColor = hasInvalid
    ? "border-rose-500/40"
    : isMatch
    ? "border-emerald-500/40"
    : "border-amber-500/30";

  const textColor = hasInvalid
    ? "text-rose-400"
    : isMatch
    ? "text-emerald-400"
    : pct > 100
    ? "text-rose-400"
    : "text-amber-400";

  return (
    <div className={`rounded-2xl border ${borderColor} bg-zinc-950/80 overflow-hidden transition-all duration-300`}>
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900/60">
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Milestone Allocation
        </span>
        <span className={`text-[11px] font-black font-mono ${textColor} transition-colors duration-200`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="relative h-2 w-full rounded-full bg-zinc-900 overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
          {/* Overflow indicator */}
          {pct > 100 && (
            <div className="absolute right-0 top-0 h-full w-1.5 rounded-full bg-rose-500 animate-pulse" />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-zinc-900 px-0 pb-3 pt-2">
        <div className="flex flex-col items-center px-3 py-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mb-0.5">Allocated</span>
          <span className={`text-[13px] font-black font-mono ${textColor} transition-colors`}>
            {filled.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col items-center px-3 py-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mb-0.5">Total</span>
          <span className="text-[13px] font-black font-mono text-zinc-300">
            {total.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col items-center px-3 py-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mb-0.5">
            {remaining < 0 ? "Excess" : "Remaining"}
          </span>
          <span className={`text-[13px] font-black font-mono ${remaining < 0 ? "text-rose-400" : remaining === 0 ? "text-emerald-400" : "text-zinc-400"} transition-colors`}>
            {Math.abs(remaining).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Status message */}
      <div className={`px-4 py-2 border-t border-zinc-900/60 text-[10px] font-semibold flex items-center gap-1.5 ${textColor}`}>
        {hasInvalid ? (
          <><span className="text-rose-400">●</span> All milestone fields must be filled and greater than zero</>
        ) : isMatch ? (
          <><span className="text-emerald-400">●</span> Allocations balanced — ready to deploy</>
        ) : pct > 100 ? (
          <><span className="text-rose-400">●</span> Over-allocated by {Math.abs(remaining).toLocaleString()} tokens</>
        ) : (
          <><span className="text-amber-400">●</span> {remaining.toLocaleString()} tokens unallocated</>
        )}
      </div>
    </div>
  );
}