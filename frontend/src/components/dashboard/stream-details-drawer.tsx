"use client";

import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, Calendar, Check, Copy, FileText, History, Settings, Unlock, XCircle,Lock } from "lucide-react";
import { formatDate, formatTokenAmount, getAmountUnitLabel, getMilestoneAllocations, shorten } from "./utils";
import { getExplorerClusterParam } from "@/lib/solana/network-config";

export const StreamDetailsDrawer = memo(function StreamDetailsDrawer({
  selectedStream,
  loadingDetails,
  copiedId,
  copyToClipboard,
  prefillAction,
  setActiveTab,
  setCsvEditText,
  setSelectedStream,
  connectedWalletAddress,
  currentTimeTs,
  endpoint,
}: {
  selectedStream: any;
  loadingDetails: boolean;
  copiedId: string | null;
  copyToClipboard: (text: string, id: string) => void;
  prefillAction: (tab: any, streamOrId: string | Record<string, any>) => void;
  setActiveTab: (tab: any) => void;
  setCsvEditText: (value: string) => void;
  setSelectedStream: (value: any) => void;
  connectedWalletAddress: string | null;
  currentTimeTs: number;
  endpoint: string;
}) {
  useEffect(() => {
    if (!selectedStream) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedStream]);

  if (!selectedStream) return null;

  const isRecipientWallet =
    connectedWalletAddress !== null &&
    selectedStream.recipient?.toLowerCase() === connectedWalletAddress.toLowerCase();
  const isCreatorWallet =
    connectedWalletAddress !== null &&
    selectedStream.creator?.toLowerCase() === connectedWalletAddress.toLowerCase();
  const isCancelled = Number(selectedStream.status) === 3 || Boolean(selectedStream.cancelled);
  const cancelledTx = isCancelled
    ? selectedStream.transactions?.find((tx: any) => tx.type === "CANCEL") ?? null
    : null;
  const cancelledAt = cancelledTx?.createdAt ?? selectedStream.updatedAt ?? null;
  const mintDecimals = typeof selectedStream.mintDecimals === "number" ? selectedStream.mintDecimals : null;
  const amountLabel = getAmountUnitLabel(selectedStream.mint);
  const total = Number(selectedStream.totalAmount || 0);
  const withdrawn = Number(selectedStream.withdrawn || 0);
  const unlocked = Number(selectedStream.unlockedAmount || 0);
  const end = Number(selectedStream.endTs || 0);
  const isMilestoneCompleted = selectedStream.vestingType === 2 && (Number(selectedStream.completedAt || 0) > 0 || (total > 0 && unlocked >= total));
  const isFullyClaimed = total > 0 && withdrawn >= total;
  const isEnded = !isCancelled && (selectedStream.vestingType === 2 ? isMilestoneCompleted : currentTimeTs >= end);
  const cancelDisabled = isCancelled || isEnded || isFullyClaimed;
const hasClaimable = selectedStream.vestingType === 2
  ? unlocked > withdrawn && unlocked > 0          // milestone: harus ada yg di-unlock dulu
  : !isEnded
    ? true                                        // linear/cliff belum ended → aktif
    : total > withdrawn;                          // linear/cliff ended → cek sisa                       // linear/cliff ended: pakai total - withdrawn

  const drawer = (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 sm:bg-black/60 backdrop-blur-md flex justify-end overflow-x-hidden animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-[100dvh] sm:h-full rounded-none sm:rounded-r-3xl flex flex-col overflow-hidden p-5 sm:p-6 shadow-2xl relative animate-in slide-in-from-right duration-350">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-900 pb-4 mb-5 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <History className="w-5 h-5 text-indigo-400" />
              <h3 className="text-md font-extrabold text-zinc-100 truncate">Stream Specifications</h3>
            </div>
            <button
              onClick={() => setSelectedStream(null)}
              className="p-1 rounded-lg border border-zinc-900 hover:border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 transition-all"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          {loadingDetails ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-2">
              <div className="w-7 h-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span className="text-xs">Fetching event signatures & slots...</span>
            </div>
          ) : (
            <>
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 mb-5 min-w-0 overflow-hidden">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                  {isCancelled ? "Cancelled Stream" : selectedStream.vestingType === 2 ? "Milestone Unlock Progress" : "Claim Completeness Index"}
                </div>
                <div className="flex justify-between items-end mb-2">
                    <span className="text-xl font-black font-mono bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                      {(() => {
                        const total = Number(selectedStream.totalAmount);
                        const withdrawn = Number(selectedStream.withdrawn);
                        const unlocked = Number(selectedStream.unlockedAmount || 0);
                        const value = isCancelled ? withdrawn : selectedStream.vestingType === 2 ? unlocked : withdrawn;
                      return ((value / total) * 100).toFixed(1);
                    })()}%
                  </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                    {isCancelled
                      ? `${formatTokenAmount(selectedStream.withdrawn, mintDecimals)} / ${formatTokenAmount(selectedStream.totalAmount, mintDecimals)} ${amountLabel} Cancelled`
                      : selectedStream.vestingType === 2
                      ? `${formatTokenAmount(selectedStream.unlockedAmount || 0, mintDecimals)} / ${formatTokenAmount(selectedStream.totalAmount, mintDecimals)} ${amountLabel} Unlocked`
                      : `${formatTokenAmount(selectedStream.withdrawn, mintDecimals)} / ${formatTokenAmount(selectedStream.totalAmount, mintDecimals)} ${amountLabel} Claimed`}
                    </span>
                </div>
                <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        ((() => {
                          const withdrawn = Number(selectedStream.withdrawn);
                          const unlocked = Number(selectedStream.unlockedAmount || 0);
                          return isCancelled ? withdrawn : selectedStream.vestingType === 2 ? unlocked : withdrawn;
                        })() / Number(selectedStream.totalAmount)) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="text-xs grid gap-3.5 bg-zinc-900/25 border border-zinc-900 p-4 rounded-2xl min-w-0 overflow-hidden">
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Stream ID (PDA)</span>
                  <div className="grid gap-2 sm:flex sm:items-center sm:justify-between font-mono bg-zinc-950 border border-zinc-900 rounded-lg px-2.5 py-1.5 text-zinc-300 min-w-0 overflow-visible">
                    <span className="min-w-0 flex-1 break-all whitespace-normal select-all">{selectedStream.id}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedStream.id, "drawer_id")}
                      className="text-zinc-500 hover:text-zinc-300 shrink-0 justify-self-end self-start sm:self-auto touch-manipulation"
                      aria-label="Copy stream PDA"
                    >
                      {copiedId === "drawer_id" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3 min-w-0">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Vesting Mode</span>
                    <span className="font-semibold text-zinc-300">{selectedStream.vestingType === 0 ? "Linear Stream" : selectedStream.vestingType === 1 ? "Cliff Lockup" : "Milestone-Based"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Creation Origin</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block ${isCancelled ? "bg-rose-500/10 text-rose-400 border border-rose-500/25" : selectedStream.isCsvCreated ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25"}`}>
                      {isCancelled ? "Cancelled" : selectedStream.isCsvCreated ? "CSV Bulk" : "Manual"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3 min-w-0">
                  {/* Hardcoded in smart contract — hidden until configurable
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Cancelable</span>
                    <span className="font-semibold text-zinc-300">{selectedStream.cancelable ? "Yes (Permitted)" : "No (Immutable)"}</span>
                  </div>
                  */}
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Milestones Defined</span>
                    <span className="font-semibold text-zinc-300 font-mono">{selectedStream.milestoneCount} milestones</span>
                  </div>
                </div>

                {isCancelled && cancelledAt && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3 min-w-0">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Cancelled At</span>
                      <span className="font-semibold text-rose-300 break-words">{new Date(cancelledAt).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {selectedStream.vestingType === 2 && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3 min-w-0">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Unlocked Amount</span>
                        <span className="font-semibold text-emerald-400 font-mono">{formatTokenAmount(selectedStream.unlockedAmount || 0, mintDecimals)} {amountLabel}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Claimable Remaining</span>
                        <span className="font-semibold text-indigo-400 font-mono">{formatTokenAmount(Math.max(Number(selectedStream.unlockedAmount || 0) - Number(selectedStream.withdrawn), 0), mintDecimals)} {amountLabel}</span>
                      </div>
                    </div>

                    <div className="border-t border-zinc-900/60 pt-3 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Milestones Allocation per Index</span>
                      <div className="grid gap-2 min-w-0">
                        {(() => {
                          const list = getMilestoneAllocations({
                            totalAmount: selectedStream.totalAmount,
                            milestoneCount: Number(selectedStream.milestoneCount || 0),
                            milestones: selectedStream.milestones,
                          });

                          let cumulativeSum = 0;
                          const unlocked = Number(selectedStream.unlockedAmount || 0);

                          return list.map((amt: number, idx: number) => {
                            cumulativeSum += amt;
                            const isUnlocked = cumulativeSum <= unlocked;

                            return (
                              <div key={idx} className="flex items-center justify-between gap-3 font-mono bg-zinc-950 border border-zinc-900/70 rounded-xl px-3 py-2 text-zinc-300 text-[11px] min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isUnlocked ? "bg-emerald-450 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-zinc-800"}`} />
                                  <span className="font-extrabold truncate">Milestone #{idx}</span>
                                </div>
                                <div className="flex items-center gap-3 min-w-0 shrink-0">
                                  <span className="text-zinc-400 font-bold whitespace-nowrap text-right">{formatTokenAmount(amt, mintDecimals)} {amountLabel}</span>
                                  <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${isUnlocked ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-900 text-zinc-600 border border-zinc-850"}`}>
                                    {isUnlocked ? "Unlocked" : "Locked"}
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t border-zinc-900/60 pt-3 min-w-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Creator Account</span>
                  <span className="font-mono text-zinc-400 break-all block">{selectedStream.creator}</span>
                </div>

                <div className="border-t border-zinc-900/60 pt-3 min-w-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Recipient Destination</span>
                  <span className="font-mono text-zinc-400 break-all block">{selectedStream.recipient}</span>
                </div>

                <div className="border-t border-zinc-900/60 pt-3 min-w-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Token Mint Address</span>
                  <span className="font-mono text-zinc-400 break-all block">{selectedStream.mint}</span>
                </div>

                <div className="border-t border-zinc-900/60 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-zinc-500 font-mono min-w-0">
                  <span className="flex items-center gap-1 min-w-0"><Calendar className="w-3 h-3 shrink-0" /> <span className="min-w-0 break-words">Start: {formatDate(selectedStream.startTs)}</span></span>
                  {selectedStream.vestingType !== 2 && (
                    <span className="flex items-center gap-1 min-w-0"><Calendar className="w-3 h-3 shrink-0" /> <span className="min-w-0 break-words">End: {formatDate(selectedStream.endTs)}</span></span>
                  )}
                  {selectedStream.vestingType === 2 && selectedStream.completedAt && (
                    <span className="col-span-1 sm:col-span-2 flex items-center gap-1 text-emerald-400 font-bold border-t border-zinc-900/40 pt-1.5 mt-1 min-w-0"><Calendar className="w-3 h-3 shrink-0" /> <span className="min-w-0 break-words">Completed At: {formatDate(selectedStream.completedAt)}</span></span>
                  )}
                  {selectedStream.vestingType === 1 && (
                    <span className="col-span-1 sm:col-span-2 flex items-center gap-1 text-amber-500 font-bold border-t border-zinc-900/40 pt-1.5 mt-1 min-w-0"><Calendar className="w-3 h-3 shrink-0" /> <span className="min-w-0 break-words">Cliff Unlock: {formatDate(selectedStream.cliffTs)} ({Number(selectedStream.cliffTs) - Number(selectedStream.startTs)}s duration)</span></span>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-zinc-900 pt-5 min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-350">Transaction Ledger</h4>
                </div>

                {!selectedStream.transactions || selectedStream.transactions.length === 0 ? (
                  <div className="text-[10px] text-zinc-600 bg-zinc-900/10 border border-zinc-900/50 text-center py-4 rounded-xl">No indexed ledger entries found for this stream.</div>
                ) : (
                  <div className="grid gap-2.5 min-w-0">
                    {selectedStream.transactions.map((tx: any) => (
                      <div key={tx.id} className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-3 flex justify-between items-start gap-3 text-[10px] min-w-0 overflow-hidden">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${tx.type === "CREATE_STREAM" ? "bg-indigo-400" : "bg-emerald-400"}`} />
                            <span className="font-bold text-zinc-300 uppercase tracking-wide">{tx.type}</span>
                          </div>
                          <span className="text-[9px] text-zinc-500 font-mono block">Signature: {shorten(tx.signature)}</span>
                          <span className="text-[9px] text-zinc-500 font-mono block">Slot: {tx.slot}</span>
                        </div>

                        <a href={`https://solscan.io/tx/${tx.signature}?cluster=${getExplorerClusterParam(endpoint)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-bold transition-all shrink-0">
                          Solscan <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!loadingDetails && (
          <div className="border-t border-zinc-900 pt-4 flex flex-col gap-2 min-w-0">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Instant Action Shortcuts</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold min-w-0">
              {isRecipientWallet && (
                isCancelled || isFullyClaimed || (selectedStream.vestingType === 2 && unlocked === 0) || !hasClaimable ? (
                  <div className="flex items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500 border border-zinc-800 py-2.5 rounded-xl text-center">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Claim Disabled
                  </div>
                ) : (
                  <button onClick={() => prefillAction("withdraw", selectedStream.id)} className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-zinc-50 py-2.5 rounded-xl transition-all">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Claim Tokens
                  </button>
                )
              )}
              {isCreatorWallet && selectedStream.cancelable && !cancelDisabled && (
                <button onClick={() => prefillAction("cancel", selectedStream.id)} className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-red-400 hover:text-red-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all">
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Stream
                </button>
              )}

              {isCreatorWallet && selectedStream.cancelable && cancelDisabled && (
                <div className="flex items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500 border border-zinc-800 py-2.5 rounded-xl text-center">
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Disabled
                </div>
              )}

              {isCreatorWallet && selectedStream.isCsvCreated ? (
                   <>
                {selectedStream.vestingType === 2 && (
      isCancelled|| isEnded ? (
        <div className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500 border border-zinc-800 py-2.5 rounded-xl text-center">
          <Unlock className="w-3.5 h-3.5" />
          Unlock Disabled
        </div>
      ) : (
        <button onClick={() => prefillAction("unlock_milestone", selectedStream.id)} className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all">
          <Unlock className="w-3.5 h-3.5" />
          Unlock Milestone Target
        </button>
      )
    )}
     {isCancelled || isEnded ? (
      <div className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500 border border-zinc-800 py-2.5 rounded-xl text-center">
        <FileText className="w-3.5 h-3.5" />
        Edit Disabled
      </div>
    ) : (
                <button
                  onClick={() => {
                    const decimals =
                    typeof selectedStream.mintDecimals === "number"
                      ? selectedStream.mintDecimals
                      : 0;

                    const humanAmount =
                      Number(selectedStream.totalAmount || 0) /
                      Math.pow(10, decimals);

                    const vestingType = Number(selectedStream.vestingType || 0);
                    const duration = Math.max(Number(selectedStream.endTs || 0) - Number(selectedStream.startTs || 0), 0);
                    const cliffDuration = Math.max(Number(selectedStream.cliffTs || 0) - Number(selectedStream.startTs || 0), 0);
                    const milestones =
                    String(selectedStream.milestones || "")
                      .split(";")
                      .map(v => Number(v) / Math.pow(10, decimals))
                      .join(";");
                    const header = "id,type,amount,duration,cliff_duration,milestones";
                    let row = `${selectedStream.id},${vestingType},${selectedStream.totalAmount},,,`;

                    if (vestingType === 0) {
                      row = `${selectedStream.id},0,${humanAmount},${duration},,`;
                    } else if (vestingType === 1) {
                      row = `${selectedStream.id},1,${humanAmount},,${cliffDuration},`;
                    } else if (vestingType === 2) {
                      row = `${selectedStream.id},2,${humanAmount},,,${milestones}`;
                    }

                    setActiveTab("edit_csv");
                    setCsvEditText(`${header}\n${row}`);
                    setSelectedStream(null);
                  }}
                  className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Edit via CSV Console
                </button>
    )}
               </>
             ) : isCreatorWallet ? (
  <>
    {selectedStream.vestingType === 2 && (
      isCancelled || isEnded ? (
        <div className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500 border border-zinc-800 py-2.5 rounded-xl text-center">
          <Unlock className="w-3.5 h-3.5" />
          Unlock Disabled
        </div>
      ) : (
        <button onClick={() => prefillAction("unlock_milestone", selectedStream.id)} className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all">
          <Unlock className="w-3.5 h-3.5" />
          Unlock Milestone Target
        </button>
      )
    )}

   {isCancelled || isEnded ? (
  <div className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500 border border-zinc-800 py-2.5 rounded-xl text-center">
    <Settings className="w-3.5 h-3.5" />
    Modify Disabled
  </div>
) : selectedStream.vestingType === 1 ? (
  <>
    <button
      onClick={() => prefillAction("edit_linear", selectedStream.id)}
      className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
    >
      <Settings className="w-3.5 h-3.5" />
      Edit Duration
    </button>
    <button
      onClick={() => prefillAction("edit_cliff", selectedStream.id)}
      className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-violet-400 hover:text-violet-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
    >
      <Lock className="w-3.5 h-3.5" />
      Edit Cliff
    </button>
  </>
) : selectedStream.vestingType === 0 ? (
  <button
    onClick={() => prefillAction("edit_linear", selectedStream.id)}
    className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
  >
    <Settings className="w-3.5 h-3.5" />
    Modify Vesting Structure
  </button>
) : (
  <button
    onClick={() => prefillAction("edit_milestone", selectedStream)}
    disabled={unlocked > 0}
    className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:hover:bg-zinc-900 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800"
  >
    <Settings className="w-3.5 h-3.5" />
    Modify Vesting Structure
  </button>
)}
  </>
) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return drawer;
  }

  return createPortal(drawer, document.body);
});
