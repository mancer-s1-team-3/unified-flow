"use client";

import { memo } from "react";
import { AlertCircle, CheckCircle2, Shield } from "lucide-react";

export const NotificationBanner = memo(function NotificationBanner({
  notification,
}: {
  notification: {
    type: "success" | "error" | "info" | null;
    message: string;
  };
}) {
  if (!notification.type) return null;

  return (
    <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div
        className={`flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-lg shadow-xl ${
          notification.type === "success"
            ? "bg-emerald-950/45 border-emerald-500/30 text-emerald-300"
            : notification.type === "error"
            ? "bg-red-950/45 border-red-500/30 text-red-300"
            : "bg-indigo-950/45 border-indigo-500/30 text-indigo-300"
        }`}
      >
        {notification.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
        {notification.type === "error" && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
        {notification.type === "info" && <Shield className="w-5 h-5 text-indigo-400 shrink-0" />}
        <span className="text-xs font-semibold">{notification.message}</span>
      </div>
    </div>
  );
});
