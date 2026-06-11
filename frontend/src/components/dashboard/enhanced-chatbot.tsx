"use client";

import { useEffect, useRef, useState } from "react";
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
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useUnifiedFlowClient } from "@/lib/useUnifiedFlowClient";
import type { MilestoneInput } from "@unifiedflow/unified-flow-sdk";
import { getStream } from "@/lib/api";

// ─── Enhanced Suggestions ────────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [
  "How do I create a stream?",
  "What's the difference between vesting types?",
  "How do I cancel a stream?",
  "Can I bulk-create streams?",
];

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

// ─── Markdown Renderer ───────────────────────────────────────────────────────
function renderMarkdown(text: string) {
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
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
      userProfile: { cluster: "devnet" },
    };
  };
// Ganti fungsi executeTool dan tambah handler di button onClick

const executeToolWithFeedback = async (toolName: string, args: string) => {
  // Tambah "executing" message
  const executingId = `tool-${Date.now()}`;
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
  // ─── Execute tool call ────────────────────────────────────────────────────
  const executeTool = async (toolName: string, args: string) => {
    if (!client) {
      return { success: false, message: "Wallet not connected. Please connect your wallet first." };
    }

    try {
      const parsedArgs = JSON.parse(args);
      console.log(`Executing tool: ${toolName}`, parsedArgs);

      switch (toolName) {
       case "create_stream": {
  const {
    creator,
    recipient,
    mint,
    amount,
    startTs,
    cliffTs,
    endTs,
    vestingType = 0,
    milestones = [],
    nonce,
  } = parsedArgs;

 const result = await client.createStream(
   new PublicKey(recipient),
     new PublicKey(mint),
   
   
    new BN(amount),
    new BN(startTs),
    new BN(cliffTs),
    new BN(endTs),
    vestingType,
    milestones,
    new BN(nonce)
  );
  return { success: true, message: `Stream created! Tx: ${result.signature}` };
}
case "withdraw_stream": {
  const { stream_pda } = parsedArgs;

  const result = await client.withdraw(new PublicKey(stream_pda));
  return { success: true, message: `Withdrawal successful! Tx: ${result.signature}` };
}
case "cancel_stream": {
  const { stream_pda } = parsedArgs;
  if (!stream_pda) return { success: false, message: "Missing stream_pda." };
  const result = await client.cancel(new PublicKey(stream_pda));
  return { success: true, message: `Stream cancelled! Tx: ${result.signature}` };
}
        case "unlock_milestone": {
          const { stream_pda, creator, milestone_index } = parsedArgs;

          const result = await client.unlockMilestone(
            new PublicKey(stream_pda),
            Number(milestone_index)
          );
          return { success: true, message: `Milestone ${milestone_index} unlocked! Tx: ${result.signature}` };
        }
case "edit_milestone": {
  const { stream_pda, mint, milestone_index, new_amount } = parsedArgs;
  const result = await client.editMilestone(
    new PublicKey(stream_pda),
    new PublicKey(mint),
    Number(milestone_index),
    new BN(new_amount)
  );
  return { success: true, message: `Milestone ${milestone_index} updated! Tx: ${result.signature}` };
}

case "edit_cliff": {
  const { stream_pda, new_cliff_ts } = parsedArgs;
  const result = await client.editCliff(
    new PublicKey(stream_pda),
    new BN(new_cliff_ts)
  );
  return { success: true, message: `Cliff updated! Tx: ${result.signature}` };
}

case "edit_linear": {
  const { stream_pda, mint, new_end_ts, topup_amount } = parsedArgs;
  const result = await client.editLinear(
    new PublicKey(stream_pda),
    new PublicKey(mint),
    new BN(new_end_ts),
    new BN(topup_amount)
  );
  return { success: true, message: `Stream extended! Tx: ${result.signature}` };
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
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    const assistantMessageId = `assistant-${Date.now()}`;
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
              msg.id === assistantMessageId ? { ...msg, text: chunk.content, isStreaming: false } : msg
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
            ? { ...msg, text: "I apologize, but I encountered an error. Please try again.", isStreaming: false }
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

  // ─── Render ───────────────────────────────────────────────────────────────
  const widget = (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className={`w-[380px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
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
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                    onChange={(e) => {
                      setInput(e.target.value);
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
      )}

      {/* FAB Toggle Button */}
      <button
        onClick={() => {
          setOpen(!open);
          setMinimized(false);
        }}
        className={`group w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${
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
    </div>
  );

  if (typeof document === "undefined") return widget;
  return createPortal(widget, document.body);
}