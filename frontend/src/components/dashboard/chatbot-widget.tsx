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
} from "lucide-react";

// ─── Knowledge Base ────────────────────────────────────────────────────────
const KB: { patterns: RegExp[]; answer: string }[] = [
  {
    patterns: [/create|buat|bikin|deploy|new stream/i],
    answer:
      "To **create a stream**, go to the **Create Stream** tab in the sidebar. You can choose between:\n\n• **Linear Vesting** — tokens unlock gradually over a duration\n• **Cliff Vesting** — tokens are locked until a cliff date, then released\n• **Milestone-Based** — tokens unlock per milestone you approve\n\nYou can also bulk-create via **CSV** upload for multiple recipients at once!",
  },
  {
    patterns: [/cancel|terminate|stop|refund/i],
    answer:
      "To **cancel a stream**, navigate to the **Cancel Stream** tab. Enter the stream PDA address and click *Cancel and Refund Stream*.\n\n⚠️ A confirmation dialog will appear — you must type **\"cancel\"** to confirm. This action is **irreversible**:\n\n• Unvested tokens → refunded to creator\n• Already unlocked tokens → still claimable by recipient\n• Stream is permanently terminated",
  },
  {
    patterns: [/withdraw|claim|token/i],
    answer:
      "As a **recipient**, you can claim unlocked tokens from the **Withdraw Claim** tab. Enter your stream PDA address and submit.\n\nOnly matured/unlocked tokens can be withdrawn — the amount depends on time elapsed (linear/cliff) or milestones approved (milestone-based).",
  },
  {
    patterns: [/milestone|unlock/i],
    answer:
      "**Milestone-Based Vesting** lets you unlock token tranches manually. As the creator:\n\n1. Go to **Unlock Milestone** tab\n2. Enter the stream PDA address\n3. Submit — the next milestone in sequence gets unlocked\n\nYou can also edit milestone amounts via **Edit Milestone Structure** as long as the total stays the same.",
  },
  {
    patterns: [/edit|modify|change|extend|topup|top-up/i],
    answer:
      "You can modify streams from the edit tabs:\n\n• **Edit Linear Timeline** — extend end date & top-up token amount\n• **Edit Cliff Conditions** — shift the cliff timestamp\n• **Edit Milestone Structure** — rebalance milestone allocations\n\n⚠️ Streams created via CSV import **must** be edited using the Bulk Edit CSV console to maintain consistency.",
  },
  {
    patterns: [/csv|bulk|import|upload/i],
    answer:
      "**CSV Bulk Operations** let you create or edit multiple streams at once:\n\n1. Download the template from the **Create Stream** → CSV tab\n2. Fill in recipient, amount, type, duration, milestones\n3. Upload or paste the CSV\n4. Click **Analyze Diff** to preview changes\n5. Apply the revision — it's versioned automatically\n\nEach submission creates a new CSV version you can compare against.",
  },
  {
    patterns: [/multisig|squads/i],
    answer:
      "**Squads Multisig** mode lets you bundle actions as multisig proposals instead of executing directly on-chain.\n\nToggle it from the banner at the top of any action tab. Your action will be wrapped as a Squads proposal and you'll be redirected to the Streams page.",
  },
  {
    patterns: [/pda|address|stream id/i],
    answer:
      "A **Stream PDA** (Program Derived Address) is the unique on-chain identifier for each vesting stream. You can find it in the **Streams** tab — click any stream card to open the details drawer, then copy the PDA from there.",
  },
  {
    patterns: [/vesting|linear|cliff/i],
    answer:
      "Three vesting types are supported:\n\n• **Linear** — tokens unlock continuously from start to end timestamp\n• **Cliff** — tokens are locked until a cliff date, then all unlock at once (or linearly after cliff)\n• **Milestone** — creator manually approves each tranche; recipients claim each unlocked milestone",
  },
  {
    patterns: [/wallet|connect|solana/i],
    answer:
      "Connect your Solana wallet using the **wallet button** in the top-right corner. The dashboard supports any Solana-compatible wallet (Phantom, Backpack, etc.).\n\n• **Creator** wallet → create, cancel, edit, unlock\n• **Recipient** wallet → withdraw/claim",
  },
  {
    patterns: [/fee|cost|sol|lamport/i],
    answer:
      "Transaction fees are standard Solana network fees (fractions of a SOL). The protocol itself doesn't charge additional fees beyond what's needed to fund on-chain accounts.\n\nMake sure your wallet has enough SOL to cover rent-exemption and tx fees.",
  },
  {
    patterns: [/devnet|testnet|mainnet|cluster/i],
    answer:
      "The cluster is configured via your Solana wallet's network setting. Switch between **Devnet** and **Mainnet** directly in your wallet — the dashboard will automatically detect and display the correct mint presets for that cluster.",
  },
  {
    patterns: [/help|halo|hi|hello|hai|apa|what|how|cara|bantuan/i],
    answer:
      "👋 Hi! I'm **Unified Flow Assistant** — your guide to the token distribution platform.\n\nI can help you with:\n\n• 🔵 **Creating** vesting streams\n• 🔴 **Cancelling** streams\n• 🟢 **Claiming** tokens as a recipient\n• 🟡 **Editing** stream parameters\n• 📁 **CSV bulk operations**\n• 🔒 **Multisig** proposals\n\nJust ask me anything!",
  },
];

