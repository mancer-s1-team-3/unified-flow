"use client";

import { memo, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { ArrowDownRight, Clock, FileText, Layers, MoreHorizontal, PlusCircle, Settings, Shield, Unlock, X, XCircle } from "lucide-react";
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

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────

const PRIMARY_TABS: Array<{ value: TabId; label: string; icon: ReactNode }> = [
  { value: "streams",        label: "Streams",  icon: <Layers className="w-5 h-5" /> },
  { value: "create_streams", label: "Create",   icon: <PlusCircle className="w-5 h-5" /> },
  { value: "withdraw",       label: "Withdraw", icon: <ArrowDownRight className="w-5 h-5" /> },
  { value: "cancel",         label: "Cancel",   icon: <XCircle className="w-5 h-5" /> },
];

const MORE_TABS: Array<{ value: TabId; label: string; icon: ReactNode; highlight?: string }> = [
  { value: "unlock_milestone", label: "Unlock Milestone",      icon: <Unlock className="w-4 h-4" /> },
  { value: "edit_csv",         label: "Bulk Edit CSV",         icon: <FileText className="w-4 h-4 text-emerald-400" />, highlight: "font-bold text-emerald-400" },
  { value: "edit_milestone",   label: "Edit Milestone Struct", icon: <Settings className="w-4 h-4" /> },
  { value: "edit_linear",      label: "Edit Linear Timeline",  icon: <Clock className="w-4 h-4" /> },
  { value: "edit_cliff",       label: "Edit Cliff Conditions", icon: <Shield className="w-4 h-4" /> },
];

export function MobileBottomNav({
  activeTab,
  onSelect,
  streamsCount,
}: {
  activeTab?: TabId;
  onSelect: (tab: TabId) => void;
  streamsCount?: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMoreActive = MORE_TABS.some((t) => t.value === activeTab);

  // close sheet on outside scroll
  useEffect(() => {
    if (!sheetOpen) return;
    const close = () => setSheetOpen(false);
    document.addEventListener("scroll", close, { passive: true });
    return () => document.removeEventListener("scroll", close);
  }, [sheetOpen]);

  const handleSelect = (tab: TabId) => {
    onSelect(tab);
    setSheetOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-sm"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed left-0 right-0 bottom-[64px] z-[46] mx-3 rounded-2xl border border-zinc-800 bg-zinc-950/98 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          sheetOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">More Actions</div>
          <button
            onClick={() => setSheetOpen(false)}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-2">
          {MORE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleSelect(tab.value)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                activeTab === tab.value
                  ? "border-indigo-500/30 bg-indigo-600/10 text-indigo-300 font-bold"
                  : "border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {tab.icon}
              <span className={`text-xs ${tab.highlight || ""}`}>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[47] border-t border-zinc-800 bg-zinc-950 pb-safe">
        <div className="flex items-stretch h-16">
          {PRIMARY_TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            const showCount = tab.value === "streams";
            return (
              <button
                key={tab.value}
                onClick={() => { setSheetOpen(false); handleSelect(tab.value); }}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <div className="relative">
                  {tab.icon}
                  {showCount && streamsCount != null && streamsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[9px] font-extrabold flex items-center justify-center leading-none">
                      {streamsCount > 99 ? "99+" : streamsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold">{tab.label}</span>
                {isActive && <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-indigo-400" />}
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setSheetOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
              isMoreActive || sheetOpen ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-semibold">More</span>
            {(isMoreActive || sheetOpen) && <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-indigo-400" />}
          </button>
        </div>
      </nav>
    </>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

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
      {/* Mobile bottom nav */}
      <div className="md:hidden">
        <MobileBottomNav activeTab={activeTab} onSelect={setActiveTab} streamsCount={streamsCount} />
      </div>

      {/* Desktop sidebar */}
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
        />

        <TabButton
          active={activeTab === "edit_milestone"}
          onClick={() => setActiveTab("edit_milestone")}
          icon={<Settings className="w-4 h-4" />}
          label="Edit Milestone Struct"
        />

        <TabButton
          active={activeTab === "edit_linear"}
          onClick={() => setActiveTab("edit_linear")}
          icon={<Clock className="w-4 h-4" />}
          label="Edit Linear Timeline"
        />

        <TabButton
          active={activeTab === "edit_cliff"}
          onClick={() => setActiveTab("edit_cliff")}
          icon={<Shield className="w-4 h-4" />}
          label="Edit Cliff Conditions"
        />
      </aside>
    </>
  );
});
