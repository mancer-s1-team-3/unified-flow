"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  HardDrive,
  Info,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import { useWalletConnection } from "@solana/react-hooks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shorten(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod/i.test(ua) || isTouchMac;
}

function isSafariDesktop() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isSafari =
    /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isDesktopMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints <= 1;
  return isSafari && isDesktopMac;
}

function buildWalletBrowseUrl(base: string) {
  if (typeof window === "undefined") return "";
  return `${base}${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(
    window.location.origin
  )}`;
}

// ---------------------------------------------------------------------------
// Wallet-type classification
// ---------------------------------------------------------------------------

/** Names that indicate a hardware / cold wallet requiring a companion app. */
const COLD_WALLET_KEYWORDS = ["ledger", "trezor", "keystone", "d'cent", "dcent", "ellipal"];

/** Names that indicate a multisig / smart-contract wallet. */
const MULTISIG_KEYWORDS = ["squads", "goki", "realms", "multisig", "safe"];

/**
 * Fully-verified wallets that are tested on Devnet.
 * Update this list as you add QA coverage.
 */
export const SUPPORTED_DEVNET_WALLETS = [
  { name: "Phantom", url: "https://phantom.app", notes: "Recommended · Full feature support" },
  { name: "Solflare", url: "https://solflare.com", notes: "Full feature support" },
  { name: "Backpack", url: "https://backpack.app", notes: "Full feature support" },
];

type WalletKind = "standard" | "cold" | "multisig" | "unknown";

