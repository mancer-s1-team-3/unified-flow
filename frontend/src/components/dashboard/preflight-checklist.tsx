"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Circle, Loader2, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Wallet, Globe, Zap, Coins } from "lucide-react";
import { useWalletConnection, useClusterState } from "@solana/react-hooks";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const CIRCLE_FAUCET_URL = "https://faucet.circle.com";
const SOL_FAUCET_URL = "https://faucet.solana.com";
const MIN_SOL = 0.05; // minimum SOL to consider "funded"
const MIN_USDC = 0.01;

type CheckStatus = "idle" | "loading" | "pass" | "fail" | "warn";

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  expandedContent?: React.ReactNode;
}

// ─── Token balance helper ────────────────────────────────────────────────────
async function getSplTokenBalance(
  connection: Connection,
  walletAddress: string,
  mintAddress: string
): Promise<number> {
  try {
    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(mintAddress);
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet, { mint });
    if (accounts.value.length === 0) return 0;
    const amount = accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return amount ?? 0;
  } catch {
    return 0;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface PreflightChecklistProps {
  /** Pass the current RPC endpoint so we can detect devnet */
  endpoint: string;
}

export function PreflightChecklist({ endpoint }: PreflightChecklistProps) {
  const { wallet, connected } = useWalletConnection();
  const walletAddress = connected && wallet?.account.address ? String(wallet.account.address) : null;

  const isDevnet =
    endpoint.includes("devnet") ||
    endpoint.includes("127.0.0.1") ||
    endpoint.includes("localhost");

  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "wallet", label: "Wallet connected", status: "idle" },
    { id: "network", label: "Network set to Solana Devnet", status: "idle" },
    { id: "sol", label: "Devnet SOL available", status: "idle" },
    { id: "usdc", label: "Devnet USDC available", status: "idle" },
  ]);

  const [collapsed, setCollapsed] = useState(false);
  const [runCount, setRunCount] = useState(0);

  const setCheck = useCallback(
    (id: string, patch: Partial<CheckItem>) => {
      setChecks((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const runChecks = useCallback(async () => {
    // ── 1. Wallet ────────────────────────────────────────────────────────────
    if (!connected || !walletAddress) {
      setCheck("wallet", {
        status: "fail",
        detail: "No wallet connected. Click 'Connect Wallet' in the top bar.",
      });
      // Mark downstream checks as blocked
      ["network", "sol", "usdc"].forEach((id) =>
        setCheck(id, { status: "idle", detail: undefined })
      );
      return;
    }
    setCheck("wallet", {
      status: "pass",
      detail: `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`,
    });

    // ── 2. Network ───────────────────────────────────────────────────────────
    if (!isDevnet) {
      setCheck("network", {
        status: "fail",
        detail: "Switch to Solana Devnet in your wallet settings (Phantom → Settings → Developer Settings → Network → Devnet).",
      });
      ["sol", "usdc"].forEach((id) =>
        setCheck(id, { status: "idle", detail: undefined })
      );
      return;
    }
    setCheck("network", { status: "pass", detail: "Solana Devnet" });

    // ── 3. SOL balance ───────────────────────────────────────────────────────
    setCheck("sol", { status: "loading" });
    setCheck("usdc", { status: "loading" });

    try {
      const connection = new Connection(endpoint, "confirmed");
      const pubkey = new PublicKey(walletAddress);
      const lamports = await connection.getBalance(pubkey);
      const sol = lamports / LAMPORTS_PER_SOL;

      if (sol < MIN_SOL) {
        setCheck("sol", {
          status: "fail",
          detail: `Balance: ${sol.toFixed(4)} SOL — need at least ${MIN_SOL} SOL for transaction fees.`,
          action: {
            label: "Get Devnet SOL →",
            href: SOL_FAUCET_URL,
          },
        });
      } else {
        setCheck("sol", {
          status: "pass",
          detail: `${sol.toFixed(4)} SOL`,
        });
      }

      // ── 4. USDC balance ─────────────────────────────────────────────────
      const usdcBalance = await getSplTokenBalance(connection, walletAddress, DEVNET_USDC_MINT);

      if (usdcBalance < MIN_USDC) {
        setCheck("usdc", {
          status: "fail",
          detail: `No Devnet USDC found in wallet.`,
          action: {
            label: "Get Devnet USDC →",
            href: CIRCLE_FAUCET_URL,
          },
          expandedContent: (
            <UsdcFaucetGuide walletAddress={walletAddress} />
          ),
        });
      } else {
        setCheck("usdc", {
          status: "pass",
          detail: `${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`,
        });
      }
    } catch {
      setCheck("sol", { status: "warn", detail: "Could not fetch balance — RPC may be rate-limited." });
      setCheck("usdc", { status: "warn", detail: "Could not fetch balance — RPC may be rate-limited." });
    }
  }, [connected, walletAddress, isDevnet, endpoint, setCheck]);

  // Run on mount and whenever wallet / endpoint changes
  useEffect(() => {
    runChecks();
  }, [runChecks, connected, walletAddress, endpoint]);

  // Auto-collapse when all pass
  const allPass = checks.every((c) => c.status === "pass");
  useEffect(() => {
    if (allPass) {
      const t = setTimeout(() => setCollapsed(true), 1200);
      return () => clearTimeout(t);
    } else {
      setCollapsed(false);
    }
  }, [allPass]);

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const loadingAny = checks.some((c) => c.status === "loading");

  // ─── Header accent color ──────────────────────────────────────────────────
  const headerAccent = allPass
    ? "border-emerald-500/30 bg-emerald-950/10"
    : failCount > 0
    ? "border-amber-500/30 bg-amber-950/10"
    : "border-zinc-800 bg-zinc-950/60";

  const headerDot = allPass
    ? "bg-emerald-400"
    : failCount > 0
    ? "bg-amber-400 animate-pulse"
    : "bg-zinc-600";

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-300 mb-6 ${headerAccent}`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${headerDot}`} />
          <span className="text-[11px] font-black uppercase tracking-widest text-zinc-300">
            Before You Test
          </span>
          {loadingAny && (
            <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {allPass ? (
            <span className="text-[10px] font-bold text-emerald-400">Ready to deploy</span>
          ) : failCount > 0 ? (
            <span className="text-[10px] font-bold text-amber-400">
              {failCount} issue{failCount > 1 ? "s" : ""} to fix
            </span>
          ) : null}
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </div>
      </button>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="border-t border-zinc-900/60 divide-y divide-zinc-900/40">
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}

          {/* Refresh button */}
          <div className="px-4 py-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => runChecks()}
              className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              <Loader2 className="w-3 h-3" />
              Re-check
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single Check Row ─────────────────────────────────────────────────────────
function CheckRow({ check }: { check: CheckItem }) {
  const [expanded, setExpanded] = useState(false);

  const icon = {
    idle: <Circle className="w-4 h-4 text-zinc-700 shrink-0" />,
    loading: <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />,
    pass: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    fail: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    warn: <AlertTriangle className="w-4 h-4 text-zinc-500 shrink-0" />,
  }[check.status];

  const labelColor = {
    idle: "text-zinc-500",
    loading: "text-zinc-300",
    pass: "text-zinc-200",
    fail: "text-zinc-200",
    warn: "text-zinc-400",
  }[check.status];

  const rowIcon = {
    wallet: <Wallet className="w-3 h-3 text-zinc-600" />,
    network: <Globe className="w-3 h-3 text-zinc-600" />,
    sol: <Zap className="w-3 h-3 text-zinc-600" />,
    usdc: <Coins className="w-3 h-3 text-zinc-600" />,
  }[check.id] ?? null;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="mt-0.5">{icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {rowIcon}
            <span className={`text-[11px] font-semibold ${labelColor}`}>
              {check.label}
            </span>
            {check.status === "pass" && check.detail && (
              <span className="text-[10px] font-mono text-emerald-400/70">
                · {check.detail}
              </span>
            )}
          </div>

          {/* Detail (fail/warn only) */}
          {check.status !== "pass" && check.detail && (
            <p className="mt-1 text-[10px] text-zinc-500 leading-relaxed">
              {check.detail}
            </p>
          )}

          {/* Action row */}
          {check.status === "fail" && check.action && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {check.action.href ? (
                <a
                  href={check.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-all"
                >
                  {check.action.label}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={check.action.onClick}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-all"
                >
                  {check.action.label}
                </button>
              )}

              {/* Expand toggle if there's rich content */}
              {check.expandedContent && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold flex items-center gap-1 transition-colors"
                >
                  {expanded ? "Hide steps" : "Show me how"}
                  {expanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          )}

          {/* Expanded guide */}
          {expanded && check.expandedContent && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {check.expandedContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── USDC Faucet Guide ────────────────────────────────────────────────────────
function UsdcFaucetGuide({ walletAddress }: { walletAddress: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      n: 1,
      text: (
        <>
          Open{" "}
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
          >
            faucet.circle.com
          </a>
        </>
      ),
    },
    { n: 2, text: 'Choose token: "USDC"' },
    { n: 3, text: 'Select network: "Solana Devnet"' },
    {
      n: 4,
      text: (
        <span className="flex items-center gap-2 flex-wrap">
          Paste your wallet address:
          <button
            type="button"
            onClick={handleCopy}
            className={`font-mono text-[9px] px-2 py-1 rounded-md border transition-all flex items-center gap-1 ${
              copied
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-400"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
            }`}
          >
            {copied ? (
              <>✓ Copied</>
            ) : (
              <>
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                <span className="text-zinc-600">· copy</span>
              </>
            )}
          </button>
        </span>
      ),
    },
    { n: 5, text: 'Click "Send" / "Claim"' },
    { n: 6, text: "Return to Unified Flow and click Re-check" },
  ];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <Coins className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
          Get Devnet USDC — Step by Step
        </span>
      </div>
      <ol className="px-3 py-2.5 space-y-2">
        {steps.map((step) => (
          <li key={step.n} className="flex items-start gap-2.5">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-[9px] font-black text-indigo-400 shrink-0">
              {step.n}
            </span>
            <span className="text-[10px] text-zinc-400 leading-relaxed">
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}