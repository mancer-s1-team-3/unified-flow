import { GuidePage } from "../_components/guide-page";

export default function CreateStreamPage() {
  return (
    <GuidePage
      title="Create a stream"
      intro="Create a stream when you want tokens to unlock later in a simple and predictable way."
      toc={[
        { id: "choose-type", label: "Choose the stream type" },
        { id: "fill-details", label: "Fill in the details" },
        { id: "review", label: "Review before sending" },
      ]}
    >
      <div className="space-y-6">
        <section id="choose-type" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Choose the stream type</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Linear is steady, Cliff waits until a date, and Milestone unlocks in steps.
          </p>
        </section>

        <section id="fill-details" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Fill in the details</h3>
          <ol className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-decimal list-inside">
            <li>Enter the recipient address.</li>
            <li>Choose the token mint.</li>
            <li>Set the amount and timing.</li>
            <li>If you use milestones, make sure the amounts add up exactly.</li>
          </ol>
        </section>

        <section id="review" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6">
          <h3 className="font-semibold text-zinc-100">Review before sending</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Check the form once more before you approve it. After the transaction is signed, the stream becomes visible in the dashboard.
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
