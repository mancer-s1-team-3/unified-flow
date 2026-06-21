"use client";

import { memo, useEffect, useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Coins,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Info,
  PackagePlus,
  Sparkles,
  Unlock,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
  type NotificationEventType,
} from "@/lib/notification-context";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT_META: Record<
  NotificationEventType,
  { label: string; Icon: React.ElementType; color: string }
> = {
  stream_created: {
    label: "Stream Created",
    Icon: Sparkles,
    color: "text-emerald-400",
  },
  withdraw: { label: "Withdraw", Icon: Coins, color: "text-blue-400" },
  stream_cancelled: {
    label: "Stream Cancelled",
    Icon: XCircle,
    color: "text-red-400",
  },
  milestone_unlocked: {
    label: "Milestone Unlocked",
    Icon: Unlock,
    color: "text-amber-400",
  },
  csv_deployed: {
    label: "CSV Deployed",
    Icon: PackagePlus,
    color: "text-purple-400",
  },
  csv_edited: {
    label: "CSV Edited",
    Icon: FileSpreadsheet,
    color: "text-cyan-400",
  },
  stream_edited: {
    label: "Stream Edited",
    Icon: Wrench,
    color: "text-orange-400",
  },
  tokens_withdrawn: {
    label: "Tokens Withdrawn",
    Icon: Coins,
    color: "text-blue-400",
  },
  generic: { label: "Notification", Icon: Info, color: "text-indigo-400" },
};

const TYPE_COLORS = {
  success: {
    bg: "bg-emerald-950/70",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    progress: "bg-emerald-500",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
  },
  error: {
    bg: "bg-red-950/70",
    border: "border-red-500/30",
    text: "text-red-300",
    progress: "bg-red-500",
    icon: <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />,
  },
  info: {
    bg: "bg-indigo-950/70",
    border: "border-indigo-500/30",
    text: "text-indigo-300",
    progress: "bg-indigo-500",
    icon: <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />,
  },
};

// ─── Single Toast ─────────────────────────────────────────────────────────────

const SingleToast = memo(function SingleToast({
  notification,
  onDismiss,
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);

  const colors = TYPE_COLORS[notification.type];
  const isError = notification.type === "error";

  // Slide-in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Progress bar + auto-dismiss
  useEffect(() => {
    if (notification.duration === 0) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / notification.duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onDismiss(notification.id);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [notification.id, notification.duration, onDismiss]);

  return (
    <div
      style={{
        transform: visible ? "translateY(0) scale(1)" : "translateY(-12px) scale(0.97)",
        opacity: visible ? 1 : 0,
        transition: "transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 280ms ease",
      }}
      className={`relative flex flex-col rounded-2xl border backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden ${colors.bg} ${colors.border}`}
    >
      {/* Progress bar */}
      {notification.duration > 0 && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-zinc-800/60">
          <div
            className={`h-full transition-none ${colors.progress}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex items-start gap-3 px-4 pt-5 pb-3">
        {colors.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-extrabold ${colors.text} mb-0.5`}>
            {notification.title}
          </p>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            {notification.message}
          </p>

          {notification.explorerUrl && (
            <a
              href={notification.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View on Solscan <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {isError && notification.raw && (
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showRaw ? "Hide" : "Show"} details
              <ChevronDown className={`w-3 h-3 transition-transform ${showRaw ? "rotate-180" : ""}`} />
            </button>
          )}

          {showRaw && notification.raw && (
            <div className="mt-2 bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 max-h-28 overflow-y-auto">
              <p className="font-mono text-[9px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-all">
                {notification.raw}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => onDismiss(notification.id)}
          className="shrink-0 p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all -mt-0.5"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isError && !notification.raw && (
        <div className="flex items-center gap-1.5 px-4 pb-3">
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          <p className="text-[9px] text-zinc-500">
            If this persists, check your wallet balance and network connection.
          </p>
        </div>
      )}
    </div>
  );
});

// ─── Toast Stack ─────────────────────────────────────────────────────────────

const MAX_VISIBLE_TOASTS = 3;

export const NotificationToastStack = memo(function NotificationToastStack({
  className,
}: {
  className?: string;
}) {
  const { notifications, activeToastIds, dismissToast } = useNotifications();

  const activeToasts = activeToastIds
    .slice(0, MAX_VISIBLE_TOASTS)
    .map((id) => notifications.find((n) => n.id === id))
    .filter(Boolean) as AppNotification[];

  if (activeToasts.length === 0) return null;

  return (
    <div className={`fixed right-5 z-[80] w-full max-w-sm flex flex-col gap-2 pointer-events-none ${className ?? "top-5"}`}>
      {activeToasts.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <SingleToast notification={n} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
});

// ─── Legacy NotificationBanner (kept for backward compat) ────────────────────

export type NotificationPayload = {
  type: "success" | "error" | "info" | null;
  message: string;
  title?: string;
  detail?: string;
  raw?: string;
  explorerUrl?: string;
  duration?: number;
};

export const NotificationBanner = memo(function NotificationBanner({
  notification,
  onDismiss,
}: {
  notification: NotificationPayload;
  onDismiss?: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = notification.duration ?? (notification.type === "error" ? 9000 : 6000);

  useEffect(() => {
    if (!notification.type) {
      setShowRaw(false);
      setProgress(100);
      return;
    }
    setShowRaw(false);
    setProgress(100);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [notification, duration]);

  if (!notification.type) return null;

  const isError = notification.type === "error";
  const isSuccess = notification.type === "success";
  const title = notification.title ?? (isError ? "Transaction Failed" : isSuccess ? "Success" : "Info");
  const detail = notification.detail ?? notification.message;
  const colors = TYPE_COLORS[notification.type];

  return (
    <div className="fixed top-5 right-5 z-[80] w-full max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`relative flex flex-col rounded-2xl border backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden ${colors.bg} ${colors.border}`}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-zinc-800">
          <div className={`h-full transition-none ${colors.progress}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-start gap-3 px-4 pt-5 pb-3">
          {colors.icon}
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-extrabold ${colors.text} mb-0.5`}>{title}</p>
            <p className="text-[11px] text-zinc-300 leading-relaxed">{detail}</p>
            {notification.explorerUrl && (
              <a href={notification.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                View on Solscan <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {isError && notification.raw && (
              <button onClick={() => setShowRaw((v) => !v)} className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors">
                {showRaw ? "Hide" : "Show"} details
                <ChevronDown className={`w-3 h-3 transition-transform ${showRaw ? "rotate-180" : ""}`} />
              </button>
            )}
            {showRaw && notification.raw && (
              <div className="mt-2 bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 max-h-28 overflow-y-auto">
                <p className="font-mono text-[9px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-all">{notification.raw}</p>
              </div>
            )}
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="shrink-0 p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all -mt-0.5" aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {isError && !notification.raw && (
          <div className="flex items-center gap-1.5 px-4 pb-3">
            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
            <p className="text-[9px] text-zinc-500">If this persists, check your wallet balance and network connection.</p>
          </div>
        )}
      </div>
    </div>
  );
});