const FALLBACK =
  "I'm not sure about that specific question — but you can browse the **sidebar tabs** to explore all available actions. For technical issues, check the transaction signature on [Solscan](https://solscan.io) or reach out to the team.";

const SUGGESTIONS = [
  "How do I create a stream?",
  "How do I cancel a stream?",
  "How do I claim tokens?",
  "What is CSV bulk create?",
  "How do milestones work?",
];

function getAnswer(input: string): string {
  const trimmed = input.trim();
  for (const { patterns, answer } of KB) {
    if (patterns.some((p) => p.test(trimmed))) return answer;
  }
  return FALLBACK;
}

// ─── Markdown-lite renderer ────────────────────────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.trim() === "") {
      result.push(<div key={key++} className="h-1.5" />);
      continue;
    }

    // Bullet
    if (/^[•\-\*]/.test(line.trim())) {
      const content = line.replace(/^[•\-\*]\s*/, "");
      result.push(
        <div key={key++} className="flex items-start gap-1.5 text-[11px] text-zinc-300">
          <span className="w-1 h-1 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
          <span dangerouslySetInnerHTML={{ __html: applyInline(content) }} />
        </div>
      );
      continue;
    }

    result.push(
      <p
        key={key++}
        className="text-[11px] text-zinc-300 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: applyInline(line) }}
      />
    );
  }

  return result;
}

function applyInline(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-100 font-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-indigo-300">$1</em>')
    .replace(
      /\[(.+?)\]\((.+?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline hover:text-indigo-300">$1</a>'
    );
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
}

// ─── Main Widget ───────────────────────────────────────────────────────────
export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      role: "assistant",
      text: "👋 Hi! I'm **Unified Flow Assistant**. Ask me anything about creating streams, claiming tokens, CSV bulk operations, or any other feature!",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 150);
    }
  }, [open, messages]);

  const sendMessage = (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: text.trim(), ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    // Simulate async response
    setTimeout(() => {
      const answer = getAnswer(text);
      const botMsg: Message = { id: crypto.randomUUID(), role: "assistant", text: answer, ts: Date.now() };
      setMessages((prev) => [...prev, botMsg]);
      setLoading(false);
    }, 500 + Math.random() * 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const widget = (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-3">
      {/* Chat Window */}
      {open && (
        <div className="w-[340px] sm:w-[360px] bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl shadow-black/70 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{ height: "480px" }}>

          {/* Header */}
          <div className="relative flex items-center gap-3 px-4 py-3.5 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
            {/* Gradient accent */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-400 rounded-t-3xl" />
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-extrabold text-zinc-100 flex items-center gap-1.5">
                Unified Flow Assistant
                <Sparkles className="w-3 h-3 text-indigo-400" />
              </div>
              <div className="text-[9px] text-zinc-500 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Always online
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              aria-label="Close chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 scroll-smooth">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"} items-end`}
              >
                {/* Avatar */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-0.5 ${
                  msg.role === "assistant"
                    ? "bg-indigo-600/20 border border-indigo-500/30"
                    : "bg-zinc-800 border border-zinc-700"
                }`}>
                  {msg.role === "assistant"
                    ? <Bot className="w-3 h-3 text-indigo-400" />
                    : <User className="w-3 h-3 text-zinc-400" />
                  }
                </div>

                {/* Bubble */}
                <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-zinc-50 rounded-br-sm"
                    : "bg-zinc-900 border border-zinc-800 rounded-bl-sm"
                }`}>
                  {msg.role === "user" ? (
                    <p className="text-[11px] leading-relaxed">{msg.text}</p>
                  ) : (
                    <div className="space-y-1">{renderMarkdown(msg.text)}</div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2 items-end">
                <div className="w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mb-0.5">
                  <Bot className="w-3 h-3 text-indigo-400" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "240ms" }} />
                </div>
              </div>
            )}

            {/* Suggestions */}
            {showSuggestions && !loading && (
              <div className="pt-1">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-2 px-1">Quick questions</div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-950/30 text-zinc-400 hover:text-indigo-300 transition-all font-medium"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-zinc-800 p-3 bg-zinc-950">
            <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 focus-within:border-indigo-500/50 transition-all">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                className="flex-1 bg-transparent text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none leading-relaxed min-h-[20px]"
                style={{ height: "20px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className={`shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all ${
                  input.trim() && !loading
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[9px] text-zinc-600 text-center mt-1.5">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}

      {/* FAB Toggle Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`group w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${
          open
            ? "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rotate-0"
            : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 hover:shadow-indigo-900/50 hover:scale-105"
        }`}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <>
            <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            {/* Unread dot */}
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-zinc-950 animate-pulse" />
          </>
        )}
      </button>
    </div>
  );

  if (typeof document === "undefined") return widget;
  return createPortal(widget, document.body);
}