export function classifyConnector(name: string | undefined | null): WalletKind {
  if (!name) return "unknown";
  const lower = name.toLowerCase();
  if (COLD_WALLET_KEYWORDS.some((k) => lower.includes(k))) return "cold";
  if (MULTISIG_KEYWORDS.some((k) => lower.includes(k))) return "multisig";
  return "standard";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SupportedWalletsTooltip({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full z-[60] mt-3 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/98 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            Supported Wallets · Devnet
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        {SUPPORTED_DEVNET_WALLETS.map((w) => (
          <a
            key={w.name}
            href={w.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 hover:border-zinc-800 hover:bg-zinc-900/80 transition-all group"
          >
            <div>
              <div className="text-xs font-semibold text-zinc-100 group-hover:text-indigo-300 transition-colors">
                {w.name}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{w.notes}</div>
            </div>
            <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
          </a>
        ))}
        <div className="border-t border-zinc-900 mt-1 pt-2 px-1">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Cold wallets (Ledger, Trezor) and multisig setups (Squads) are{" "}
            <span className="text-amber-400/80">not fully supported</span> in the current release.
         
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WalletPickerButton({ className = "" }: { className?: string }) {
  const { connectors, connect, connected, connecting, currentConnector, disconnect, wallet } =
    useWalletConnection();

  const [open, setOpen] = useState(false);
  const [showSupportedInfo, setShowSupportedInfo] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mobileBrowser = useMemo(() => isMobileBrowser(), []);
  const safariDesktop = useMemo(() => isSafariDesktop(), []);

  // Classify the currently connected / selected connector
  const activeKind = useMemo(
    () => classifyConnector(currentConnector?.name ?? connectors[0]?.name),
    [currentConnector, connectors]
  );

  // Close dropdowns on outside click
  useEffect(() => {
    if (!open && !showSupportedInfo) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setShowSupportedInfo(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open, showSupportedInfo]);

  const connectedAddress =
    connected && wallet?.account.address ? String(wallet.account.address) : "";

  const activeConnectorName =
    currentConnector?.name ?? connectors[0]?.name ?? null;

  const primaryLabel = connected
    ? connectedAddress
      ? shorten(connectedAddress)
      : "Connected Wallet"
    : safariDesktop && connectors.length === 0
    ? "Open in Chrome"
    : activeConnectorName
    ? `Connect ${activeConnectorName}`
    : mobileBrowser
    ? "Open Wallet"
    : "Connect Wallet";

  const phantomBrowseUrl = buildWalletBrowseUrl("https://phantom.app/ul/browse/");
  const solflareBrowseUrl = buildWalletBrowseUrl("https://solflare.com/ul/browse/");

  const handlePrimaryAction = async () => {
    if (connected) {
      await disconnect();
      setOpen(false);
      return;
    }
    setOpen((v) => !v);
    setShowSupportedInfo(false);
  };

  const handleConnectorSelect = async (connectorId: string) => {
    await connect(connectorId);
    setOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* ── Primary button ── */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={connecting}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-all hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {connected ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Wallet className="h-3.5 w-3.5 text-indigo-400" />
          )}
          <span>{connecting ? "Connecting..." : primaryLabel}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {/* ── Info button → supported wallets tooltip ── */}
        <button
          type="button"
          onClick={() => {
            setShowSupportedInfo((v) => !v);
            setOpen(false);
          }}
          title="Supported wallets"
          className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800 transition-all"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Cold-wallet inline warning (when connected) ── */}
      {connected && activeKind === "cold" && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[10px] text-amber-100/90 shadow-lg backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <HardDrive className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-50 block mb-0.5">Hardware wallet detected</span>
              Cold wallets require manual approval on the device. Some instructions (batch CSV,
              milestone unlock) may fail due to transaction-size limits. Ensure your firmware is
              up-to-date and approve each prompt on the device screen.
            </div>
          </div>
        </div>
      )}

      {/* ── Multisig inline warning (when connected) ── */}
      {connected && activeKind === "multisig" && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-purple-500/25 bg-purple-500/8 px-3 py-2.5 text-[10px] text-purple-100/90 shadow-lg backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-purple-300 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-purple-50 block mb-0.5">
                Multisig wallet — limited support
              </span>
              Squads / multisig workflows create proposal transactions only. Direct actions
              (edit_cliff, edit_linear, cancel) are routed as proposals and require co-signer
              approval inside the Squads UI before they execute on-chain.
            </div>
          </div>
        </div>
      )}

      {/* ── Supported wallets tooltip ── */}
      {showSupportedInfo && (
        <SupportedWalletsTooltip onClose={() => setShowSupportedInfo(false)} />
      )}

      {/* ── Connector picker dropdown ── */}
      {open && !connected && (
        <div className="absolute right-0 top-full z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                Choose Wallet
              </div>
              <div className="text-[10px] text-zinc-500">
                Connect via Wallet Standard on the active Solana cluster.
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {/* Mobile browser notice */}
            {mobileBrowser && !connected && (
              <div className="mb-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100/90">
                <div className="font-semibold text-cyan-50">Mobile browser detected</div>
                <p className="mt-1 leading-relaxed text-cyan-100/80">
                  Some Solana wallets only connect reliably from their own in-app browser on
                  iOS/Android. Open this page inside Phantom or Solflare first, then reconnect.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <a
                    href={phantomBrowseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-50 transition-colors hover:bg-cyan-400/15"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Phantom
                  </a>
                  <a
                    href={solflareBrowseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-50 transition-colors hover:bg-cyan-400/15"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Solflare
                  </a>
                </div>
              </div>
            )}

            {connectors.length === 0 ? (
              mobileBrowser ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-500">
                  <AlertCircle className="h-4 w-4 text-zinc-600" />
                  No injected wallet found. Use the buttons above to open the site in a wallet
                  browser.
                </div>
              ) : safariDesktop ? (
                <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-4 text-xs text-amber-100/90">
                  <div className="flex items-center gap-2 font-semibold text-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-300" />
                    Safari desktop without extension is not supported
                  </div>
                  <p className="leading-relaxed text-amber-100/80">
                    Open this app in Chrome or Brave, then install a Solana wallet extension like
                    Phantom or Solflare.
                  </p>
                  <p className="leading-relaxed text-amber-100/70">
                    If you already installed an extension, refresh the page after switching browsers.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-500">
                  <AlertCircle className="h-4 w-4 text-zinc-600" />
                  No wallets detected.
                </div>
              )
            ) : (
              connectors.map((connector) => {
                const isCurrent = currentConnector?.id === connector.id;
                const kind = classifyConnector(connector.name);

                return (
                  <button
                    key={connector.id}
                    type="button"
                    onClick={() => handleConnectorSelect(connector.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                      isCurrent
                        ? "border-indigo-500/30 bg-indigo-600/10"
                        : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/80"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-100">
                          {connector.name}
                        </span>
                        {isCurrent && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        )}
                        {/* Kind badges */}
                        {kind === "cold" && (
                          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                            <HardDrive className="h-2.5 w-2.5" /> Cold
                          </span>
                        )}
                        {kind === "multisig" && (
                          <span className="flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">
                            <Shield className="h-2.5 w-2.5" /> Multisig
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-bold uppercase tracking-wider text-zinc-300">
                          Wallet Standard
                        </span>
                        {isCurrent && <span className="text-zinc-400">Current</span>}
                        {/* Inline warning under connector row */}
                        {kind === "cold" && (
                          <span className="text-amber-400/80">Limited · device approval needed</span>
                        )}
                        {kind === "multisig" && (
                          <span className="text-purple-400/80">Proposal-only · co-signer required</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Connect
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}