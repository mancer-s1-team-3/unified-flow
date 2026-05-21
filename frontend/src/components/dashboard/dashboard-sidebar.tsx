"use client";

import { memo } from "react";
import type { ReactNode } from "react";
import { ArrowDownRight, Clock, FileText, Layers, PlusCircle, Settings, Shield, Unlock, XCircle } from "lucide-react";
import type { TabId } from "./types";

const baseClass =
  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all";

function TabButton({
  active,
  onClick,
  icon,
  label,
  highlight,
  count,
  badge,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  highlight?: string;
  count?: number;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`${baseClass} ${compact ? "min-w-[132px] px-3 py-2.5" : "px-4 py-3"} ${count !== undefined ? "justify-between" : "justify-start"} ${
        active
          ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
          : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon}
        <span className={`text-xs truncate ${highlight || ""} ${compact ? "max-w-[7.5rem]" : ""}`}>{label}</span>
        {badge && (
          <span className="ml-2 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
            {badge}
          </span>
        )}
      </div>
      {typeof count === "number" && (
        <span className="ml-3 inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 shrink-0 tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

export const DashboardSidebar = memo(function DashboardSidebar({
  activeTab,
  setActiveTab,
  streamsCount,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  streamsCount: number;
}) {
  return (
    <>
      <nav className="md:hidden sticky top-0 z-20 -mx-4 mb-3 border-b border-zinc-900/90 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Quick Nav</div>
            <div className="text-xs font-semibold text-zinc-200">Switch sections without opening the drawer</div>
          </div>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[10px] font-mono text-zinc-400 tabular-nums">{streamsCount} streams</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <TabButton compact active={activeTab === "streams"} onClick={() => setActiveTab("streams")} icon={<Layers className="w-4 h-4" />} label="Streams" count={streamsCount} />
          <TabButton compact active={activeTab === "create_streams"} onClick={() => setActiveTab("create_streams")} icon={<PlusCircle className="w-4 h-4" />} label="Create" />
          <TabButton compact active={activeTab === "withdraw"} onClick={() => setActiveTab("withdraw")} icon={<ArrowDownRight className="w-4 h-4" />} label="Withdraw" />
          <TabButton compact active={activeTab === "cancel"} onClick={() => setActiveTab("cancel")} icon={<XCircle className="w-4 h-4" />} label="Cancel" />
          <TabButton compact active={activeTab === "unlock_milestone"} onClick={() => setActiveTab("unlock_milestone")} icon={<Unlock className="w-4 h-4" />} label="Unlock" />
          <TabButton compact active={activeTab === "edit_csv"} onClick={() => setActiveTab("edit_csv")} icon={<FileText className="w-4 h-4 text-emerald-400" />} label="Bulk CSV" highlight="font-bold text-emerald-400" badge="WIP" />
          <TabButton compact active={activeTab === "edit_milestone"} onClick={() => setActiveTab("edit_milestone")} icon={<Settings className="w-4 h-4" />} label="Milestone" badge="WIP" />
          <TabButton compact active={activeTab === "edit_linear"} onClick={() => setActiveTab("edit_linear")} icon={<Clock className="w-4 h-4" />} label="Linear" badge="WIP" />
          <TabButton compact active={activeTab === "edit_cliff"} onClick={() => setActiveTab("edit_cliff")} icon={<Shield className="w-4 h-4" />} label="Cliff" badge="WIP" />
        </div>
      </nav>

      <aside className="hidden md:flex w-full md:w-64 shrink-0 flex-col gap-2">
      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 mb-2">Vesting Operations</div>

      <TabButton
        active={activeTab === "streams"}
        onClick={() => setActiveTab("streams")}
        icon={<Layers className="w-4 h-4" />}
        label="Active Streams"
        count={streamsCount}
      />

      <TabButton
        active={activeTab === "create_streams"}
        onClick={() => setActiveTab("create_streams")}
        icon={<PlusCircle className="w-4 h-4" />}
        label="Create Stream"
      />

      <TabButton
        active={activeTab === "withdraw"}
        onClick={() => setActiveTab("withdraw")}
        icon={<ArrowDownRight className="w-4 h-4" />}
        label="Withdraw Claim"
      />

      <TabButton
        active={activeTab === "cancel"}
        onClick={() => setActiveTab("cancel")}
        icon={<XCircle className="w-4 h-4" />}
        label="Cancel Stream"
      />

      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 mt-6 mb-2">Structure Editors</div>

      <TabButton
        active={activeTab === "unlock_milestone"}
        onClick={() => setActiveTab("unlock_milestone")}
        icon={<Unlock className="w-4 h-4" />}
        label="Unlock Milestone"
      />

      <TabButton
        active={activeTab === "edit_csv"}
        onClick={() => setActiveTab("edit_csv")}
        icon={<FileText className="w-4 h-4 text-emerald-400" />}
        label="Bulk Edit CSV"
        highlight="font-bold text-emerald-400"
        badge="WIP"
      />

      <TabButton
        active={activeTab === "edit_milestone"}
        onClick={() => setActiveTab("edit_milestone")}
        icon={<Settings className="w-4 h-4" />}
        label="Edit Milestone Struct"
        badge="WIP"
      />

      <TabButton
        active={activeTab === "edit_linear"}
        onClick={() => setActiveTab("edit_linear")}
        icon={<Clock className="w-4 h-4" />}
        label="Edit Linear Timeline"
        badge="WIP"
      />

      <TabButton
        active={activeTab === "edit_cliff"}
        onClick={() => setActiveTab("edit_cliff")}
        icon={<Shield className="w-4 h-4" />}
        label="Edit Cliff Conditions"
        badge="WIP"
      />
      </aside>
    </>
  );
});
