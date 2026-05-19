"use client";

import type { ChangeEvent, RefObject } from "react";
import { useMemo } from "react";
import { Shield, Download, Layers, Lock, RefreshCw, Terminal, Upload } from "lucide-react";
import { CsvDiffPanel } from "@/components/dashboard/csv-diff-panel";

type Props = {
  activeTab: string;
  useMultisig: boolean;
  setUseMultisig: (value: boolean) => void;
  createMode: "manual" | "csv";
  setCreateMode: (value: "manual" | "csv") => void;
  createForm: any;
  setCreateForm: (value: any) => void;
  milestoneAmounts: string[];
  setMilestoneAmounts: (value: string[]) => void;
  csvCreateText: string;
  setCsvCreateText: (value: string) => void;
  csvEditText: string;
  setCsvEditText: (value: string) => void;
  compareVersionSelected: string;
  setCompareVersionSelected: (value: string) => void;
  csvVersions: any[];
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
  copiedId: string | null;
  copyToClipboard: (text: string, id: string) => void;
  prefillAction: (tab: any, streamId: string) => void;
  setActiveTab: (tab: any) => void;
};

export function DashboardActionPanels(props: Props) {
  const {
    activeTab,
    useMultisig,
    setUseMultisig,
    createMode,
    setCreateMode,
    createForm,
    setCreateForm,
    milestoneAmounts,
    setMilestoneAmounts,
    csvCreateText,
    setCsvCreateText,
    csvEditText,
    setCsvEditText,
    compareVersionSelected,
    setCompareVersionSelected,
    csvVersions,
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
    copiedId,
    copyToClipboard,
    prefillAction,
    setActiveTab,
    setCsvEditText: setCsvEditTextProp,
  } = props;

  const milestoneSum = useMemo(
    () => milestoneAmounts.reduce((acc, curr) => acc + Number(curr || 0), 0),
    [milestoneAmounts]
  );

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
              <p className="text-[10px] text-zinc-500">Enable this option to bundle your action as a Squads multisig proposal instead of executing directly.</p>
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
        <div className="animate-in fade-in-30 duration-200">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Create Stream</h2>
              <p className="text-xs text-zinc-400">Deploy a manual stream or deploy multiple streams via CSV</p>
            </div>
            <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-xl">
              <button onClick={() => setCreateMode("manual")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${createMode === "manual" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>Manual Form</button>
              <button onClick={() => setCreateMode("csv")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${createMode === "csv" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>CSV Bulk Import</button>
            </div>
          </div>

          {createMode === "manual" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Recipient Pubkey</label>
                <input type="text" value={createForm.recipient} onChange={(e) => setCreateForm({ ...createForm, recipient: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Total Amount</label>
                <input type="number" value={createForm.amount} onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Token Mint</label>
                <input type="text" value={createForm.mint} onChange={(e) => setCreateForm({ ...createForm, mint: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Vesting Schedule Type</label>
                <select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium">
                  <option value="0">Linear Vesting</option>
                  <option value="1">Cliff Vesting</option>
                  <option value="2">Milestone-Based Vesting</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Duration (Seconds)</label>
                <input type="number" value={createForm.duration} onChange={(e) => setCreateForm({ ...createForm, duration: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>

              {createForm.type === "1" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Cliff Duration (Seconds)</label>
                  <input type="number" value={createForm.cliffDuration} onChange={(e) => setCreateForm({ ...createForm, cliffDuration: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
              )}

              {createForm.type === "2" && (
                <div className="col-span-2 grid gap-4 bg-zinc-900/30 border border-zinc-900 p-4 rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Count</label>
                    <input type="number" value={createForm.milestoneCount} onChange={(e) => setCreateForm({ ...createForm, milestoneCount: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                  </div>
                  <div className="border-t border-zinc-900/60 pt-3">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Milestone Amount Allocations</label>
                    <div className="grid grid-cols-2 gap-3">
                      {milestoneAmounts.map((amt, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-400 font-mono font-bold">Milestone #{idx} Amount</span>
                          <input type="number" value={amt} onChange={(e) => {
                            const next = [...milestoneAmounts];
                            next[idx] = e.target.value;
                            setMilestoneAmounts(next);
                          }} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 font-mono" placeholder="0" />
                        </div>
                      ))}
                    </div>
                    <div className={`mt-3 text-[10px] font-semibold font-mono ${milestoneSum === Number(createForm.amount || 0) ? "text-emerald-500" : "text-amber-500"}`}>
                      {milestoneSum === Number(createForm.amount || 0)
                        ? <span>✔ Allocations sum ({milestoneSum.toLocaleString()}) matches total amount ({Number(createForm.amount || 0).toLocaleString()})!</span>
                        : <span>⚠ Sum ({milestoneSum.toLocaleString()}) does not match total amount ({Number(createForm.amount || 0).toLocaleString()}). Diff: {(Number(createForm.amount || 0) - milestoneSum).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 h-full mt-6">
                <input type="checkbox" id="cancelable" checked={createForm.cancelable} onChange={(e) => setCreateForm({ ...createForm, cancelable: e.target.checked })} className="w-4 h-4 rounded border-zinc-800 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0" />
                <label htmlFor="cancelable" className="text-xs font-semibold text-zinc-350 cursor-pointer select-none">Stream is Cancelable by Creator</label>
              </div>

              <button onClick={() => handleAction("create_stream", createForm)} className="col-span-2 w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20">Simulate / Deploy Stream</button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => downloadTemplate("create")} className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-350 transition-all"><Download className="w-3.5 h-3.5 text-indigo-400" />Template</button>
                  <button onClick={() => fileInputCreateRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-900/60 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-450 rounded-xl text-xs font-semibold transition-all"><Upload className="w-3.5 h-3.5" />Upload CSV</button>
                  <input type="file" accept=".csv" ref={fileInputCreateRef} onChange={(e) => handleCsvUpload(e, "create")} className="hidden" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Baseline:</span>
                    <select value={compareVersionSelected} onChange={(e) => setCompareVersionSelected(e.target.value)} className="bg-zinc-900 border border-zinc-805 rounded-xl px-2.5 py-1.5 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-indigo-500">
                      <option value="0">Live Active DB</option>
                      {csvVersions.map((v) => <option key={v.id} value={v.version}>Version {v.version} ({v.filename})</option>)}
                    </select>
                  </div>
                  <button onClick={() => handleAnalyzeDiff("create")} disabled={loadingDiff} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 border border-indigo-700 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-40">
                    {loadingDiff ? <RefreshCw className="w-3 h-3 animate-spin text-white" /> : <Layers className="w-3 h-3" />}Analyze Diff
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">CSV Payload Preview / Editor</label>
                <textarea rows={6} value={csvCreateText} onChange={(e) => setCsvCreateText(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
              </div>

      <CsvDiffPanel csvDiffResult={csvDiffResult} compareVersionSelected={compareVersionSelected} onClose={() => setCsvDiffResult(null)} />

              <button onClick={() => handleAction("create_stream_csv", null)} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20">Approve & Apply CSV Revision (Creates v{csvVersions.length + 1})</button>
            </div>
          )}
        </div>
      )}

      {activeTab === "edit_csv" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-emerald-400">Bulk Edit CSV</h2>
            <p className="text-xs text-zinc-400">Modify multiple CSV-created streams simultaneously via CSV updates</p>
          </div>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <button onClick={() => downloadTemplate("edit")} className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-350 transition-all"><Download className="w-3.5 h-3.5 text-emerald-450" />Template</button>
                <button onClick={() => fileInputEditRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-900/60 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 rounded-xl text-xs font-semibold transition-all"><Upload className="w-3.5 h-3.5" />Upload CSV</button>
                <input type="file" accept=".csv" ref={fileInputEditRef} onChange={(e) => handleCsvUpload(e, "edit")} className="hidden" />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Baseline:</span>
                  <select value={compareVersionSelected} onChange={(e) => setCompareVersionSelected(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-indigo-500">
                    <option value="0">Live Active DB</option>
                    {csvVersions.map((v) => <option key={v.id} value={v.version}>Version {v.version} ({v.filename})</option>)}
                  </select>
                </div>
                <button onClick={() => handleAnalyzeDiff("edit")} disabled={loadingDiff} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-700 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-40">
                  {loadingDiff ? <RefreshCw className="w-3 h-3 animate-spin text-white" /> : <Layers className="w-3 h-3" />}Analyze Diff
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">CSV Edit Payload Preview / Editor</label>
              <textarea rows={6} value={csvEditText} onChange={(e) => setCsvEditText(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
            </div>

            <CsvDiffPanel csvDiffResult={csvDiffResult} compareVersionSelected={compareVersionSelected} onClose={() => setCsvDiffResult(null)} />

            <button onClick={() => handleAction("edit_stream_csv", null)} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20">Approve & Apply CSV Revision (Creates v{csvVersions.length + 1})</button>
          </div>
        </div>
      )}

      {activeTab === "withdraw" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Withdraw Claim</h2><p className="text-xs text-zinc-400">Withdraw matured/unlocked tokens from an active vesting stream</p></div>
          <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={withdrawForm.streamId} onChange={(e) => setWithdrawForm({ ...withdrawForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Amount to Claim</label><input type="number" value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" /></div></div>
          <button onClick={() => handleAction("withdraw", withdrawForm)} className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20">Claim Claimable Tokens</button>
        </div>
      )}

      {activeTab === "cancel" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Cancel Stream</h2><p className="text-xs text-zinc-400">Cancel vesting and refund remaining locked tokens back to creator</p></div>
          <div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={cancelForm.streamId} onChange={(e) => setCancelForm({ ...cancelForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div>
          <button onClick={() => handleAction("cancel", cancelForm)} className="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-red-500/20">Cancel and Refund</button>
        </div>
      )}

      {activeTab === "unlock_milestone" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Unlock Milestone</h2><p className="text-xs text-zinc-400">Release milestone allocations sequentially based on milestones attained</p></div>
          <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={unlockForm.streamId} onChange={(e) => setUnlockForm({ ...unlockForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Index</label><input type="number" value={unlockForm.milestoneIndex} onChange={(e) => setUnlockForm({ ...unlockForm, milestoneIndex: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>
          <button onClick={() => handleAction("unlock_milestone", unlockForm)} className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20">Unlock Milestone</button>
        </div>
      )}

      {activeTab === "edit_milestone" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Edit Milestone Structure</h2><p className="text-xs text-zinc-400">Modify milestone details or adjust allocated milestone target amounts</p></div>
          {isStreamCsvCreated(editMilestoneForm.streamId) ? <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6"><Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" /><div><h4 className="text-sm font-extrabold">Manual Edit Locked!</h4><p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p></div></div> : <div className="grid gap-4 sm:grid-cols-3"><div className="sm:col-span-3"><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={editMilestoneForm.streamId} onChange={(e) => setEditMilestoneForm({ ...editMilestoneForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Index</label><input type="number" value={editMilestoneForm.index} onChange={(e) => setEditMilestoneForm({ ...editMilestoneForm, index: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div className="sm:col-span-2"><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Allocation Amount</label><input type="number" value={editMilestoneForm.newAmount} onChange={(e) => setEditMilestoneForm({ ...editMilestoneForm, newAmount: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" /></div></div>}
          <button disabled={isStreamCsvCreated(editMilestoneForm.streamId)} onClick={() => handleAction("edit_milestone", editMilestoneForm)} className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${isStreamCsvCreated(editMilestoneForm.streamId) ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}>Apply Milestone Edits</button>
        </div>
      )}

      {activeTab === "edit_linear" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Edit Linear Timeline</h2><p className="text-xs text-zinc-400">Modify linear timelines or extend stream end thresholds</p></div>
          {isStreamCsvCreated(editLinearForm.streamId) ? <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6"><Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" /><div><h4 className="text-sm font-extrabold">Manual Edit Locked!</h4><p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p></div></div> : <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={editLinearForm.streamId} onChange={(e) => setEditLinearForm({ ...editLinearForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New End Timestamp (Seconds)</label><input type="number" value={editLinearForm.newEndTs} onChange={(e) => setEditLinearForm({ ...editLinearForm, newEndTs: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Top-up Amount (Tokens to Add)</label><input type="number" value={editLinearForm.topupAmount} onChange={(e) => setEditLinearForm({ ...editLinearForm, topupAmount: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>}
          <button disabled={isStreamCsvCreated(editLinearForm.streamId)} onClick={() => handleAction("edit_linear", editLinearForm)} className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${isStreamCsvCreated(editLinearForm.streamId) ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}>Update End Timeline & Top-up Stream</button>
        </div>
      )}

      {activeTab === "edit_cliff" && (
        <div className="animate-in fade-in-30 duration-200">
          <div className="border-b border-zinc-900 pb-4 mb-6"><h2 className="text-2xl font-extrabold tracking-tight">Edit Cliff Conditions</h2><p className="text-xs text-zinc-400">Modify cliff release durations or shift lockup parameters</p></div>
          {isStreamCsvCreated(editCliffForm.streamId) ? <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6"><Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" /><div><h4 className="text-sm font-extrabold">Manual Edit Locked!</h4><p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p></div></div> : <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={editCliffForm.streamId} onChange={(e) => setEditCliffForm({ ...editCliffForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Cliff Unlock Timestamp (Seconds)</label><input type="number" value={editCliffForm.newCliffTs} onChange={(e) => setEditCliffForm({ ...editCliffForm, newCliffTs: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>}
          <button disabled={isStreamCsvCreated(editCliffForm.streamId)} onClick={() => handleAction("edit_cliff", editCliffForm)} className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${isStreamCsvCreated(editCliffForm.streamId) ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}>Adjust Cliff Timestamp</button>
        </div>
      )}

      <div className="mt-12 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 font-mono text-[11px] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 flex gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-green-500/60" /></div>
        <div className="flex items-center gap-2 text-indigo-400 font-bold mb-2"><Terminal className="w-4 h-4 shrink-0" /><span>Equivalent CLI / Agent Skill Call</span></div>
        <div className="text-zinc-400 select-all overflow-x-auto whitespace-nowrap scrollbar-none py-1">{activeTab === "create_streams" && <span>{createMode === "manual" ? `$ mancer-flow create-stream --recipient ${createForm.recipient || "<address>"} --amount ${createForm.amount} --type ${createForm.type === "0" ? "linear" : createForm.type === "1" ? "milestone" : "cliff"} --duration ${createForm.duration}` : `$ mancer-flow create-bulk --csv ./vesting_list.csv --endpoint devnet`}</span>}{activeTab === "edit_csv" && <span>$ mancer-flow edit-bulk --csv ./vesting_edits.csv --endpoint devnet</span>}{activeTab === "withdraw" && <span>$ mancer-flow claim-tokens --stream {withdrawForm.streamId || "<stream_pda>"} {withdrawForm.amount ? `--amount ${withdrawForm.amount}` : ""}</span>}{activeTab === "cancel" && <span>$ mancer-flow cancel-stream --stream {cancelForm.streamId || "<stream_pda>"}</span>}{activeTab === "unlock_milestone" && <span>$ mancer-flow unlock-milestone --stream {unlockForm.streamId || "<stream_pda>"} --index {unlockForm.milestoneIndex}</span>}{activeTab === "edit_milestone" && <span>$ mancer-flow edit-milestone --stream {editMilestoneForm.streamId || "<stream_pda>"} --index {editMilestoneForm.index} --amount {editMilestoneForm.newAmount}</span>}{activeTab === "edit_linear" && <span>$ mancer-flow edit-linear --stream {editLinearForm.streamId || "<stream_pda>"} {editLinearForm.newEndTs ? `--end-ts ${editLinearForm.newEndTs}` : ""} {editLinearForm.topupAmount ? `--topup ${editLinearForm.topupAmount}` : ""}</span>}{activeTab === "edit_cliff" && <span>$ mancer-flow edit-cliff --stream {editCliffForm.streamId || "<stream_pda>"} --cliff-ts {editCliffForm.newCliffTs || "<timestamp>"}</span>}</div>
      </div>
    </>
  );
}
