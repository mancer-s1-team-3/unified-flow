"use client";

import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { formatDate, formatTokenAmount, getAmountUnitLabel, shorten } from "./utils";

export const StreamCard = memo(function StreamCard({
  stream,
  onOpen,
  currentTimeTs,
}: {
  stream: any;
  onOpen: (id: string) => void;
  currentTimeTs: number;
}) {
  const now = currentTimeTs;
  const start = Number(stream.startTs);
  const end = Number(stream.endTs);
  const cliff = Number(stream.cliffTs);
  const total = Number(stream.totalAmount);
  const withdrawn = Number(stream.withdrawn);
  const unlocked = Number(stream.unlockedAmount || 0);
  const mintDecimals = typeof stream.mintDecimals === "number" ? stream.mintDecimals : null;
  const amountLabel = getAmountUnitLabel(stream.mint);
  const isCancelled = Number(stream.status) === 3 || Boolean(stream.cancelled);

  let vested = 0;
  let progress = 0;

  if (stream.vestingType === 2) {
    vested = unlocked;
    progress = Math.min((unlocked / total) * 100, 100);
  } else if (stream.vestingType === 1) {
    if (now < cliff) {
      vested = 0;
      progress = 0;
    } else {
      const duration = end - start || 1;
      const elapsed = Math.min(Math.max(now - start, 0), duration);
      vested = Math.floor((total * elapsed) / duration);
      progress = Math.min((elapsed / duration) * 100, 100);
    }
  } else {
    const duration = end - start || 1;
    const elapsed = Math.min(Math.max(now - start, 0), duration);
    vested = Math.floor((total * elapsed) / duration);
    progress = Math.min((elapsed / duration) * 100, 100);
  }

  if (isCancelled) {
    progress = total > 0 ? Math.min((withdrawn / total) * 100, 100) : 0;
  }

  const claimable = isCancelled ? 0 : Math.max(vested - withdrawn, 0);
  const isMilestoneCompleted = stream.vestingType === 2 && (Number(stream.completedAt || 0) > 0 || unlocked >= total);
  const isCompleted = !isCancelled && (stream.vestingType === 2 ? isMilestoneCompleted : withdrawn >= total);
  const isNotStarted = now < start;
  const isEnded = !isCancelled && (stream.vestingType === 2 ? isMilestoneCompleted : now >= end);
  const isCliffLocked = stream.vestingType === 1 && now < cliff;
  const isMilestone = stream.vestingType === 2;
  const unlockedCount = isMilestone ? Math.round((Number(stream.unlockedAmount || 0) / Number(stream.totalAmount)) * stream.milestoneCount) : 0;

  return (
    <div
      key={stream.id}
      onClick={() => onOpen(stream.id)}
      className="bg-zinc-950/65 border border-zinc-900 hover:border-indigo-500/50 hover:bg-zinc-950/90 rounded-2xl p-4 sm:p-5 transition-all shadow-md group relative overflow-hidden cursor-pointer"
    >
      <div className="hidden sm:block absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Stream PDA</span>
          <div className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded font-mono text-[10px] border border-zinc-850">
            <span>{shorten(stream.id)}</span>
          </div>
          {stream.isCsvCreated && (
            <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">CSV Created</span>
          )}
        </div>

        <span
          className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest ${
            isCancelled
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/25"
            : isCompleted
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
              : isEnded
              ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25"
              : isNotStarted
              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25"
              : isCliffLocked
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
              : isMilestone
              ? "bg-purple-500/10 text-purple-400 border border-purple-500/25"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
          }`}
        >
          {isCancelled ? "Cancelled" : isCompleted ? "Completed" : isEnded ? "Ended" : isNotStarted ? "Scheduled" : isCliffLocked ? "Cliff Lock" : isMilestone ? `Milestone Index ${unlockedCount}` : "Streaming"}
        </span>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center text-xs mb-1.5">
          <span className="font-semibold text-zinc-400">Vesting Completion</span>
          <span className="font-mono text-zinc-200 font-bold">{progress.toFixed(2)}%</span>
        </div>
        <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/40">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-zinc-900/35 border border-zinc-900/60 rounded-xl p-3.5 text-xs">
        <div>
          <div className="text-zinc-500 font-medium">Total Amount</div>
          <div className="font-bold text-zinc-200">{formatTokenAmount(stream.totalAmount, mintDecimals)} {amountLabel}</div>
        </div>
        <div>
          <div className="text-zinc-500 font-medium">Claimable</div>
          <div className="font-bold text-indigo-400">{formatTokenAmount(claimable, mintDecimals)} {amountLabel}</div>
        </div>
        <div>
          <div className="text-zinc-500 font-medium">Withdrawn</div>
          <div className="font-bold text-zinc-200">{formatTokenAmount(withdrawn, mintDecimals)} {amountLabel}</div>
        </div>
        <div>
          <div className="text-zinc-500 font-medium">Type</div>
          <div className="font-semibold text-zinc-300 uppercase tracking-wider text-[10px]">{stream.vestingType === 0 ? "Linear" : stream.vestingType === 1 ? "Cliff" : "Milestone"}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-zinc-900/50 pt-2 text-[10px] text-zinc-500 font-mono">
        <div className="flex justify-between items-center gap-2">
          <span>Start: {formatDate(stream.startTs)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(stream.id);
            }}
            className="text-indigo-400 flex items-center gap-0.5 font-bold group-hover:translate-x-0.5 transition-transform hover:text-indigo-300"
          >
            View Detailed Timeline <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {stream.vestingType === 1 && (
          <div className="flex justify-between items-center gap-2 text-amber-500 font-bold mt-0.5">
            <span>Cliff Unlock: {formatDate(stream.cliffTs)}</span>
            <span>({Number(stream.cliffTs) - Number(stream.startTs)}s duration)</span>
          </div>
        )}
      </div>
    </div>
  );
});
