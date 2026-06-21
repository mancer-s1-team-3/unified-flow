"use client";

import { useEffect, useState } from "react";
import { Shield, RefreshCw, AlertTriangle, ArrowRight, Play, Pause } from "lucide-react";
import { fetchAdminConfig } from "@/lib/solana/admin";

export function AdminPanel({
  connectedWalletAddress,
  endpoint,
  handleAction,
  activeTxAction,
  activeTxPhase,
  connected,
}: {
  connectedWalletAddress: string | null;
  endpoint: string;
  handleAction: (actionName: string, data: any) => Promise<void> | void;
  activeTxAction: string | null;
  activeTxPhase: "wallet_approval" | "sending" | "confirming" | null;
  connected: boolean;
}) {
  const [adminConfig, setAdminConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawForm, setWithdrawForm] = useState({ destination: "", amount: "" });

  const loadConfig = async () => {
    setLoading(true);
    const config = await fetchAdminConfig({ endpoint });
    setAdminConfig(config);
    setLoading(false);
  };

  useEffect(() => {
    loadConfig();
  }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch config after transactions complete
  useEffect(() => {
    if (!activeTxAction && !activeTxPhase) {
      loadConfig();
    }
  }, [activeTxAction, activeTxPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const isUnauthorized =
    !loading &&
    adminConfig &&
    connectedWalletAddress &&
    adminConfig.adminAuthority !== connectedWalletAddress;

  const isSubmittingPause = activeTxAction === "set_pause" && !!activeTxPhase;
  const isSubmittingWithdraw = activeTxAction === "withdraw_fees" && !!activeTxPhase;

  const canSubmitPause = connected && !loading && adminConfig && !isUnauthorized && !isSubmittingPause;
  
  const canSubmitWithdraw =
    connected &&
    !loading &&
    adminConfig &&
    !isUnauthorized &&
    !isSubmittingWithdraw &&
    withdrawForm.destination.trim() !== "" &&
    withdrawForm.amount.trim() !== "";

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="border-b border-zinc-900 pb-4 mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-indigo-400" />
          Admin Dashboard
        </h2>
        <p className="text-xs text-zinc-400">
          Manage protocol state and withdraw accumulated fees.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      )}

      {!loading && !connected && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 text-center">
          <p className="text-sm text-zinc-400">Please connect your wallet to access the admin dashboard.</p>
        </div>
      )}

      {!loading && connected && isUnauthorized && (
        <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <h3 className="text-lg font-bold text-rose-300 mb-2">Unauthorized</h3>
          <p className="text-sm text-rose-300/80 mb-4 max-w-sm">
            Your connected wallet is not the admin authority for the protocol on this network.
          </p>
          <div className="bg-rose-950/50 border border-rose-500/30 rounded-lg px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400/70 mb-1">
              Required Admin Wallet
            </div>
            <div className="font-mono text-xs text-rose-200 break-all">
              {adminConfig?.adminAuthority}
            </div>
          </div>
        </div>
      )}

      {!loading && connected && !isUnauthorized && adminConfig && (
        <div className="space-y-6">
          {/* Protocol State Panel */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-200">Protocol State</h3>
                <p className="text-xs text-zinc-500">
                  Pause or unpause the entire protocol. When paused, no new streams can be created or modified.
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${
                adminConfig.paused 
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-500" 
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
              }`}>
                {adminConfig.paused ? "Paused" : "Active"}
              </div>
            </div>

            <button
              disabled={!canSubmitPause}
              onClick={() => handleAction("set_pause", { paused: !adminConfig.paused })}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                !canSubmitPause
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : adminConfig.paused
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20"
              }`}
            >
              {isSubmittingPause ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : adminConfig.paused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              {isSubmittingPause
                ? "Processing..."
                : adminConfig.paused
                ? "Unpause Protocol"
                : "Pause Protocol"}
            </button>
          </div>

          {/* Fee Withdrawal Panel */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-zinc-200 mb-1">Fee Withdrawal</h3>
            <p className="text-xs text-zinc-500 mb-5">
              Withdraw accumulated SOL fees from the protocol's fee vault.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Vault Balance
                </div>
                <div className="font-mono text-sm text-zinc-200">
                  {adminConfig.feeVaultBalance / 1e9} SOL
                </div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Withdraw Fee Rate
                </div>
                <div className="font-mono text-sm text-zinc-200">
                  {adminConfig.withdrawFeeBps / 100}%
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Destination Wallet
                </label>
                <input
                  type="text"
                  value={withdrawForm.destination}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, destination: e.target.value })}
                  placeholder="SOL Address"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex justify-between">
                  <span>Amount (SOL)</span>
                  <button
                    onClick={() => setWithdrawForm({ ...withdrawForm, amount: (adminConfig.feeVaultBalance / 1e9).toString() })}
                    className="text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Max
                  </button>
                </label>
                <input
                  type="text"
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                  placeholder="0.0"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
              </div>
            </div>

            <button
              disabled={!canSubmitWithdraw}
              onClick={() => handleAction("withdraw_fees", withdrawForm)}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                !canSubmitWithdraw
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20"
              }`}
            >
              {isSubmittingWithdraw ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {isSubmittingWithdraw ? "Processing..." : "Withdraw Fees"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
