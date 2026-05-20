import Link from "next/link";
import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, Lock, RefreshCw, Rocket, ShieldCheck, Wallet } from "lucide-react";

const CREATOR_STEPS = [
  {
    title: "Connect wallet",
    body: "Use the wallet button in the top-right corner to connect your Solana wallet. The app uses the connected wallet for create, edit, cancel, and unlock actions.",
  },
  {
    title: "Create a stream",
    body: "Open Create Stream, choose Linear, Cliff, or Milestone, then enter recipient, mint, amount, and schedule values. Milestone streams require allocations that add up exactly to the total amount.",
  },
  {
    title: "Review before sending",
    body: "Check the form, wallet, and stream type carefully before you sign. The dashboard shows the transaction flow and the active form values before dispatch.",
  },
  {
    title: "Track progress",
    body: "Use Active Streams to search by creator, recipient, mint, or PDA. Open a stream to inspect vesting state, milestones, and claim history.",
  },
];

const RECIPIENT_STEPS = [
  {
    title: "Open Active Streams",
    body: "Find the stream by searching the PDA, recipient wallet, or mint address. The list refreshes automatically and also supports a manual refresh button.",
  },
  {
    title: "Inspect details",
    body: "Click a stream card to open the detail drawer. You can see the current status, unlocked amount, milestone breakdown, and whether the stream is claimable.",
  },
  {
    title: "Claim tokens",
    body: "If your connected wallet matches the recipient, the withdraw action becomes available. Submit the claim from the stream action panel.",
  },
];

const UI_MAP = [
  {
    name: "Dashboard home",
    desc: "Quick stats, recent streams, CSV bulk actions, and the main create/edit/withdraw panels.",
  },
  {
    name: "Active Streams",
    desc: "Searchable list of indexed streams with live filtering and a details drawer.",
  },
  {
    name: "Developer Docs",
    desc: "API, MCP, and CLI reference for integrators and automation users.",
  },
  {
    name: "AI Skills",
    desc: "Backend-generated protocol skills documentation for agent-based workflows.",
  },
];

const FAQ = [
  {
    q: "Why does the app ask me to connect a wallet?",
    a: "The wallet is needed to sign transactions such as create, withdraw, cancel, and milestone unlocks. Read-only browsing still works without it.",
  },
  {
    q: "Why can't I withdraw from a stream?",
    a: "Withdraw is only available if your connected wallet matches the recipient and the stream has claimable balance.",
  },
  {
    q: "Why do milestone totals need to match exactly?",
    a: "Milestone vesting is enforced by the program. Every milestone allocation must sum to the stream total amount.",
  },
  {
    q: "Can I use CSV instead of filling forms manually?",
    a: "Yes. The dashboard supports CSV-based bulk create and bulk edit flows for advanced users.",
  },
];

export default function UserGuidePage() {
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
            <BookOpen className="w-4 h-4" />
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
                This page explains the dashboard from a user point of view: connect a wallet, create streams, track balances, and claim or manage streams safely.
              </p>
            </div>

            <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Read-only browsing", value: "No wallet needed", icon: BookOpen },
                { label: "Creator actions", value: "Create / edit / cancel", icon: Wallet },
                { label: "Recipient actions", value: "Claim vested tokens", icon: CheckCircle2 },
                { label: "Stream types", value: "Linear, Cliff, Milestone", icon: ShieldCheck },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400">
                      <Icon className="w-4 h-4 text-cyan-400" />
                      {item.label}
                    </div>
                    <div className="mt-2 text-lg font-bold text-zinc-100">{item.value}</div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 pb-6 grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-100">
                  <Wallet className="w-4.5 h-4.5 text-cyan-400" />
                  Creator Flow
                </h2>
                <div className="mt-4 space-y-4">
                  {CREATOR_STEPS.map((step, idx) => (
                    <div key={step.title} className="flex gap-4">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-xs font-bold text-cyan-300">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-100">{step.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                      </div>
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
                    <div key={step.title} className="flex gap-4">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-xs font-bold text-cyan-300">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-100">{step.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-6">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                UI Map
              </h2>
              <div className="mt-4 space-y-3">
                {UI_MAP.map((item) => (
                  <div key={item.name} className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-4">
                    <div className="font-semibold text-zinc-100">{item.name}</div>
                    <p className="mt-1 text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/15 to-zinc-900 p-6">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                Safety Notes
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
                <li>Always verify the connected wallet before signing any action.</li>
                <li>Milestone allocations must add up exactly to the full stream amount.</li>
                <li>Recipient actions appear only when the connected wallet matches the stream recipient.</li>
                <li>Use the search field and stream drawer before submitting a transaction.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-6">
              <h2 className="text-sm font-semibold text-zinc-100">Need the developer reference?</h2>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Open the protocol docs for API, MCP, and CLI details used by integrators and AI agents.
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

        <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900/35 p-6">
          <h2 className="text-lg font-bold text-zinc-100">Frequently Asked Questions</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
                <h3 className="font-semibold text-zinc-100">{item.q}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
