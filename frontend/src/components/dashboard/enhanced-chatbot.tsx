"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  ChevronDown,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  User,
  X,
  AlertCircle,
  CheckCircle,
  Rocket,
} from "lucide-react";
import { getASIOneChatService, type ChatContext, type ChatMessage } from "@/lib/asione-chat";
import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useClusterState, useWalletConnection } from "@solana/react-hooks";
import { useUnifiedFlowClient } from "@/lib/useUnifiedFlowClient";
import { resolveMintInput } from "@/components/dashboard/token-mints";
import { createStreamOnChain } from "@/lib/solana/create-stream";
import type { WalletSession } from "@solana/client";
import { useNetwork } from "@/components/wallet/network-context";
import { getStream } from "@/lib/api";

// ─── Enhanced Suggestions ────────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [
  "How do I create a stream?",
  "What's the difference between vesting types?",
  "How do I cancel a stream?",
  "Can I bulk-create streams?",
];

// Cap chat input length so a runaway paste can't bloat the request/UI.
const MAX_MESSAGE_LENGTH = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCall?: {
    name: string;
    arguments: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Escape HTML so untrusted AI text can't inject markup through the markdown
// renderer's dangerouslySetInnerHTML. Markdown tokens (* ` etc.) survive this
// and are turned into safe, fixed-class tags afterwards.
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Collision-resistant message id (Date.now() alone collides on fast sends).
function newId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}

// Convert a human-readable token amount ("12.5") to base units for `decimals`.
// Mirrors the dashboard helper; returns 0n for anything non-numeric.
function parseTokenAmountToBaseUnits(value: string, decimals: number): bigint {
  const trimmed = String(value ?? "").trim().replace(/,/g, ".");
  if (trimmed === "" || !/^\d+(\.\d+)?$/.test(trimmed)) return BigInt(0);
  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedFraction = fractionPart.slice(0, decimals).padEnd(decimals, "0");
  const raw = `${wholePart}${normalizedFraction}`.replace(/^0+(?=\d)/, "");
  try { return BigInt(raw || "0"); } catch { return BigInt(0); }
}

// ── Per-field tool-arg validators (friendly errors instead of raw throws) ──
function toPublicKey(value: unknown, label: string): PublicKey {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${label} address.`);
  }
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`Invalid ${label} address: "${value}".`);
  }
}

function toUnixSeconds(value: unknown, label: string): BN {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${label} (expected a whole Unix timestamp in seconds).`);
  }
  return new BN(n);
}

// Whole, non-negative number of seconds — a relative span to add, not an
// absolute time. The model supplies durations (which it computes reliably);
// the app derives any absolute timestamp itself.
function toDurationSeconds(value: unknown, label: string): BN {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${label} (expected a whole number of seconds).`);
  }
  return new BN(n);
}

function toIndex(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${label} (expected a 0-based index).`);
  }
  return n;
}

// Token amount → base-unit BN. `allowZero` for top-ups that may be 0.
function toBaseUnitsBN(amount: unknown, decimals: number, label: string, allowZero = false): BN {
  const str =
    typeof amount === "number"
      ? (Number.isFinite(amount) ? String(amount) : "")
      : String(amount ?? "");
  const base = parseTokenAmountToBaseUnits(str, decimals);
  if (base < BigInt(0) || (!allowZero && base <= BigInt(0))) {
    throw new Error(`Invalid ${label} amount: "${amount}".`);
  }
  return new BN(base.toString());
}

