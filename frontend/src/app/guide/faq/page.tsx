import { GuidePage } from "../_components/guide-page";

export default function GuideFaqPage() {
  return (
    <GuidePage
      title="FAQ"
      intro="Short answers to the most common questions about using the app."
      toc={[
        { id: "need-wallet", label: "Do I need a wallet?" },
        { id: "withdraw", label: "Why can’t I withdraw?" },
        { id: "wrong-type", label: "What if I choose the wrong type?" },
      ]}
    >
      <div className="space-y-6">
        <section id="need-wallet" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Do I need a wallet?</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            No. You can browse without connecting a wallet. You only need one when you want to sign an action.
          </p>
        </section>

        <section id="withdraw" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Why can’t I withdraw?</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Usually the stream is not ready yet, or your connected wallet is not the recipient.
          </p>
        </section>

        <section id="wrong-type" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">What if I choose the wrong type?</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Linear is gradual, Cliff waits for a date, and Milestone releases in steps. Pick the one that matches your plan.
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
