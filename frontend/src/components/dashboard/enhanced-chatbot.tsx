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
  Zap,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { getASIOneChatService, type ChatContext, type ChatMessage } from "@/lib/asione-chat";

// ─── Enhanced Suggestions ───────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [
  "How do I create a stream?",
  "What's the difference between vesting types?",
  "How do I cancel a stream?",
  "Can I bulk-create streams?",
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isStreaming?: boolean;
}

// ─── Markdown Renderer (Simple) ─────────────────────────────────────────────
function renderMarkdown(text: string) {
  // Bold
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-zinc-200">$1</em>');
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-zinc-950 border border-zinc-800 rounded-lg p-2 my-2 overflow-x-auto text-[10px] font-mono text-zinc-200"><code>$1</code></pre>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] font-mono text-indigo-200">$1</code>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br />');
  
  return <span className="text-zinc-100" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function EnhancedChatbot() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [usingASI, setUsingASI] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatService = getASIOneChatService();

  // Check API connection on mount
  useEffect(() => {
    const isConfigured = chatService.isConfigured();
    setConnectionStatus(isConfigured ? "connected" : "disconnected");
    setUsingASI(isConfigured);
    
    // Add welcome message
    if (messages.length === 0) {
      const welcomeMsg: Message = {
        id: "welcome",
        role: "assistant",
        text: isConfigured 
          ? "👋 Hi! I'm your AI assistant powered by Unified Flow. I can help you with token vesting, stream management, and more. What would you like to know?"
          : "👋 Hi! I'm your assistant. I can help you with token vesting, stream management, and more. What would you like to know?",
        timestamp: Date.now(),
      };
      setMessages([welcomeMsg]);
    }
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

  // Build chat context
  const buildChatContext = (): ChatContext => {
    const conversationHistory: ChatMessage[] = messages.map(msg => ({
      role: msg.role,
      content: msg.text,
      timestamp: msg.timestamp,
    }));

    return {
      conversationHistory,
      userProfile: {
        // You can add real user context here
        cluster: "devnet", // This should come from actual wallet state
      },
    };
  };

  // Send message
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    // Create placeholder for streaming response
    const assistantMessageId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: "assistant",
      text: "",
      timestamp: Date.now(),
      isStreaming: true,
    }]);

    try {
      const context = buildChatContext();

      if (usingASI) {
        // Use ASI:One streaming
        let fullResponse = "";
        for await (const chunk of chatService.generateStreamingResponse(text, context)) {
          if (chunk.content) {
            fullResponse += chunk.content;
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, text: fullResponse }
                : msg
            ));
          }
          if (chunk.done) break;
        }

        // Finalize message
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, text: fullResponse, isStreaming: false }
            : msg
        ));
      } else {
        // Use fallback
        const response = await chatService.generateResponse(text, context);
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, text: response.content, isStreaming: false }
            : msg
        ));
      }

      // Update suggestions based on context
      const newSuggestions = chatService.getSuggestedQuestions(context);
      setSuggestions(newSuggestions.slice(0, 4));

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { 
              ...msg, 
              text: "I apologize, but I encountered an error. Please try again.",
              isStreaming: false 
            }
          : msg
      ));
    } finally {
      setLoading(false);
    }
  };

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Clear chat
  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
  };

  // Connection status indicator
  const ConnectionStatus = () => (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800">
      {connectionStatus === "checking" ? (
        <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />
      ) : connectionStatus === "connected" ? (
        <CheckCircle className="w-3 h-3 text-emerald-400" />
      ) : (
        <AlertCircle className="w-3 h-3 text-amber-400" />
      )}
      <span className="text-[9px] font-medium text-zinc-400">
        {connectionStatus === "connected" ? "Unified Flow Active" : "Basic Mode"}
      </span>
    </div>
  );

  // Widget content
  const widget = (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat Window */}
      {open && (
        <div className={`w-[380px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          minimized ? "h-12" : "h-[600px]"
        }`}>
          {/* Header */}
          <div className="shrink-0 border-b border-zinc-800 p-3 bg-zinc-950">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                  {usingASI ? (
                    <Sparkles className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {usingASI ? "AI Assistant" : "Help Assistant"}
                  </h3>
                  <ConnectionStatus />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMinimized(!minimized)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${minimized ? "rotate-180" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          {!minimized && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                        {usingASI ? (
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[280px] px-3.5 py-2.5 ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-2xl rounded-br-sm"
                          : "bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="text-[12px] leading-relaxed">{msg.text}</p>
                      ) : (
                        <div className="space-y-1">
                          {renderMarkdown(msg.text)}
                          {msg.isStreaming && (
                            <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse ml-1" />
                          )}
                        </div>
                      )}
                    </div>

                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-2 items-end">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      {usingASI ? (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "240ms" }} />
                    </div>
                  </div>
                )}

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
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[9px] text-zinc-600">
                    Press Enter to send · Shift+Enter for new line
                  </p>
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
            ? "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rotate-0"
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
