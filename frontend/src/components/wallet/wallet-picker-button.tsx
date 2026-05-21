"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, Wallet } from "lucide-react";
import { useWalletConnection } from "@solana/react-hooks";

function shorten(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return /Android|iPhone|iPad|iPod/i.test(userAgent) || isTouchMac;
}

function buildWalletBrowseUrl(base: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return `${base}${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`;
}

export function WalletPickerButton({ className = "" }: { className?: string }) {
  const { connectors, connect, connected, connecting, currentConnector, disconnect, wallet } = useWalletConnection();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mobileBrowser = useMemo(() => isMobileBrowser(), []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (rootRef.current && target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [open]);

  const connectedAddress = connected && wallet?.account.address ? String(wallet.account.address) : "";
  const activeConnectorName = currentConnector?.name ?? connectors[0]?.name ?? null;
  const primaryLabel = connected
    ? connectedAddress
      ? shorten(connectedAddress)
      : "Connected Wallet"
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

    setOpen((value) => !value);
  };

  const handleConnectorSelect = async (connectorId: string) => {
    await connect(connectorId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={connecting || (connectors.length === 0 && !mobileBrowser)}
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

      {open && !connected && (
        <div className="absolute right-0 top-full z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">Choose Wallet</div>
              <div className="text-[10px] text-zinc-500">Connect via Wallet Standard on the active Solana cluster.</div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {mobileBrowser && !connected && (
              <div className="mb-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100/90">
                <div className="font-semibold text-cyan-50">Mobile browser detected</div>
                <p className="mt-1 leading-relaxed text-cyan-100/80">
                  Some Solana wallets only connect reliably from their own in-app browser on iOS/Android.
                  Open this page inside Phantom or Solflare first, then reconnect.
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
                  No injected wallet found. Use the buttons above to open the site in a wallet browser.
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
                        <span className="truncate text-sm font-semibold text-zinc-100">{connector.name}</span>
                        {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-bold uppercase tracking-wider text-zinc-300">
                          Wallet Standard
                        </span>
                        {isCurrent && <span className="text-zinc-400">Current</span>}
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
