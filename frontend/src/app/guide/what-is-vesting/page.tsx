import { GuidePage } from "../_components/guide-page";

export default function WhatIsVestingPage() {
  return (
    <GuidePage
      title="What is vesting?"
      intro="Vesting is a simple way to release tokens over time instead of giving everything at once."
      toc={[
        { id: "simple-idea", label: "The simple idea" },
        { id: "types", label: "The three types" },
        { id: "why-it-matters", label: "Why it matters" },
      ]}
    >
      <div className="space-y-6">
        <section id="simple-idea" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">The simple idea</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Instead of sending all tokens on day one, vesting spreads the release over time so it feels planned and predictable.
          </p>
        </section>

        <section id="types" className="grid gap-4 md:grid-cols-3 scroll-mt-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
            <h3 className="font-semibold text-zinc-100">Linear</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">Tokens unlock gradually from start to finish.</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
            <h3 className="font-semibold text-zinc-100">Cliff</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">Tokens stay locked until a chosen date.</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
            <h3 className="font-semibold text-zinc-100">Milestone</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">Tokens unlock in stages when milestones are reached.</p>
          </div>
        </section>

        <section id="why-it-matters" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6">
          <h3 className="font-semibold text-zinc-100">Why it matters</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Vesting helps teams, creators, and recipients stay aligned. It makes token release clear, fair, and easy to understand.
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
