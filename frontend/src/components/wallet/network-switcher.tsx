"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { useNetwork } from "@/components/wallet/network-context";
import { VISIBLE_CLUSTERS, type ClusterKey } from "@/lib/solana/network-config";

const DOT_COLOR: Record<ClusterKey, string> = {
  devnet: "bg-amber-400",
  mainnet: "bg-emerald-400",
  testnet: "bg-sky-400",
};

const CLUSTER_LABEL: Record<ClusterKey, string> = {
  devnet: "Devnet",
  mainnet: "Mainnet",
  testnet: "Testnet",
};

export function NetworkSwitcher({ className = "", inline = false, dropdownAlign = "right" }: { className?: string; inline?: boolean; dropdownAlign?: "left" | "right" }) {
  const { cluster, network, enabledClusters, setCluster } = useNetwork();
  const [open, setOpen] = useState(false);
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

  const enabledSet = new Set(enabledClusters);

  const handleSelect = (next: ClusterKey) => {
    if (!enabledSet.has(next) || next === cluster) {
      setOpen(false);
      return;
    }
    setCluster(next);
    setOpen(false);
  };

  // Inline mode: render options directly, no sub-dropdown
  if (inline) {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {VISIBLE_CLUSTERS.map((key) => {
          const isCurrent = key === cluster;
          const isEnabled = enabledSet.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              disabled={!isEnabled}
              aria-disabled={!isEnabled}
              title={isEnabled ? undefined : "This cluster is disabled in the current environment."}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
                !isEnabled
                  ? "cursor-not-allowed border-transparent opacity-40"
                  : isCurrent
                    ? "border-indigo-500/30 bg-indigo-600/10"
                    : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/60"
              }`}
            >
              <span className={`flex items-center gap-2 text-xs font-semibold ${isEnabled ? "text-zinc-100" : "text-zinc-500"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[key]}`} />
                {CLUSTER_LABEL[key]}
              </span>
              {isCurrent && <Check className="h-3.5 w-3.5 text-emerald-400" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-all hover:border-zinc-700 hover:bg-zinc-800"
      >
        <Globe2 className="h-3.5 w-3.5 text-zinc-400" />
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[cluster]}`} />
        <span>{network.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute ${dropdownAlign === "left" ? "left-0" : "right-0"} top-full z-50 mt-3 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-xl`}>
          <div className="border-b border-zinc-900 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">Network</div>
            <div className="text-[10px] text-zinc-500">
              Switching reconnects the wallet on the new cluster.
            </div>
          </div>
          <div className="p-2">
            {VISIBLE_CLUSTERS.map((key) => {
              const isCurrent = key === cluster;
              const isEnabled = enabledSet.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelect(key)}
                  disabled={!isEnabled}
                  aria-disabled={!isEnabled}
                  title={isEnabled ? undefined : "This cluster is disabled in the current environment."}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    !isEnabled
                      ? "cursor-not-allowed border-transparent opacity-40"
                      : isCurrent
                        ? "border-indigo-500/30 bg-indigo-600/10"
                        : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/80"
                  }`}
                >
                  <span className={`flex items-center gap-2 text-sm font-semibold ${isEnabled ? "text-zinc-100" : "text-zinc-500"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[key]}`} />
                    {CLUSTER_LABEL[key]}
                  </span>
                  {isCurrent && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
