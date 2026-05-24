"use client";

import { memo } from "react";
import { Layers, X } from "lucide-react";
import { shorten } from "./utils";

export const CsvDiffPanel = memo(function CsvDiffPanel({
  csvDiffResult,
  compareVersionSelected,
  onClose,
}: {
  csvDiffResult: any;
  compareVersionSelected: string;
  onClose: () => void;
}) {
  if (!csvDiffResult) return null;
  const mode = csvDiffResult.mode === "edit" ? "edit" : "create";
  const showAdded = mode === "create";
  const showModified = mode === "edit";

  const formatType = (type: unknown) => {
    const value = Number(type);
    if (value === 0) return "Linear";
    if (value === 1) return "Cliff";
    return "Milestone";
  };

  const isMilestoneType = (type: unknown) => Number(type) === 2;
  const isCliffType = (type: unknown) => Number(type) === 1;

  const formatFieldName = (field: string) => {
    if (field === "cliffDuration") return "Cliff Duration";
    if (field === "cancelable") return "Cancelable";
    if (field === "milestones") return "Milestones";
    if (field === "duration") return "Duration";
    if (field === "amount") return "Amount";
    if (field === "type") return "Type";
    return field;
  };

  const formatFieldValue = (field: string, value: any) => {
    if (field === "amount") return `${Number(value || 0).toLocaleString()} Tokens`;
    if (field === "type") return formatType(value);
    if (field === "cancelable") return value ? "true" : "false";
    if (field === "milestones") return value || "None";
    if (field === "duration" || field === "cliffDuration") return `${Number(value || 0)}s`;
    return String(value ?? "None");
  };

  return (
    <div className="mt-8 bg-zinc-950 border border-zinc-900 rounded-3xl p-6 relative overflow-hidden animate-in fade-in duration-300">
      <div className="absolute top-0 right-0 p-4">
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center border border-zinc-850 text-zinc-400 hover:text-zinc-50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-3 border-b border-zinc-900 pb-4 mb-5">
        <Layers className="w-6 h-6 text-indigo-500 animate-pulse" />
        <div>
          <h3 className="text-sm font-black text-zinc-100 uppercase tracking-widest">CSV Revision Diff Engine</h3>
          <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">
            Comparing uploaded payload with {compareVersionSelected === "0" ? "Current Database Streams" : `Historical CSV Version ${compareVersionSelected}`}
          </p>
        </div>
      </div>

      <div className={`grid ${mode === "create" ? "grid-cols-2" : "grid-cols-2"} gap-3 mb-6`}>
        {showAdded && (
          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 text-center">
            <span className="block text-[9px] text-emerald-400 font-black uppercase tracking-wider">Added</span>
            <span className="block text-lg font-extrabold text-emerald-300 mt-1">{csvDiffResult.added.length}</span>
          </div>
        )}
        {showModified && (
          <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-3 text-center">
            <span className="block text-[9px] text-amber-400 font-black uppercase tracking-wider">Modified</span>
            <span className="block text-lg font-extrabold text-amber-300 mt-1">{csvDiffResult.modified.length}</span>
          </div>
        )}
        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-3 text-center">
          <span className="block text-[9px] text-zinc-400 font-black uppercase tracking-wider">Unchanged</span>
          <span className="block text-lg font-extrabold text-zinc-350 mt-1">{csvDiffResult.unchanged.length}</span>
        </div>
      </div>

      <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
        {showAdded && csvDiffResult.added.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Newly Added Streams ({csvDiffResult.added.length})
            </div>
            {csvDiffResult.added.map((item: any, idx: number) => (
              <div key={`add-${idx}`} className="bg-emerald-950/5 border border-emerald-900/30 rounded-2xl p-4 flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] bg-emerald-950/40 text-emerald-400 border border-emerald-900/60 font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                    + Added Stream
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 font-semibold">{shorten(item.recipient)}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Recipient</span>
                    <span className="block text-xs font-mono font-medium text-zinc-300 select-all truncate">{item.recipient}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Amount</span>
                    <span className="block text-xs font-bold text-emerald-400">{item.amount.toLocaleString()} Tokens</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Type</span>
                    <span className="block text-xs font-bold text-zinc-350">{formatType(item.type)}</span>
                  </div>
                  {!isMilestoneType(item.type) && (
                    <div>
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Duration</span>
                      <span className="block text-xs font-bold text-zinc-350">{item.duration}s</span>
                    </div>
                  )}
                  {isCliffType(item.type) && (
                    <div>
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Cliff Duration</span>
                      <span className="block text-xs font-bold text-zinc-350">{item.cliffDuration}s</span>
                    </div>
                  )}
                  {Number(item.type) === 2 && (
                    <div className="col-span-2">
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Milestones</span>
                      <span className="block text-xs font-bold text-indigo-400 truncate">{item.milestones || "4 Equal Milestones"}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showModified && csvDiffResult.modified.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Modified Streams ({csvDiffResult.modified.length})
            </div>
            {csvDiffResult.modified.map((item: any, idx: number) => (
              <div key={`mod-${idx}`} className="bg-amber-950/5 border border-amber-900/30 rounded-2xl p-4 flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] bg-amber-950/40 text-amber-400 border border-amber-900/60 font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                    ~ Modified Stream
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 font-bold">{shorten(item.id)}</span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Recipient: <span className="text-zinc-200 font-bold select-all">{item.recipient}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Current Type</span>
                    <span className="block text-xs font-bold text-zinc-300">{formatType(item.details?.type ?? item.type)}</span>
                  </div>
                  {!isMilestoneType(item.details?.type ?? item.type) && (
                    <div>
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Current Duration</span>
                      <span className="block text-xs font-bold text-zinc-300">{Number(item.details?.duration ?? item.duration ?? 0)}s</span>
                    </div>
                  )}
                  {isCliffType(item.details?.type ?? item.type) && (
                    <div>
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Current Cliff Duration</span>
                      <span className="block text-xs font-bold text-zinc-300">{Number(item.details?.cliffDuration ?? item.cliffDuration ?? 0)}s</span>
                    </div>
                  )}
                  {isMilestoneType(item.details?.type ?? item.type) && (
                    <div className="col-span-2 sm:col-span-1">
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Current Milestones</span>
                      <span className="block text-xs font-bold text-zinc-300 truncate">{item.details?.milestones || item.milestones || "None"}</span>
                    </div>
                  )}
                </div>
                <div className="grid gap-2 mt-2 border-t border-zinc-900/50 pt-2">
                  {item.changes.map((ch: any, cIdx: number) => (
                    <div key={cIdx} className="flex justify-between items-center text-xs">
                      <span className="text-[10px] text-zinc-500 uppercase font-black">{formatFieldName(ch.field)}</span>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="text-zinc-500 line-through">{formatFieldValue(ch.field, ch.oldVal)}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-amber-400 font-bold">{formatFieldValue(ch.field, ch.newVal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {csvDiffResult.unchanged.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              Unchanged Streams ({csvDiffResult.unchanged.length})
            </div>
            {csvDiffResult.unchanged.map((item: any, idx: number) => (
              <div key={`unch-${idx}`} className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2 opacity-85 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] bg-zinc-900 text-zinc-300 border border-zinc-800 font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                    = Unchanged Stream
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 font-semibold">{shorten(item.id)}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Recipient</span>
                    <span className="block text-xs font-mono font-medium text-zinc-300 select-all truncate">{item.recipient}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Amount</span>
                    <span className="block text-xs font-bold text-zinc-300">{item.amount.toLocaleString()} Tokens</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-zinc-500 font-black uppercase">Type</span>
                    <span className="block text-xs font-bold text-zinc-300">{formatType(item.type)}</span>
                  </div>
                  {!isMilestoneType(item.type) && (
                    <div>
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Duration</span>
                      <span className="block text-xs font-bold text-zinc-300">{item.duration}s</span>
                    </div>
                  )}
                  {isCliffType(item.type) && (
                    <div>
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Cliff Duration</span>
                      <span className="block text-xs font-bold text-zinc-300">{item.cliffDuration}s</span>
                    </div>
                  )}
                  {isMilestoneType(item.type) && (
                    <div className="col-span-2">
                      <span className="block text-[9px] text-zinc-500 font-black uppercase">Milestones</span>
                      <span className="block text-xs font-bold text-zinc-300 truncate">{item.milestones || "None"}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
});
