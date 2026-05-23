"use client";

import { memo, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Info, X } from "lucide-react";

export type NotificationPayload = {
  type: "success" | "error" | "info" | null;
  message: string;
  // Optional enriched fields
  title?: string;
  detail?: string;
  raw?: string;
  explorerUrl?: string;
  /** Duration in ms before auto-dismiss. Default 6000. */
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

  // Use structured title/detail if provided, fall back to plain message
  const title = notification.title ?? (isError ? "Transaction Failed" : isSuccess ? "Success" : "Info");
  const detail = notification.detail ?? notification.message;
  const hasExtra = isError && (notification.raw || notification.explorerUrl);

  const colorMap = {
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

  const colors = colorMap[notification.type];

  return (
    <div className="fixed top-5 right-5 z-[80] w-full max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`relative flex flex-col rounded-2xl border backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden ${colors.bg} ${colors.border}`}>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-zinc-800">
          <div
            className={`h-full transition-none ${colors.progress}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Main content */}
        <div className="flex items-start gap-3 px-4 pt-5 pb-3">
          {colors.icon}

          <div className="flex-1 min-w-0">
            <p className={`text-xs font-extrabold ${colors.text} mb-0.5`}>{title}</p>
            <p className="text-[11px] text-zinc-300 leading-relaxed">{detail}</p>

            {/* Explorer link */}
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

            {/* Raw error toggle */}
            {isError && notification.raw && (
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showRaw ? "Hide" : "Show"} details
                <ChevronDown className={`w-3 h-3 transition-transform ${showRaw ? "rotate-180" : ""}`} />
              </button>
            )}

            {/* Raw error expanded */}
            {showRaw && notification.raw && (
              <div className="mt-2 bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 max-h-28 overflow-y-auto">
                <p className="font-mono text-[9px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-all">
                  {notification.raw}
                </p>
              </div>
            )}
          </div>

          {/* Dismiss */}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="shrink-0 p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all -mt-0.5"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Warning extra hint for errors */}
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
