"use client";

import type { ChangeEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, Shield, Download, Layers, Lock, RefreshCw, Terminal, Upload } from "lucide-react";
import { CsvDiffPanel } from "@/components/dashboard/csv-diff-panel";
import { isWipFeature } from "./feature-flags";
import type { MintPreset } from "@/components/dashboard/token-mints";

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
  } = props;

  const mintPickerRef = useRef<HTMLDivElement | null>(null);
  const [mintMenuOpen, setMintMenuOpen] = useState(false);

  const milestoneSum = useMemo(
    () => milestoneAmounts.reduce((acc, curr) => acc + Number(curr || 0), 0),
    [milestoneAmounts]
  );

  const durationSeconds = Number(createForm.duration || 0);
  const cliffDurationSeconds = Number(createForm.cliffDuration || 0);
  const cliffExceedsDuration = createForm.type === "1" && cliffDurationSeconds > durationSeconds;

  const selectedMintPreset = mintPresets.find((preset) => preset.mint === createForm.mint) ?? null;

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
          <div className="flex flex-col gap-4 border-b border-zinc-900 pb-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold tracking-tight">Create Stream</h2>
              <p className="text-xs text-zinc-400">Deploy a manual stream or deploy multiple streams via CSV</p>
            </div>
            <div className="flex w-full flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1 sm:w-auto sm:flex-row">
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
                CSV Bulk Import
                {isWipFeature("csvBulkCreate") && <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">WIP</span>}
              </button>
            </div>
          </div>

          {createMode === "manual" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Recipient</label>
                <input type="text" value={createForm.recipient} onChange={(e) => setCreateForm({ ...createForm, recipient: e.target.value })} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Amount</label>
                <input type="text" inputMode="decimal" value={createForm.amount} onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Mint</label>
                <div ref={mintPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setMintMenuOpen((open) => !open)}
                    className="w-full flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors min-w-0"
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
                      <div className="min-w-0 text-left">
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
                        <div className="font-mono text-[10px] text-zinc-500 truncate">
                          {selectedMintPreset ? selectedMintPreset.mint : createForm.mint || "Select or paste a mint address"}
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${mintMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {mintMenuOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 overflow-hidden max-h-[72vh]">
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
                              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${active ? "border-indigo-500/70 bg-indigo-500/10" : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0">
                                  <Image src={preset.logoURI} alt={`${preset.label} logo`} width={40} height={40} className="w-full h-full object-cover" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-extrabold text-zinc-100 truncate">{preset.label}</span>
                                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                                      {preset.decimals} dec
                                    </span>
                                  </div>
                                  <div className="font-mono text-[10px] text-zinc-500 truncate">{preset.mint}</div>
                                  <div className="text-[10px] text-zinc-600 truncate">{preset.note}</div>
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
                            className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Type</label>
                <select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-medium">
                  <option value="0">Linear Vesting</option>
                  <option value="1">Cliff Vesting</option>
                  <option value="2">Milestone-Based Vesting</option>
                </select>
              </div>
              {createForm.type !== "2" && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Duration</label>
                  <input type="number" value={createForm.duration} onChange={(e) => setCreateForm({ ...createForm, duration: e.target.value })} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
              )}

              {createForm.type === "1" && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Cliff</label>
                  <input type="number" value={createForm.cliffDuration} onChange={(e) => setCreateForm({ ...createForm, cliffDuration: e.target.value })} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                  {cliffExceedsDuration && (
                    <div className="mt-2 text-[10px] font-semibold text-amber-400">
                      Cliff duration must be less than or equal to the stream duration.
                    </div>
                  )}
                </div>
              )}

              {createForm.type === "2" && (
                <div className="md:col-span-2 grid gap-4 bg-zinc-900/30 border border-zinc-900 p-4 rounded-xl">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Count</label>
                    <input type="number" value={createForm.milestoneCount} onChange={(e) => setCreateForm({ ...createForm, milestoneCount: e.target.value })} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                  </div>
                  <div className="border-t border-zinc-900/60 pt-3">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Milestones</label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {milestoneAmounts.map((amt, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-400 font-mono font-bold">#{idx}</span>
                          <input type="text" inputMode="decimal" value={amt} onChange={(e) => {
                            const next = [...milestoneAmounts];
                            next[idx] = e.target.value;
                            setMilestoneAmounts(next);
                          }} className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-mono" placeholder="0" />
                        </div>
                      ))}
                    </div>
                    <div className={`mt-3 text-[10px] font-semibold font-mono ${Math.abs(milestoneSum - Number(createForm.amount || 0)) < 0.0000001 ? "text-emerald-500" : "text-amber-500"}`}>
                      {Math.abs(milestoneSum - Number(createForm.amount || 0)) < 0.0000001
                        ? <span>✔ Allocations sum ({milestoneSum.toLocaleString()}) matches total amount ({Number(createForm.amount || 0).toLocaleString()})!</span>
                        : <span>⚠ Sum ({milestoneSum.toLocaleString()}) does not match total amount ({Number(createForm.amount || 0).toLocaleString()}). Diff: {(Number(createForm.amount || 0) - milestoneSum).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="md:col-span-2 flex items-start gap-3 mt-2">
                <input type="checkbox" id="cancelable" checked={createForm.cancelable} onChange={(e) => setCreateForm({ ...createForm, cancelable: e.target.checked })} className="w-4 h-4 rounded border-zinc-800 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0" />
                <label htmlFor="cancelable" className="text-xs leading-5 font-semibold text-zinc-350 cursor-pointer select-none">Stream is cancelable by creator</label>
              </div>

              <button onClick={() => handleAction("create_stream", createForm)} className="md:col-span-2 w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20">Simulate / Deploy Stream</button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button onClick={() => downloadTemplate("create")} className="flex w-full items-center justify-center gap-1.5 px-3 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-350 transition-all sm:w-auto"><Download className="w-3.5 h-3.5 text-indigo-400" />Template</button>
                  <button onClick={() => fileInputCreateRef.current?.click()} className="flex w-full items-center justify-center gap-1.5 px-3 py-2 border border-indigo-900/60 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-450 rounded-xl text-xs font-semibold transition-all sm:w-auto"><Upload className="w-3.5 h-3.5" />Upload CSV</button>
                  <input type="file" accept=".csv" ref={fileInputCreateRef} onChange={(e) => handleCsvUpload(e, "create")} className="hidden" />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Baseline:</span>
                    <select value={compareVersionSelected} onChange={(e) => setCompareVersionSelected(e.target.value)} className="min-w-0 bg-zinc-900 border border-zinc-805 rounded-xl px-2.5 py-2 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-indigo-500">
                      <option value="0">Live Active DB</option>
                      {csvVersions.map((v) => <option key={v.id} value={v.version}>Version {v.version} ({v.filename})</option>)}
                    </select>
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
          <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={withdrawForm.streamId} onChange={(e) => setWithdrawForm({ ...withdrawForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>
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
          <div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={unlockForm.streamId} onChange={(e) => setUnlockForm({ ...unlockForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div>
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
          <div className="border-b border-zinc-900 pb-4 mb-6"><div className="flex items-center gap-2"><h2 className="text-2xl font-extrabold tracking-tight">Edit Cliff Conditions</h2>{isWipFeature("editCliff") && <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">WIP</span>}</div><p className="text-xs text-zinc-400">Modify cliff release durations or shift lockup parameters</p></div>
          {isStreamCsvCreated(editCliffForm.streamId) ? <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6"><Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" /><div><h4 className="text-sm font-extrabold">Manual Edit Locked!</h4><p className="text-xs text-red-400/80 mt-1 leading-relaxed">This stream was created via CSV Import. To comply with consistency requirements, CSV-created streams must be edited exclusively using the Bulk Edit CSV console.</p></div></div> : <div className="grid gap-4"><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label><input type="text" value={editCliffForm.streamId} onChange={(e) => setEditCliffForm({ ...editCliffForm, streamId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div><div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Cliff Unlock Timestamp (Seconds)</label><input type="number" value={editCliffForm.newCliffTs} onChange={(e) => setEditCliffForm({ ...editCliffForm, newCliffTs: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono" /></div></div>}
          <button disabled={isStreamCsvCreated(editCliffForm.streamId)} onClick={() => handleAction("edit_cliff", editCliffForm)} className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${isStreamCsvCreated(editCliffForm.streamId) ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"}`}>Adjust Cliff Timestamp</button>
        </div>
      )}

      <div className="mt-12 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 font-mono text-[11px] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 flex gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-green-500/60" /></div>
        <div className="flex items-center gap-2 text-indigo-400 font-bold mb-2"><Terminal className="w-4 h-4 shrink-0" /><span>Equivalent CLI / Agent Skill Call</span></div>
        <div className="text-zinc-400 select-all overflow-x-auto whitespace-nowrap scrollbar-none py-1">{activeTab === "create_streams" && <span>{createMode === "manual" ? `$ unified-flow create-stream --recipient ${createForm.recipient || "<address>"} --amount ${createForm.amount} --type ${createForm.type === "0" ? "linear" : createForm.type === "1" ? "milestone" : "cliff"} --duration ${createForm.duration}` : `$ unified-flow create-bulk --csv ./vesting_list.csv --endpoint devnet`}</span>}{activeTab === "edit_csv" && <span>$ unified-flow edit-bulk --csv ./vesting_edits.csv --endpoint devnet</span>}{activeTab === "withdraw" && <span>$ unified-flow claim-tokens --stream {withdrawForm.streamId || "<stream_pda>"}</span>}{activeTab === "cancel" && <span>$ unified-flow cancel-stream --stream {cancelForm.streamId || "<stream_pda>"}</span>}{activeTab === "unlock_milestone" && <span>$ unified-flow unlock-milestone --stream {unlockForm.streamId || "<stream_pda>"}</span>}{activeTab === "edit_milestone" && <span>$ unified-flow edit-milestone --stream {editMilestoneForm.streamId || "<stream_pda>"} --index {editMilestoneForm.index} --amount {editMilestoneForm.newAmount}</span>}{activeTab === "edit_linear" && <span>$ unified-flow edit-linear --stream {editLinearForm.streamId || "<stream_pda>"} {editLinearForm.newEndTs ? `--end-ts ${editLinearForm.newEndTs}` : ""} {editLinearForm.topupAmount ? `--topup ${editLinearForm.topupAmount}` : ""}</span>}{activeTab === "edit_cliff" && <span>$ unified-flow edit-cliff --stream {editCliffForm.streamId || "<stream_pda>"} --cliff-ts {editCliffForm.newCliffTs || "<timestamp>"}</span>}</div>
      </div>
    </>
  );
}
