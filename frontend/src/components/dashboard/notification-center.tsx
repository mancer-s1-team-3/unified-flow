"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Coins,
  Edit3,
  FileSpreadsheet,
  Info,
  PackagePlus,
  Sparkles,
  Trash2,
  Unlock,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
  type NotificationEventType,
  type NotificationType,
} from "@/lib/notification-context";

// ─── Metadata ────────────────────────────────────────────────────────────────

const EVENT_META: Record<
  NotificationEventType,
  { label: string; Icon: React.ElementType; color: string }
> = {
  stream_created: { label: "Stream Created", Icon: Sparkles, color: "text-emerald-400" },
  withdraw: { label: "Withdraw", Icon: Coins, color: "text-blue-400" },
  stream_cancelled: { label: "Cancelled", Icon: XCircle, color: "text-red-400" },
  milestone_unlocked: { label: "Milestone", Icon: Unlock, color: "text-amber-400" },
  csv_deployed: { label: "CSV Deployed", Icon: PackagePlus, color: "text-purple-400" },
  csv_edited: { label: "CSV Edited", Icon: FileSpreadsheet, color: "text-cyan-400" },
  stream_edited: { label: "Stream Edited", Icon: Wrench, color: "text-orange-400" },
  tokens_withdrawn: { label: "Tokens Withdrawn", Icon: Coins, color: "text-blue-400" },
  generic: { label: "Notification", Icon: Info, color: "text-indigo-400" },
};

const TYPE_ICON: Record<NotificationType, React.ElementType> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TYPE_COLOR: Record<NotificationType, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-indigo-400",
};

const TYPE_BG: Record<NotificationType, string> = {
  success: "bg-emerald-500/10 border-emerald-500/20",
  error: "bg-red-500/10 border-red-500/20",
  info: "bg-indigo-500/10 border-indigo-500/20",
};

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterTab = "all" | "unread" | "success" | "error";

// ─── Notification Item ───────────────────────────────────────────────────────

const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkRead,
  onRemove,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const meta = EVENT_META[notification.event];
  const EventIcon = meta.Icon;

  return (
    <div
      className={`group relative flex gap-3 p-3 rounded-xl border transition-all ${
        notification.read
          ? "bg-zinc-900/40 border-zinc-800/50"
          : "bg-zinc-800/50 border-zinc-700/60"
      }`}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute top-3 right-8 w-1.5 h-1.5 rounded-full bg-indigo-400" />
      )}

      {/* Event icon */}
      <div
        className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border ${TYPE_BG[notification.type]}`}
      >
        <EventIcon className={`w-4 h-4 ${meta.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}
          >
            {meta.label}
          </span>
          <span className="text-[9px] text-zinc-600">
            {relativeTime(notification.timestamp)}
          </span>
        </div>
        <p
          className={`text-xs font-semibold leading-snug ${
            notification.type === "error" ? "text-red-300" : "text-zinc-200"
          }`}
        >
          {notification.title}
        </p>
        <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5 line-clamp-2">
          {notification.message}
        </p>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(notification.id);
        }}
        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/60 transition-all"
        aria-label="Remove notification"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
});

// ─── Notification Center ──────────────────────────────────────────────────────

export const NotificationCenter = memo(function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [, setTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Re-render every 30s to update relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Mark all read when opening panel
  const handleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v) markAllRead();
      return !v;
    });
  }, [markAllRead]);

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "success") return n.type === "success";
    if (filter === "error") return n.type === "error";
    return true;
  });

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "success", label: "Success" },
    { id: "error", label: "Errors" },
  ];

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        id="notification-center-btn"
        onClick={handleOpen}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all ${
          open
            ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
            : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
        }`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[9px] font-extrabold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <div
        ref={panelRef}
        style={{
          transform: open ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "transform 220ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease",
          transformOrigin: "top right",
        }}
        className="fixed sm:absolute top-[72px] sm:top-12 left-4 right-4 sm:left-auto sm:right-0 sm:w-[380px] max-h-[70vh] sm:max-h-[560px] flex flex-col rounded-2xl border border-zinc-700/70 bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/60 z-[90] overflow-hidden"
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-zinc-100">Notifications</span>
            {notifications.length > 0 && (
              <span className="text-[10px] text-zinc-500 font-semibold">
                ({notifications.length})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-zinc-500 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition-all font-semibold"
                aria-label="Clear all notifications"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all"
              aria-label="Close notification panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-zinc-800/60">
          {filterTabs.map((tab) => {
            const count =
              tab.id === "all"
                ? notifications.length
                : tab.id === "unread"
                ? notifications.filter((n) => !n.read).length
                : tab.id === "success"
                ? notifications.filter((n) => n.type === "success").length
                : notifications.filter((n) => n.type === "error").length;

            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${
                  filter === tab.id
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-zinc-700"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={`text-[9px] font-extrabold ${
                      filter === tab.id ? "text-indigo-400" : "text-zinc-600"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1.5 min-h-[80px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
                <Bell className="w-5 h-5 text-zinc-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">No notifications</p>
                <p className="text-[10px] text-zinc-700 mt-0.5">
                  {filter === "all"
                    ? "Actions you take will appear here"
                    : `No ${filter} notifications yet`}
                </p>
              </div>
            </div>
          ) : (
            filtered.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onMarkRead={markRead}
                onRemove={removeNotification}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">
              {notifications.length} total · {notifications.filter((n) => !n.read).length} unread
            </span>
            <button
              onClick={markAllRead}
              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Mark all read
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
