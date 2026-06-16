import React from "react";
import { BookOpen, Clock, Lock, Layers, Info } from "lucide-react";

export default function OverviewPage() {
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 mb-4">Vesting Models</h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Our smart contract handles three distinct vesting models, ensuring maximum adaptability for employee grants, developer vesting schedules, and milestone-based project distributions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD 1 — Linear */}
        <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
              <Clock className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100">Linear Vesting</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Tokens unlock continuously on a second-by-second basis starting from <code className="text-cyan-300 font-mono text-xs">startTs</code> up to <code className="text-cyan-300 font-mono text-xs">endTs</code>. Highly recommended for standard team vesting.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <span className="inline-flex text-xs uppercase tracking-wider font-bold text-cyan-400 bg-cyan-500/5 px-2 py-1 rounded">Type 0</span>
            <p className="text-xs text-zinc-500 font-mono">args: &lt;durationSecs&gt;</p>
          </div>
        </div>

        {/* CARD 2 — Cliff */}
        <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <Lock className="w-5 h-5 text-violet-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100">Cliff Vesting</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Tokens remain fully locked in the program vault until <code className="text-violet-300 font-mono text-xs">cliffTs</code> is met. On the cliff date, 100% of the funds are unlocked at once.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <span className="inline-flex text-xs uppercase tracking-wider font-bold text-violet-400 bg-violet-500/5 px-2 py-1 rounded">Type 1</span>
            <p className="text-xs text-zinc-500 font-mono">args: &lt;durationSecs&gt;</p>
          </div>
        </div>

        {/* CARD 3 — Milestone */}
        <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between md:col-span-2">
          <div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
              <Layers className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100">Milestone Vesting</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Tokens are allocated into distinct milestone buckets. Stream creators approve/unlock each sequential milestone on-chain to release funds to the recipient.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <span className="inline-flex text-xs uppercase tracking-wider font-bold text-amber-400 bg-amber-500/5 px-2 py-1 rounded">Type 2</span>
            <p className="text-xs text-zinc-500 font-mono">args: &lt;m1,m2,m3,...&gt;</p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex gap-4 mt-8">
        <Info className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-base font-semibold text-indigo-300">Dynamic Rebalancing Capability</h4>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            For Milestone Vesting streams, our protocol allows creators to resize allocations of un-unlocked milestones via <code className="text-indigo-300 font-mono text-xs bg-indigo-500/10 px-1 rounded">edit-milestone</code>. The smart contract automatically transfers tokens to or from the stream vault as needed to match the new totals. Cliff timestamps can also be adjusted post-creation using <code className="text-indigo-300 font-mono text-xs bg-indigo-500/10 px-1 rounded">edit-cliff</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