// ─── Markdown Renderer ───────────────────────────────────────────────────────
function renderMarkdown(text: string) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-zinc-200">$1</em>');
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-zinc-950 border border-zinc-800 rounded-lg p-2 my-2 overflow-x-auto text-[10px] font-mono text-zinc-200"><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] font-mono text-indigo-200">$1</code>');
  html = html.replace(/\n/g, "<br />");
  return <span className="text-zinc-100" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function EnhancedChatbot() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestions] = useState(DEFAULT_SUGGESTIONS);
  const [usingASI, setUsingASI] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatService = getASIOneChatService();

  // ✅ Hook dipanggil di top-level component, bukan di dalam fungsi
  const client = useUnifiedFlowClient();
  const { endpoint } = useClusterState();
  const { wallet } = useWalletConnection();
  const { cluster } = useNetwork();

  const walletAddress = wallet?.account?.address ? String(wallet.account.address) : undefined;
  const connection = useMemo(() => new Connection(endpoint, "confirmed"), [endpoint]);

  // Read an SPL mint's on-chain decimals so LLM-supplied token amounts can be
  // converted to base units before they hit the program.
  const fetchMintDecimals = async (mint: PublicKey): Promise<number> => {
    const info = await connection.getParsedAccountInfo(mint, "confirmed");
    const parsed = info.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
    const decimals = parsed?.parsed?.info?.decimals;
    if (typeof decimals !== "number") {
      throw new Error("Unable to read mint decimals. Make sure the mint address is a valid SPL token.");
    }
    return decimals;
  };

  // Check API connection on mount (resolved server-side via the backend proxy)
  useEffect(() => {
    let cancelled = false;

    chatService.checkStatus().then((isConfigured) => {
      if (cancelled) return;
      setConnectionStatus(isConfigured ? "connected" : "disconnected");
      setUsingASI(isConfigured);

      if (messages.length === 0) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            text: isConfigured
              ? "👋 Hi! I'm your AI assistant powered by Unified Flow. I can help you with token vesting, stream management, and more. What would you like to know?"
              : "👋 Hi! I'm your assistant. I can help you with token vesting, stream management, and more. What would you like to know?",
            timestamp: Date.now(),
          },
        ]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  // ─── Build chat context ───────────────────────────────────────────────────
  const buildChatContext = (): ChatContext => {
    const conversationHistory: ChatMessage[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.text,
      timestamp: msg.timestamp,
    }));
    return {
      conversationHistory,
      userProfile: {
        cluster,
        ...(walletAddress ? { walletAddress } : {}),
      },
    };
  };
// Ganti fungsi executeTool dan tambah handler di button onClick

