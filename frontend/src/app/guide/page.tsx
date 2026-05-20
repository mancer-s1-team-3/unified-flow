"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  HelpCircle,
  LayoutGrid,
  Lock,
  Rocket,
  ShieldCheck,
  Wallet,
} from "lucide-react";

type TabId = "vesting" | "how-to" | "map" | "faq";

const TABS: Array<{
  id: TabId;
  label: string;
  icon: typeof BookOpen;
}> = [
  { id: "vesting", label: "What is Vesting", icon: BookOpen },
  { id: "how-to", label: "How to Use", icon: Wallet },
  { id: "map", label: "UI Map", icon: LayoutGrid },
  { id: "faq", label: "FAQ", icon: HelpCircle },
];

const VESTING_CARDS = [
  {
    title: "Linear Vesting",
    body: "Tokens unlock gradually from `startTs` to `endTs`. This is the default model for predictable distributions and team allocations.",
  },
  {
    title: "Cliff Vesting",
    body: "Tokens stay locked until a cliff timestamp is reached. After the cliff, tokens become available according to the stream rules.",
  },
  {
    title: "Milestone Vesting",
    body: "Tokens unlock in explicit milestones. Each milestone allocation must sum exactly to the total stream amount.",
  },
];

const CREATOR_STEPS = [
  "Connect your wallet from the top-right corner.",
  "Open Create Stream and choose Linear, Cliff, or Milestone.",
  "Fill recipient, mint, amount, and timing fields.",
  "Review the form before signing the transaction.",
  "Track the stream later from Active Streams or the details drawer.",
];

const RECIPIENT_STEPS = [
  "Open Active Streams and search by wallet, mint, or stream PDA.",
  "Open the stream drawer to inspect status and claimability.",
  "If your wallet matches the recipient, withdraw becomes available.",
];

const UI_MAP = [
  {
    name: "Dashboard Home",
    desc: "Quick actions for create, edit, withdraw, cancel, and CSV bulk workflows.",
  },
  {
    name: "Active Streams",
    desc: "Searchable list of indexed streams with a live refresh and detail drawer.",
  },
  {
    name: "Developer Docs",
    desc: "API, MCP, and CLI reference for integrators and AI agents.",
  },
  {
    name: "AI Skills",
    desc: "Backend-generated skill docs for agent workflows.",
  },
];

const FAQ = [
  {
    q: "Why do I need to connect a wallet?",
    a: "The wallet is needed to sign creator and recipient actions. Read-only browsing still works without connecting.",
  },
  {
    q: "Why can't I withdraw?",
    a: "Withdraw only appears if your connected wallet matches the recipient and the stream has claimable balance.",
  },
  {
    q: "Why must milestone amounts match exactly?",
    a: "Milestone streams are enforced on-chain. The milestone sum must equal the total amount or the transaction fails.",
  },
  {
    q: "Can I use CSV instead of manual forms?",
    a: "Yes. The dashboard supports CSV bulk create and bulk edit for advanced workflows.",
  },
];

export default function UserGuidePage() {
  const [activeTab, setActiveTab] = useState<TabId>("vesting");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-cyan-950/20 via-transparent to-transparent pointer-events-none blur-[140px]" />
      <div className="absolute -top-24 right-[-140px] w-[460px] h-[460px] rounded-full bg-indigo-950/20 blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-400 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Developer Docs
          </Link>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 backdrop-blur-sm shadow-2xl shadow-black/30 overflow-hidden">
            <div className="border-b border-zinc-800 px-6 py-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 mb-4">
                <Rocket className="w-3.5 h-3.5" />
                User Interface Guide
              </div>
              <h1 className="text-4xl font-black tracking-tight">How to use Unified Flow</h1>
              <p className="mt-3 text-sm text-zinc-400 max-w-2xl leading-relaxed">
                This page is organized by tabs so users can quickly jump between vesting basics, dashboard steps, UI locations, and common questions.
              </p>
            </div>

            <div className="px-6 pt-6">
              <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-4">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                        active
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                          : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-6">
              {activeTab === "vesting" && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-100">
                      <ShieldCheck className="w-4.5 h-4.5 text-cyan-400" />
                      Vesting Basics
                    </h2>
                    <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                      Vesting is a way to release tokens over time instead of giving everything at once. Unified Flow supports linear, cliff, and milestone-based streams.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {VESTING_CARDS.map((item) => (
                      <div key={item.title} className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-5">
                        <h3 className="font-semibold text-zinc-100">{item.title}</h3>
                        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{item.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                    <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-cyan-400" />
                      Important rule
                    </h3>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                      For milestone streams, the sum of all milestone amounts must exactly match the total amount. That is enforced by the protocol.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "how-to" && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-100">
                      <Wallet className="w-4.5 h-4.5 text-cyan-400" />
                      Creator Flow
                    </h2>
                    <div className="mt-4 space-y-4">
                      {CREATOR_STEPS.map((step, idx) => (
                        <div key={step} className="flex gap-4">
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-xs font-bold text-cyan-300">
                            {idx + 1}
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-400">{step}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-100">
                      <CheckCircle2 className="w-4.5 h-4.5 text-cyan-400" />
                      Recipient Flow
                    </h2>
                    <div className="mt-4 space-y-4">
                      {RECIPIENT_STEPS.map((step, idx) => (
                        <div key={step} className="flex gap-4">
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-xs font-bold text-cyan-300">
                            {idx + 1}
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-400">{step}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "map" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {UI_MAP.map((item) => (
                    <div key={item.name} className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                      <h3 className="font-semibold text-zinc-100">{item.name}</h3>
                      <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "faq" && (
                <div className="grid gap-4 md:grid-cols-2">
                  {FAQ.map((item) => (
                    <div key={item.q} className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                      <h3 className="font-semibold text-zinc-100 flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                        {item.q}
                      </h3>
                      <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-6">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Quick Notes
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
                <li>Read-only browsing works without connecting a wallet.</li>
                <li>Recipient actions appear only for the correct wallet.</li>
                <li>Use the stream drawer to inspect status before signing.</li>
                <li>CSV workflows are available for bulk operations.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/15 to-zinc-900 p-6">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                Developer Reference
              </h2>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                If you want API, MCP, or CLI details, open the developer docs instead.
              </p>
              <Link
                href="/docs"
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
              >
                Open developer docs
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
