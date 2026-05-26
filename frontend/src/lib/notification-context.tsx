"use client";

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationEventType =
  | "stream_created"
  | "withdraw"
  | "stream_cancelled"
  | "milestone_unlocked"
  | "csv_deployed"
  | "csv_edited"
  | "stream_edited"
  | "generic";

export type NotificationType = "success" | "error" | "info";

export interface AppNotification {
  id: string;
  type: NotificationType;
  event: NotificationEventType;
  title: string;
  message: string;
  timestamp: number; // unix ms
  read: boolean;
  /** Auto-dismiss duration in ms. 0 = never auto-dismiss */
  duration: number;
  explorerUrl?: string;
  raw?: string;
}

export interface AddNotificationInput {
  type: NotificationType;
  message: string;
  event?: NotificationEventType;
  title?: string;
  explorerUrl?: string;
  raw?: string;
  /** Override auto-dismiss duration. Default: error=9000, success/info=6000 */
  duration?: number;
}

// ─── State & Reducer ──────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

interface State {
  notifications: AppNotification[];
  /** IDs currently visible as toasts (not yet auto-dismissed) */
  activeToastIds: string[];
}

type Action =
  | { type: "ADD"; notification: AppNotification }
  | { type: "DISMISS_TOAST"; id: string }
  | { type: "DISMISS_ALL_TOASTS" }
  | { type: "MARK_READ"; id: string }
  | { type: "MARK_ALL_READ" }
  | { type: "REMOVE"; id: string }
  | { type: "CLEAR_ALL" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD": {
      const notifications = [
        action.notification,
        ...state.notifications,
      ].slice(0, MAX_HISTORY);
      return {
        notifications,
        activeToastIds: [action.notification.id, ...state.activeToastIds],
      };
    }
    case "DISMISS_TOAST":
      return {
        ...state,
        activeToastIds: state.activeToastIds.filter((id) => id !== action.id),
      };
    case "DISMISS_ALL_TOASTS":
      return { ...state, activeToastIds: [] };
    case "MARK_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, read: true } : n
        ),
      };
    case "MARK_ALL_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };
    case "REMOVE":
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
        activeToastIds: state.activeToastIds.filter((id) => id !== action.id),
      };
    case "CLEAR_ALL":
      return { notifications: [], activeToastIds: [] };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface NotificationContextValue {
  notifications: AppNotification[];
  activeToastIds: string[];
  unreadCount: number;
  addNotification: (input: AddNotificationInput) => void;
  dismissToast: (id: string) => void;
  dismissAllToasts: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    notifications: [],
    activeToastIds: [],
  });

  const addNotification = useCallback((input: AddNotificationInput) => {
    const defaultDuration =
      input.duration !== undefined
        ? input.duration
        : input.type === "error"
        ? 9000
        : 6000;

    const notification: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: input.type,
      event: input.event ?? "generic",
      title:
        input.title ??
        (input.type === "error"
          ? "Error"
          : input.type === "success"
          ? "Success"
          : "Info"),
      message: input.message,
      timestamp: Date.now(),
      read: false,
      duration: defaultDuration,
      explorerUrl: input.explorerUrl,
      raw: input.raw,
    };
    dispatch({ type: "ADD", notification });
  }, []);

  const dismissToast = useCallback((id: string) => {
    dispatch({ type: "DISMISS_TOAST", id });
    // mark as read when dismissed from toast
    dispatch({ type: "MARK_READ", id });
  }, []);

  const dismissAllToasts = useCallback(() => {
    dispatch({ type: "DISMISS_ALL_TOASTS" });
    dispatch({ type: "MARK_ALL_READ" });
  }, []);

  const markRead = useCallback((id: string) => {
    dispatch({ type: "MARK_READ", id });
  }, []);

  const markAllRead = useCallback(() => {
    dispatch({ type: "MARK_ALL_READ" });
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications: state.notifications,
        activeToastIds: state.activeToastIds,
        unreadCount,
        addNotification,
        dismissToast,
        dismissAllToasts,
        markRead,
        markAllRead,
        removeNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
