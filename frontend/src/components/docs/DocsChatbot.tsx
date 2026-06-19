"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bot, ChevronDown, Loader2, MessageCircle, Send, User, X, BookOpen } from "lucide-react";
import { getDocsChatService, type DocsSource } from "@/lib/docs-chat";

const DEFAULT_SUGGESTIONS = [
  "What's the difference between linear, cliff, and milestone vesting?",
  "How does edit_linear extend a stream?",
  "What does the cancel instruction do?",
  "How do I convert a token amount to base units?",
];

const MAX_MESSAGE_LENGTH = 2000;

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isStreaming?: boolean;
  sources?: DocsSource[];
}

function newId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}

// Same escape-then-restyle approach as the dashboard assistant's renderer,
// kept minimal here since docs answers lean toward plain prose + inline code.
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text: string) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] font-mono text-indigo-200">$1</code>');
  html = html.replace(/\n/g, "<br />");
  return <span className="text-zinc-100" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DocsChatbot() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const service = getDocsChatService();

  useEffect(() => {
    let cancelled = false;
    service.checkStatus().then((isConfigured) => {
      if (cancelled) return;
      setConnectionStatus(isConfigured ? "connected" : "disconnected");
      if (messages.length === 0) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            text: "👋 I'm the docs assistant. Ask me anything about Unified Flow's instructions, SDK, REST API, MCP server, CLI, or architecture — I'll search the documentation and answer from it.",
            timestamp: Date.now(),
          },
        ]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || loading) return;

    const userMessage: Message = { id: newId("user"), role: "user", text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    const assistantId = newId("assistant");
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", timestamp: Date.now(), isStreaming: true },
    ]);

    try {
      const conversationHistory = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.text }));

      for await (const chunk of service.ask(text, { conversationHistory })) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  text: chunk.content,
                  isStreaming: !chunk.done,
                  sources: chunk.done ? chunk.sources : msg.sources,
                  timestamp: chunk.done ? Date.now() : msg.timestamp,
                }
              : msg,
          ),
        );
        if (chunk.done) break;
      }
    } catch {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, text: "Something went wrong answering that. Please try again.", isStreaming: false, timestamp: Date.now() }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
  };

  // FAB and chat panel are two independent fixed-position elements:
  //  - FAB always sits bottom-right (mobile + desktop).
  //  - Chat panel is centered horizontally on mobile, and docked to the
  //    bottom-right (above the FAB) on desktop (md+).
  const widget = (
    <>
      {open && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:bottom-[6.5rem] md:left-auto md:right-6 md:translate-x-0">
          <div
            className={`w-[calc(100vw-2rem)] max-w-[380px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex flex-col ${
              minimized ? "h-14" : "h-[600px]"
            }`}
          >
            {!minimized && (
              <>
                <div className="shrink-0 border-b border-zinc-800 p-4 bg-zinc-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">Docs Assistant</h3>
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
                            {connectionStatus === "connected" ? "AI Connected" : connectionStatus === "checking" ? "Connecting..." : "Offline"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setMinimized(true)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
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

                        {/* Sources: link back to the docs page each cited chunk came from */}
                        {message.role === "assistant" && message.sources && message.sources.length > 0 && !message.isStreaming && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {message.sources.map((s, idx) => (
                              <Link
                                key={`${s.slug}-${idx}`}
                                href={`/docs/${s.slug}`}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 text-zinc-400 hover:text-indigo-200 transition-colors"
                                title={s.heading}
                              >
                                <BookOpen className="w-2.5 h-2.5" />
                                {s.title}
                              </Link>
                            ))}
                          </div>
                        )}

                        <div className="mt-1 text-[9px] text-zinc-600">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>

                      {message.role === "user" && (
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                          <User className="w-4 h-4 text-zinc-400" />
                        </div>
                      )}
                    </div>
                  ))}

                  {showSuggestions && !loading && messages.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5 px-1">Quick questions</div>
                      <div className="flex flex-wrap gap-2">
                        {DEFAULT_SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={() => sendMessage(s)}
                            className="text-[11px] px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-950/30 text-zinc-400 hover:text-indigo-200 transition-all font-medium"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>

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
                      placeholder="Ask about the docs..."
                      className="flex-1 bg-transparent text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none leading-relaxed min-h-[20px]"
                      style={{ height: "20px" }}
                    />
                    <button
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || loading}
                      className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                        input.trim() && !loading ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      }`}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[9px] text-zinc-600">Press Enter to send · Shift+Enter for new line</p>
                    {messages.length > 1 && (
                      <button onClick={clearChat} className="text-[9px] text-zinc-500 hover:text-zinc-200 transition-colors">
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
        className={`fixed bottom-6 right-6 z-50 group w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${
          open
            ? "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200"
            : "bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-500/50 hover:shadow-indigo-900/50 hover:scale-105"
        }`}
        aria-label={open ? "Close docs assistant" : "Open docs assistant"}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />}
      </button>
    </>
  );

  if (typeof document === "undefined") return widget;
  return createPortal(widget, document.body);
}