const executeToolWithFeedback = async (toolName: string, args: string) => {
  // Tambah "executing" message
  const executingId = newId("tool");
  setMessages((prev) => [
    ...prev,
    {
      id: executingId,
      role: "assistant",
      text: "⏳ Executing transaction...",
      timestamp: Date.now(),
      isStreaming: true,
    },
  ]);

  const result = await executeTool(toolName, args);

  // Update message dengan hasil
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === executingId
        ? {
            ...msg,
            text: result.success
              ? `✅ ${result.message}`
              : `❌ ${result.message}`,
            isStreaming: false,
          }
        : msg
    )
  );
};
  // Resolve a stream's mint + decimals (edit actions need both: the mint as an
  // explicit SDK arg, the decimals to convert human amounts to base units).
  const fetchStreamMintInfo = async (
    streamPda: string
  ): Promise<{ mint: PublicKey; decimals: number; endTs: BN }> => {
    const stream = await getStream(streamPda);
    if (!stream || !stream.mint) throw new Error("Stream not found.");
    const mint = new PublicKey(stream.mint);
    const decimals =
      typeof stream.mintDecimals === "number"
        ? stream.mintDecimals
        : await fetchMintDecimals(mint);
    const endTs = new BN(String(stream.endTs ?? "0"));
    return { mint, decimals, endTs };
  };

  // ─── Execute tool call ────────────────────────────────────────────────────
  const executeTool = async (toolName: string, args: string) => {
    if (!client) {
      return { success: false, message: "Wallet not connected. Please connect your wallet first." };
    }

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(args);
    } catch {
      return { success: false, message: "The assistant returned malformed action data. Please try again." };
    }

    try {
      console.log(`Executing tool: ${toolName}`, parsedArgs);

      switch (toolName) {
        case "create_stream": {
          const {
            recipient,
            mint,
            amount,
            start_ts,
            cliff_ts,
            end_ts,
            vesting_type = 0,
            milestones = [],
          } = parsedArgs;

          const vestingType = Number(vesting_type);
          if (![0, 1, 2].includes(vestingType)) {
            return { success: false, message: "Invalid vesting type (expected 0=linear, 1=cliff, 2=milestone)." };
          }

          // Validate recipient up front; resolve the mint to the active cluster's
          // real address (handles "USDC"/symbols and mainnet-vs-devnet addresses).
          const recipientStr = String(recipient ?? "").trim();
          toPublicKey(recipientStr, "recipient");
          const resolvedMint = resolveMintInput(String(mint ?? ""), endpoint);

          // The model hands absolute timestamps; we trust only the relative span
          // (end - start) and start "now". Route through the dashboard's proven
          // createStreamOnChain so we reuse browser-safe PDA derivation, balance
          // checks, wSOL auto-wrap and ATA handling — none of which the SDK's
          // createStream does (that path kept failing: swapped accounts, the
          // writeBigUInt64LE nonce bug, missing-ATA, etc.).
          const startNum = toUnixSeconds(start_ts, "start time").toNumber();
          const endNum = toUnixSeconds(end_ts, "end time").toNumber();
          const durationSecs = endNum - startNum;
          if (durationSecs <= 0) {
            return { success: false, message: "End time must be after start time." };
          }
          const cliffNum = cliff_ts != null ? toUnixSeconds(cliff_ts, "cliff time").toNumber() : 0;
          const cliffDuration = vestingType === 1 ? Math.max(cliffNum - startNum, 0) : 0;

          if (vestingType === 2 && (!Array.isArray(milestones) || milestones.length === 0)) {
            return { success: false, message: "Milestone vesting requires a non-empty milestones array." };
          }
          const milestoneAmounts =
            vestingType === 2 && Array.isArray(milestones)
              ? (milestones as unknown[]).map((m) => {
                  const amt = m && typeof m === "object" ? (m as Record<string, unknown>).amount : m;
                  return String(amt ?? "0");
                })
              : [];

          const result = await createStreamOnChain({
            wallet: wallet as unknown as WalletSession,
            endpoint,
            input: {
              recipient: recipientStr,
              amount: String(amount ?? ""),
              mint: resolvedMint,
              type: String(vestingType),
              startDate: "", // start ~now; avoids drift from the model's clock
              duration: String(durationSecs),
              cliffDuration: String(cliffDuration),
              milestoneCount: String(milestoneAmounts.length),
              milestoneAmounts,
            },
          });
          return { success: true, message: `Stream created! Tx: ${result.signature}` };
        }

        case "withdraw_stream": {
          const { stream_pda } = parsedArgs;
          const result = await client.withdraw(toPublicKey(stream_pda, "stream"));
          return { success: true, message: `Withdrawal successful! Tx: ${result.signature}` };
        }

        case "cancel_stream": {
          const { stream_pda } = parsedArgs;
          const result = await client.cancel(toPublicKey(stream_pda, "stream"));
          return { success: true, message: `Stream cancelled! Tx: ${result.signature}` };
        }

        case "unlock_milestone": {
          const { stream_pda, milestone_index } = parsedArgs;
          const index = toIndex(milestone_index, "milestone index");
          const result = await client.unlockMilestone(toPublicKey(stream_pda, "stream"), index);
          return { success: true, message: `Milestone ${index} unlocked! Tx: ${result.signature}` };
        }

        case "edit_milestone": {
          const { stream_pda, milestone_index, new_amount } = parsedArgs;
          const streamPk = toPublicKey(stream_pda, "stream");
          const index = toIndex(milestone_index, "milestone index");
          const { decimals } = await fetchStreamMintInfo(String(stream_pda).trim());
          const result = await client.editMilestone(
            streamPk,
            index,
            toBaseUnitsBN(new_amount, decimals, "milestone")
          );
          return { success: true, message: `Milestone ${index} updated! Tx: ${result.signature}` };
        }

        case "edit_cliff": {
          const { stream_pda, new_cliff_ts } = parsedArgs;
          const result = await client.editCliff(
            toPublicKey(stream_pda, "stream"),
            toUnixSeconds(new_cliff_ts, "cliff time")
          );
          return { success: true, message: `Cliff updated! Tx: ${result.signature}` };
        }

        case "edit_linear": {
          const { stream_pda, extend_seconds, topup_amount } = parsedArgs;
          const streamPk = toPublicKey(stream_pda, "stream");
          const { decimals, endTs } = await fetchStreamMintInfo(String(stream_pda).trim());

          // The model supplies a RELATIVE extension (seconds to add). We read the
          // stream's current end and compute the absolute new end ourselves — the
          // model can't reliably know "now" or the stream's end, so it must never
          // hand us an absolute timestamp (that silently no-ops on-chain when the
          // value isn't strictly later than the current end).
          const extendBn = toDurationSeconds(extend_seconds, "extension duration");
          const topupBn = toBaseUnitsBN(topup_amount, decimals, "top-up", true);

          if (extendBn.lten(0) && topupBn.lten(0)) {
            return {
              success: false,
              message: "Nothing to update: provide a positive extension duration, a top-up amount, or both.",
            };
          }

          const newEndBn = endTs.add(extendBn);
          const result = await client.editLinear(streamPk, newEndBn, topupBn);
          const extendedNote = extendBn.gtn(0) ? ` Extended by ${extendBn.toString()}s.` : "";
          return { success: true, message: `Stream updated!${extendedNote} Tx: ${result.signature}` };
        }

        default:
          return { success: false, message: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      console.error("Tool execution error:", error);
      return {
        success: false,
        message: "Transaction failed: " + (error instanceof Error ? error.message : "Unknown error"),
      };
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async (rawText: string) => {
    const text = rawText.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || loading) return;

    const userMessage: Message = {
      id: newId("user"),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    const assistantMessageId = newId("assistant");
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant", text: "", timestamp: Date.now(), isStreaming: true },
    ]);

    try {
      const context = buildChatContext();

      for await (const chunk of chatService.generateStreamingResponse(text, context)) {
        if (chunk.error) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, text: chunk.content, isStreaming: false, timestamp: Date.now() }
                : msg
            )
          );
          break;
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  text: chunk.content,
                  isStreaming: !chunk.done,
                  toolCall: chunk.done ? chunk.toolCall : undefined,
                  // Stamp completion time when the stream finishes, instead of
                  // freezing it at the moment the request started.
                  timestamp: chunk.done ? Date.now() : msg.timestamp,
                }
              : msg
          )
        );
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: "I apologize, but I encountered an error. Please try again.",
                isStreaming: false,
                timestamp: Date.now(),
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const getToolCallInfo = (toolCall?: { name: string; arguments: string }) => {
    if (!toolCall) return null;
    const toolLabels: Record<string, { label: string; icon: string; color: string }> = {
      create_stream:    { label: "Create Stream",     icon: "🚀", color: "bg-indigo-600" },
      withdraw_stream:  { label: "Withdraw Tokens",   icon: "💰", color: "bg-emerald-600" },
      cancel_stream:    { label: "Cancel Stream",     icon: "⚠️", color: "bg-red-600" },
      unlock_milestone: { label: "Unlock Milestone",  icon: "🔓", color: "bg-yellow-600" },
      edit_milestone: { label: "Edit Milestone",  icon: "✏️", color: "bg-blue-600" },
edit_cliff:     { label: "Edit Cliff Date",  icon: "📅", color: "bg-purple-600" },
edit_linear:    { label: "Extend Stream",    icon: "📈", color: "bg-teal-600" },
    };
    const info = toolLabels[toolCall.name] || { label: toolCall.name, icon: "⚡", color: "bg-zinc-600" };
    return { ...info, args: toolCall.arguments };
  };

  // Deterministic backstop: never offer to run an action whose required, user-
  // supplied fields are missing/malformed (the model sometimes emits a tool call
  // with a blank or placeholder recipient). Returns the human-readable names of
  // whatever is still needed; an empty array means the call is runnable.
  const getMissingToolArgs = (toolCall: { name: string; arguments: string }): string[] => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.arguments || "{}") as Record<string, unknown>;
    } catch {
      return ["valid arguments"];
    }
    const isPubkey = (v: unknown): boolean => {
      if (typeof v !== "string" || !v.trim()) return false;
      try {
        new PublicKey(v.trim());
        return true;
      } catch {
        return false;
      }
    };
    const isPositiveNumber = (v: unknown): boolean => {
      const n = typeof v === "string" ? Number(v) : v;
      return typeof n === "number" && Number.isFinite(n) && n > 0;
    };
    const missing: string[] = [];
    switch (toolCall.name) {
      case "create_stream":
        if (!isPubkey(args.recipient)) missing.push("recipient address");
        if (typeof args.mint !== "string" || !String(args.mint).trim()) missing.push("token");
        if (!isPositiveNumber(args.amount)) missing.push("amount");
        break;
      case "withdraw_stream":
      case "cancel_stream":
      case "unlock_milestone":
      case "edit_milestone":
      case "edit_cliff":
      case "edit_linear":
        if (!isPubkey(args.stream_pda)) missing.push("stream address");
        break;
    }
    return missing;
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  // FAB and chat panel are two independent fixed-position elements:
  //  - FAB always sits bottom-right (mobile + desktop).
  //  - Chat panel is centered horizontally on mobile, and docked to the
  //    bottom-right (above the FAB) on desktop (md+).
  const widget = (
    <>
      {open && (
        <div className="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom)_+_1.5rem)] left-1/2 -translate-x-1/2 z-50 md:bottom-[5.5rem] md:left-auto md:right-6 md:translate-x-0">
          <div
            className={`w-[calc(100vw-2rem)] max-w-[380px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex flex-col ${
              minimized ? "h-14" : "h-[600px]"
            }`}
          >
            {!minimized && (
              <>
                {/* Header */}
                <div className="shrink-0 border-b border-zinc-800 p-4 bg-zinc-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">Unified Flow Assistant</h3>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              connectionStatus === "connected"
                                ? "bg-emerald-400"
                                : connectionStatus === "checking"
                                ? "bg-yellow-400"
                                : "bg-red-400"
                            }`}
                          />
                          <span className="text-[10px] text-zinc-500">
                            {connectionStatus === "connected"
                              ? "AI Connected"
                              : connectionStatus === "checking"
                              ? "Connecting..."
                              : "Offline Mode"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMinimized(true)}
                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Wallet warning banner */}
                {!client && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-yellow-950/40 border-b border-yellow-800/40">
                    <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <span className="text-[10px] text-yellow-300">
                      Connect your wallet to execute transactions
                    </span>
                  </div>
                )}

                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
                >
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {message.role === "assistant" && (
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div className={`max-w-[280px] ${message.role === "user" ? "order-1" : ""}`}>
                        <div
                          className={`px-3 py-2.5 rounded-2xl text-[12px] leading-relaxed break-words overflow-hidden ${
                            message.role === "user"
                              ? "bg-indigo-600 text-white rounded-br-md"
                              : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-md"
                          }`}
                        >
                          {message.role === "assistant" ? (
                            message.isStreaming && !message.text ? (
                              <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "120ms" }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "240ms" }} />
                              </div>
                            ) : (
                              renderMarkdown(message.text)
                            )
                          ) : (
                            message.text
                          )}
                        </div>

                        {/* Tool Call Action Button */}
                        {message.role === "assistant" && message.toolCall && !message.isStreaming && (
                          <div className="mt-2">
                            {(() => {
                              const toolInfo = getToolCallInfo(message.toolCall);
                              if (!toolInfo) return null;
                              const missing = getMissingToolArgs(message.toolCall!);
                              if (missing.length > 0) {
                                return (
                                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300/90 text-[11px] leading-relaxed">
                                    <span className="text-sm">⚠️</span>
                                    <span>
                                      Can&apos;t run <strong>{toolInfo.label}</strong> yet — still need:{" "}
                                      <strong>{missing.join(", ")}</strong>. Please provide it and try again.
                                    </span>
                                  </div>
                                );
                              }
                              return (
                                <button
                                  onClick={() =>
                                 executeToolWithFeedback(message.toolCall!.name, message.toolCall!.arguments)
                                  }
                                  disabled={!client}
                                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl ${toolInfo.color} hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-white text-[11px] font-medium`}
                                >
                                  <span className="text-lg">{toolInfo.icon}</span>
                                  <span className="flex-1 text-left">{toolInfo.label}</span>
                                  <Rocket className="w-3.5 h-3.5" />
                                </button>
                              );
                            })()}
                          </div>
                        )}

                        <div className="mt-1 text-[9px] text-zinc-600">
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>

                      {message.role === "user" && (
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                          <User className="w-4 h-4 text-zinc-400" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Suggestions */}
                  {showSuggestions && !loading && messages.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5 px-1">
                        Quick questions
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => sendMessage(suggestion)}
                            className="text-[11px] px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-950/30 text-zinc-400 hover:text-indigo-200 transition-all font-medium"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* Input Area */}
                <div className="shrink-0 border-t border-zinc-800 p-3 bg-zinc-950">
                  <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 focus-within:border-indigo-500/50 transition-all">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={input}
                      maxLength={MAX_MESSAGE_LENGTH}
                      onChange={(e) => {
                        setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask anything about token vesting..."
                      className="flex-1 bg-transparent text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none leading-relaxed min-h-[20px]"
                      style={{ height: "20px" }}
                    />
                    <button
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || loading}
                      className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                        input.trim() && !loading
                          ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                          : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      }`}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[9px] text-zinc-600">Press Enter to send · Shift+Enter for new line</p>
                    {messages.length > 1 && (
                      <button
                        onClick={clearChat}
                        className="text-[9px] text-zinc-500 hover:text-zinc-200 transition-colors"
                      >
                        Clear chat
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FAB Toggle Button — always bottom-right, independent of panel */}
      <button
        onClick={() => {
          setOpen(!open);
          setMinimized(false);
        }}
        className={`fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom)_+_1.5rem)] right-6 z-50 md:bottom-6 group w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${
          open
            ? "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200"
            : "bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-500/50 hover:shadow-indigo-900/50 hover:scale-105"
        }`}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            {usingASI && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-zinc-950 flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5 text-zinc-950" />
              </div>
            )}
          </>
        )}
      </button>
    </>
  );

  if (typeof document === "undefined") return widget;
  return createPortal(widget, document.body);
}