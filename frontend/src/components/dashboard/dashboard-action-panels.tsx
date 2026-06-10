"use client";

import type { ChangeEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AlertTriangle, Check, ChevronDown, Shield, Download, Layers, Lock, RefreshCw, Terminal, Upload, XCircle } from "lucide-react";
import { CsvDiffPanel } from "@/components/dashboard/csv-diff-panel";
import type { MintPreset } from "@/components/dashboard/token-mints";
import { PreflightChecklist } from "./preflight-checklist";
import { useTokenBalance } from "@/lib/use-token-balance";
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

// ─── Cancel Panel (manages dialog state) ─────────────────────────────────
function CancelPanel({
  cancelForm,
  setCancelForm,
  handleAction,
  isSubmitting,
  submitLabel,
}: {
  cancelForm: { streamId: string };
  setCancelForm: (value: { streamId: string }) => void;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const [showDialog, setShowDialog] = useState(false);

  const handleConfirm = () => {
    setShowDialog(false);
    handleAction("cancel", cancelForm);
  };

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Cancel Stream</h2>
        <p className="text-xs text-zinc-400">Cancel vesting and refund remaining locked tokens back to creator</p>
      </div>

      {/* Stream ID */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
          Stream ID (PDA Address)
        </label>
        <input
          type="text"
          value={cancelForm.streamId}
          onChange={(e) => setCancelForm({ ...cancelForm, streamId: e.target.value })}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600 font-mono"
        />
      </div>

      {/* Warning card */}
      <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-rose-300/80 leading-relaxed">
          Cancelling a stream is <strong className="text-rose-300">permanent</strong>. The recipient will lose access
          to all unvested tokens. Locked funds will be returned to the creator wallet on-chain.
        </p>
      </div>

      {/* Trigger */}
      <button
        disabled={!cancelForm.streamId.trim() || isSubmitting}
        onClick={() => setShowDialog(true)}
        className="w-full bg-rose-950/30 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 hover:border-rose-600 font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-rose-900/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
        {submitLabel}
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
};

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
  } = props;

  const mintPickerRef = useRef<HTMLDivElement | null>(null);
  const [mintMenuOpen, setMintMenuOpen] = useState(false);
  const [cliffInputMode, setCliffInputMode] = useState<"duration" | "date">("duration");
  const [durationInputMode, setDurationInputMode] = useState<"duration" | "date">("duration");
  const feeEstimate = useFeeEstimate();
  const csvMilestoneValidation = useCsvMilestoneValidation(csvCreateText);
  const csvEditMilestoneValidation = useCsvMilestoneValidation(csvEditText);
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

  const editMilestoneDecimals = Number.isFinite(Number(editMilestoneForm?.mintDecimals))
    ? Number(editMilestoneForm.mintDecimals)
    : 0;
  const editMilestoneAmounts = Array.isArray(editMilestoneForm?.amounts) ? editMilestoneForm.amounts : [];
  const editMilestoneSum = useMemo(
    () => editMilestoneAmounts.reduce(
      (sum: bigint, amount: string) => sum + parseTokenAmountToBaseUnits(String(amount || "0"), editMilestoneDecimals),
      BigInt(0)
    ),
    [editMilestoneAmounts, editMilestoneDecimals]
  );
  const editMilestoneTargetTotal = useMemo(
    () => {
      const rawTotal = editMilestoneForm?.totalAmount;

      if (typeof rawTotal === "bigint") return rawTotal;
      if (typeof rawTotal === "number") return BigInt(Math.trunc(rawTotal));
      if (typeof rawTotal === "string" && rawTotal.trim() !== "") {
        try {
          return BigInt(rawTotal.trim());
        } catch {
          return BigInt(0);
        }
      }

      return BigInt(0);
    },
    [editMilestoneForm?.totalAmount]
  );
  const editMilestoneHasTargetTotal =
    (typeof editMilestoneForm?.totalAmount === "string" && editMilestoneForm.totalAmount.trim() !== "") ||
    typeof editMilestoneForm?.totalAmount === "bigint" ||
    typeof editMilestoneForm?.totalAmount === "number";
  const editMilestoneHasInvalidAmounts = useMemo(
    () => editMilestoneAmounts.some((value: string) => !value || Number(value) <= 0 || !Number.isFinite(Number(value))),
    [editMilestoneAmounts]
  );
  const editMilestoneMatchesTotal = editMilestoneHasTargetTotal ? editMilestoneSum === editMilestoneTargetTotal : true;

  const selectedMintPreset = mintPresets.find((preset) => preset.mint === createForm.mint) ?? null;
  const tokenBalance = useTokenBalance(
  createForm.mint,
  endpoint,
  selectedMintPreset?.decimals
);

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
  exceedsBalance ||   // ← add this
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
  csvEditExceedsBalance; // ← tambah ini
  const editMilestoneAlreadyUnlocked = isMilestoneUnlocked(editMilestoneForm.streamId);
  const editMilestoneDisabled =
    isStreamCsvCreated(editMilestoneForm.streamId) ||
    editMilestoneAlreadyUnlocked ||
    !editMilestoneForm.streamId?.trim() ||
    editMilestoneAmounts.length === 0 ||
    editMilestoneHasInvalidAmounts ||
    (editMilestoneHasTargetTotal && !editMilestoneMatchesTotal) ||
    activeTxAction === "edit_milestone";
  const editLinearDisabled =
    isStreamCsvCreated(editLinearForm.streamId) ||
    !editLinearForm.streamId?.trim() ||
    !String(editLinearForm.newEndDuration ?? "").trim() ||
    !String(editLinearForm.topupAmount ?? "").trim() ||
    activeTxAction === "edit_linear";
  const editCliffPeriodOver = isCliffPassed(editCliffForm.streamId);
  const editCliffDisabled =
    isStreamCsvCreated(editCliffForm.streamId) ||
    editCliffPeriodOver ||
    !editCliffForm.streamId?.trim() ||
    !String(editCliffForm.newCliffDuration ?? "").trim() ||
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
                <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Recipient</label>
                <input type="text" value={createForm.recipient} onChange={(e) => setCreateForm({ ...createForm, recipient: e.target.value })} className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
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
                            value={createForm.mint}
                            onChange={(e) => setCreateForm({ ...createForm, mint: e.target.value })}
                            placeholder="Paste a mint address"
                            className="block w-full max-w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                          />
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
                onClick={() => handleAction("create_stream", createForm)}
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
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight">Withdraw Claim</h2>
            <p className="text-xs text-zinc-400">Withdraw matured/unlocked tokens from an active vesting stream</p>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Stream ID (PDA Address)
              </label>
              <input
                type="text"
                value={withdrawForm.streamId}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, streamId: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* ─── Protocol Fee Preview Card ─────────────────────────────────── */}
          <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-950/10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-500/10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 3-5 3-5 6h5M12 17h.01"/>
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
                <RefreshCw className={`w-3 h-3 ${feeEstimate.loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Fee breakdown */}
            <div className="px-4 py-3.5 flex flex-col gap-3">
              {/* Fixed USD amount */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Fixed fee (USD)</span>
                <span className="font-mono text-sm font-extrabold text-zinc-100">$0.99</span>
              </div>

              {/* SOL equivalent */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  Estimated SOL cost
                  {feeEstimate.solPrice && (
                    <span className="ml-1.5 text-[10px] text-zinc-600">
                      @ ${feeEstimate.solPrice.toFixed(2)}/SOL
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {feeEstimate.loading ? (
                    <span className="text-xs text-zinc-500 font-mono animate-pulse">fetching...</span>
                  ) : feeEstimate.error || !feeEstimate.solCost ? (
                    <span className="text-xs text-zinc-500 font-mono">unavailable</span>
                  ) : (
                    <span className="font-mono text-sm font-extrabold text-amber-300">
                      ◎ {feeEstimate.solCost.toFixed(6)} SOL
                    </span>
                  )}
                </div>
              </div>

              {/* Charged from */}
              <div className="flex items-start gap-2 pt-1 border-t border-amber-500/10">
                <div className="mt-0.5 w-1 h-1 rounded-full bg-amber-400/60 shrink-0" />
                <p className="text-[10px] text-amber-300/60 leading-relaxed">
                  Fee is charged in SOL from <span className="font-bold text-amber-300/80">your wallet</span> on every{" "}
                  <code className="font-mono bg-amber-950/40 px-1 rounded">withdraw</code> call, regardless of how many
                  tokens are claimed. Partial claims are fully supported but each call costs the full fee.
                </p>
              </div>

              {/* Error fallback notice */}
              {feeEstimate.error && (
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                  <svg className="w-3 h-3 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span className="text-[10px] text-zinc-500">
                    Could not fetch SOL price. The on-chain fee will still be charged at live oracle price.
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* ──────────────────────────────────────────────────────────────────── */}

          <button
            disabled={withdrawDisabled}
            onClick={() => handleAction("withdraw", withdrawForm)}
            className={`w-full mt-5 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
              withdrawDisabled
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
                : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
            }`}
          >
            {activeTxAction === "withdraw" && activeTxPhase ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : null}
            {getTxLabel("withdraw", "Claim Claimable Tokens")}
          </button>
        </div>
      )}

      {activeTab === "cancel" && (
        <CancelPanel
          cancelForm={cancelForm}
          setCancelForm={setCancelForm}
          handleAction={handleAction}
          isSubmitting={activeTxAction === "cancel" && !!activeTxPhase}
          submitLabel={getTxLabel("cancel", "Cancel and Refund Stream")}
        />
      )}

      {activeTab === "unlock_milestone" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Unlock Milestone</h2><p className="text-xs text-zinc-400">Release milestone allocations sequentially based on milestones attained</p></div>
          <div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={unlockForm.streamId} onChange={(e) => setUnlockForm({ ...unlockForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div>
          <button
            disabled={unlockDisabled}
            onClick={() => handleAction("unlock_milestone", unlockForm)}
            className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${unlockDisabled ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}
          >
            Unlock Milestone
          </button>
        </div>
      )}

      {activeTab === "edit_milestone" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Edit Milestone Structure</h2><p className="text-xs text-zinc-400">Modify milestone details or adjust allocated milestone target amounts</p></div>
          {isStreamCsvCreated(editMilestoneForm.streamId) ? (
            <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
              <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
                <p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                <input
                  type="text"
                  value={editMilestoneForm.streamId}
                  onChange={(e) => setEditMilestoneForm({ ...editMilestoneForm, streamId: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {(Array.isArray(editMilestoneForm.amounts) ? editMilestoneForm.amounts : []).map((amount: string, index: number) => (
                <div key={index}>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone #{index} Amount</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    value={amount}
                    onChange={(e) => {
                      const next = [...(Array.isArray(editMilestoneForm.amounts) ? editMilestoneForm.amounts : [])];
                      const normalized = normalizeDecimalInput(e.target.value);
                      next[index] = normalized === "" ? "0" : normalized;
                      setEditMilestoneForm({ ...editMilestoneForm, amounts: next });
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="0"
                  />
                </div>
              ))}

             <div className="sm:col-span-2">
  <MilestoneAllocationCounter
    amounts={editMilestoneAmounts.map((v: string) =>
      formatBaseUnitsToTokenAmount(
        parseTokenAmountToBaseUnits(String(v || "0"), editMilestoneDecimals),
        editMilestoneDecimals
      )
    )}
    total={Number(
      formatBaseUnitsToTokenAmount(editMilestoneTargetTotal, editMilestoneDecimals)
    )}
    hasInvalid={editMilestoneHasInvalidAmounts}
    isMatch={editMilestoneMatchesTotal}
  />
</div>
            </div>
          )}
          {editMilestoneAlreadyUnlocked && !isStreamCsvCreated(editMilestoneForm.streamId) && (
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 text-amber-300 flex items-start gap-3 mt-6">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-extrabold">Milestone Already Unlocked</h4>
                <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">At least one milestone on this stream has already been unlocked, so its milestone structure can no longer be edited.</p>
              </div>
            </div>
          )}
          <button
            disabled={editMilestoneDisabled}
            onClick={() => handleAction("edit_milestone", editMilestoneForm)}
            className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${editMilestoneDisabled ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}
          >
            Apply All Milestone Edits
          </button>
        </div>
      )}

      {activeTab === "edit_linear" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Edit Linear Timeline</h2><p className="text-xs text-zinc-400">Modify linear timelines or extend stream end thresholds</p></div>
          {isStreamCsvCreated(editLinearForm.streamId) ? <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6"><Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" /><div><h4 className="text-sm font-extrabold">Manual Edit Locked!</h4><p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p></div></div> : <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={editLinearForm.streamId} onChange={(e) => setEditLinearForm({ ...editLinearForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Stream Duration (Seconds from Start)</label><input type="number" value={editLinearForm.newEndDuration} onChange={(e) => setEditLinearForm({ ...editLinearForm, newEndDuration: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Top-up Amount (Tokens to Add)</label><input type="number" value={editLinearForm.topupAmount} onChange={(e) => setEditLinearForm({ ...editLinearForm, topupAmount: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>}
          <button disabled={editLinearDisabled} onClick={() => handleAction("edit_linear", editLinearForm)} className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${editLinearDisabled ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}>Update End Timeline & Top-up Stream</button>
        </div>
      )}

      {activeTab === "edit_cliff" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><div className="flex items-center gap-2"><h2 className="text-2xl font-extrabold tracking-tight">Edit Cliff Conditions</h2></div><p className="text-xs text-zinc-400">Modify cliff release durations or shift lockup parameters</p></div>
          {isStreamCsvCreated(editCliffForm.streamId) ? <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6"><Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" /><div><h4 className="text-sm font-extrabold">Manual Edit Locked!</h4><p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p></div></div> : <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={editCliffForm.streamId} onChange={(e) => setEditCliffForm({ ...editCliffForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Cliff Duration (Seconds from Start)</label><input type="number" value={editCliffForm.newCliffDuration} onChange={(e) => setEditCliffForm({ ...editCliffForm, newCliffDuration: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>}
          {editCliffPeriodOver && !isStreamCsvCreated(editCliffForm.streamId) && (
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 text-amber-300 flex items-start gap-3 mt-6">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-extrabold">Cliff Period Ended</h4>
                <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">This stream's cliff timestamp has already elapsed, so the cliff can no longer be adjusted.</p>
              </div>
            </div>
          )}
          <button disabled={editCliffDisabled} onClick={() => handleAction("edit_cliff", editCliffForm)} className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${editCliffDisabled ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}>Adjust Cliff Timestamp</button>
        </div>
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

    if (typeIdx === -1 || amountIdx === -1) return { rows: [], hasErrors: false };

    const rows: {
      rowNum: number;
      recipient: string;
      totalAmount: number;
      milestones: number[];
      milestoneSum: number;
      pct: number;
      remaining: number;
      isMatch: boolean;
      hasInvalid: boolean;
    }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());
      if (values[typeIdx] !== "2") continue;

      const recipient = recipientIdx !== -1 ? (values[recipientIdx] ?? "") : "";
      const totalAmount = parseFloat(values[amountIdx] ?? "0") || 0;
      let milestones: number[] = [];
  if (milestonesIdx !== -1) {
  const raw = values.slice(milestonesIdx).join(";"); // join sisa kolom dengan ";"
  // Support both ";" and "," as milestone separators
  milestones = raw
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => parseFloat(v) || 0);
}

      const milestoneSum = milestones.reduce((a, b) => a + b, 0);
      const remaining = totalAmount - milestoneSum;
      const pct = totalAmount > 0 ? Math.min((milestoneSum / totalAmount) * 100, 100) : 0;
      const isMatch = totalAmount > 0 && Math.abs(remaining) < 0.0000001;
      const hasInvalid = milestones.length === 0 || milestones.some((v) => v <= 0 || !Number.isFinite(v));

      rows.push({ rowNum: i, recipient, totalAmount, milestones, milestoneSum, pct, remaining, isMatch, hasInvalid });
    }

    return { rows, hasErrors: rows.some((r) => !r.isMatch || r.hasInvalid) };
  }, [csvText]);
}

function CsvValidationPanel({
  csvText,
  walletBalance,
  walletMint,
  walletMintLabel,
  walletDecimals,
  editMode,
  editTotalByMint,
}: {
  csvText: string;
  walletBalance: number | null;
  walletMint: string | null;
  walletMintLabel?: string;
  walletDecimals: number;
  editMode?: boolean;           // ← baru
  editTotalByMint?: Record<string, number>; // ← baru, override total calculation
}) {
  const { rows, hasErrors } = useCsvMilestoneValidation(csvText);
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

  const hasAnyError = hasErrors || !!mintExceedsBalance;

  if (rows.length === 0 && !mintExceedsBalance) return null;

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
                  {csvTotalForMint.toLocaleString(undefined, { maximumFractionDigits: walletDecimals })}
                </div>
              </div>
              <div>
                <div className="text-zinc-600 text-[9px] uppercase mb-0.5">Wallet Balance</div>
                <div className="text-zinc-300 font-black">
                  {walletBalance.toLocaleString(undefined, { maximumFractionDigits: walletDecimals })}
                </div>
              </div>
              <div>
                <div className="text-zinc-600 text-[9px] uppercase mb-0.5">Shortfall</div>
                <div className="text-rose-400 font-black">
                  {(csvTotalForMint - walletBalance).toLocaleString(undefined, {
                    maximumFractionDigits: walletDecimals,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Milestone rows ───────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="divide-y divide-zinc-900/60">
          {rows.map((row) => {
            const barColor = row.hasInvalid
              ? "bg-rose-500"
              : row.isMatch
              ? "bg-emerald-500"
              : row.pct > 100
              ? "bg-rose-500"
              : "bg-amber-400";
            const statusColor = row.hasInvalid
              ? "text-rose-400"
              : row.isMatch
              ? "text-emerald-400"
              : "text-amber-400";
            const shortRecipient = row.recipient
              ? `${row.recipient.slice(0, 6)}…${row.recipient.slice(-4)}`
              : `Row #${row.rowNum}`;

            return (
              <div key={row.rowNum} className="px-4 py-3 bg-zinc-950/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-zinc-500">{shortRecipient}</span>
                  <span className={`text-[10px] font-black font-mono ${statusColor}`}>
                    {row.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden mb-2">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(row.pct, 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mb-2">
                  <div>
                    <div className="text-zinc-600 text-[9px] uppercase">Allocated</div>
                    <div className={statusColor}>{row.milestoneSum.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-zinc-600 text-[9px] uppercase">Total</div>
                    <div className="text-zinc-300">{row.totalAmount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-zinc-600 text-[9px] uppercase">
                      {row.remaining < 0 ? "Excess" : "Remaining"}
                    </div>
                    <div
                      className={
                        row.remaining < 0
                          ? "text-rose-400"
                          : row.remaining === 0
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }
                    >
                      {Math.abs(row.remaining).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
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
                <div className={`text-[9px] font-semibold ${statusColor}`}>
                  {row.hasInvalid
                    ? "⚠ Missing or zero milestone values"
                    : row.isMatch
                    ? "✓ Allocations balanced"
                    : row.remaining > 0
                    ? `${row.remaining.toLocaleString()} tokens unallocated`
                    : `Over-allocated by ${Math.abs(row.remaining).toLocaleString()}`}
                </div>
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
      {mintExceedsBalance && hasErrors
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