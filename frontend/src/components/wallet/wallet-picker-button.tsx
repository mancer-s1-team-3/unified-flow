"use client";

import { useEffect, useRef, useState } from "react";
import { type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { AlertCircle, CheckCircle2, ChevronDown, LogOut, Wallet } from "lucide-react";

function shorten(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function readyStateLabel(state: string) {
  switch (state) {
    case "Installed":
      return "Installed";
    case "Loadable":
      return "Loadable";
    case "Unsupported":
      return "Unsupported";
    default:
      return "Not detected";
  }
}

function readyStateStyles(state: string) {
  switch (state) {
    case "Installed":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    case "Loadable":
      return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
    case "Unsupported":
      return "bg-red-500/10 text-red-300 border-red-500/20";
    default:
      return "bg-zinc-800/80 text-zinc-400 border-zinc-700/80";
  }
}

export function WalletPickerButton({ className = "" }: { className?: string }) {
  const { wallets, wallet, select, connect, disconnect, connected, connecting, publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

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

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedWalletName = mounted ? wallet?.adapter.name ?? null : null;
  const connectedLabel = mounted && publicKey ? shorten(publicKey.toBase58()) : "Connected Wallet";
  const displayLabel = connected
    ? connectedLabel
    : mounted && selectedWalletName
    ? `Connect ${selectedWalletName}`
    : "Connect Wallet";

  const handlePrimaryAction = async () => {
    if (connected) {
      await disconnect();
      setOpen(false);
      return;
    }

    if (selectedWalletName) {
      await connect();
      return;
    }

    setOpen((value) => !value);
  };

  const handleWalletSelect = (adapterName: WalletName) => {
    select(adapterName);
    setOpen(false);
  };

  const sortedWallets = [...wallets].sort((a, b) => {
    const aScore = a.readyState === "Installed" ? 0 : a.readyState === "Loadable" ? 1 : 2;
    const bScore = b.readyState === "Installed" ? 0 : b.readyState === "Loadable" ? 1 : 2;
    return aScore - bScore;
  });

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={mounted && (connecting || wallets.length === 0) ? true : undefined}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-all hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connected ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Wallet className="w-3.5 h-3.5 text-indigo-400" />
        )}
        <span>{connecting ? "Connecting..." : displayLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted && open && !connected && (
        <div className="absolute right-0 top-full z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">Choose Wallet</div>
              <div className="text-[10px] text-zinc-500">Pick a wallet, then connect it to Solana devnet.</div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {sortedWallets.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-500">
                <AlertCircle className="w-4 h-4 text-zinc-600" />
                No wallets detected.
              </div>
            ) : (
              sortedWallets.map((entry) => {
                const isSelected = selectedWalletName === entry.adapter.name;
                const stateLabel = readyStateLabel(entry.readyState);
                const stateClass = readyStateStyles(entry.readyState);
                const isUnsupported = entry.readyState === "Unsupported";

                return (
                  <button
                    key={entry.adapter.name}
                    type="button"
                    onClick={() => handleWalletSelect(entry.adapter.name as WalletName)}
                    disabled={isUnsupported}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                      isSelected
                        ? "border-indigo-500/30 bg-indigo-600/10"
                        : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/80"
                    } ${isUnsupported ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-100">{entry.adapter.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className={`rounded-full border px-2 py-0.5 font-bold uppercase tracking-wider ${stateClass}`}>
                          {stateLabel}
                        </span>
                        {isSelected && <span className="text-zinc-400">Selected</span>}
                      </div>
                    </div>

                    <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      {isUnsupported ? "Unavailable" : "Connect"}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {wallets.length > 0 && (
            <div className="border-t border-zinc-900 px-4 py-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-500">
                <span>Already connected?</span>
                <button
                  type="button"
                  onClick={async () => {
                    await disconnect();
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-zinc-300 transition-all hover:border-zinc-700 hover:text-zinc-100"
                >
                  <LogOut className="w-3 h-3" />
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
