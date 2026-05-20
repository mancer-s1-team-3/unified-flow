import { GuidePage } from "../_components/guide-page";

export default function ReceiveTokensPage() {
  return (
    <GuidePage
      title="Receive tokens"
      intro="Recipients can check their stream and claim tokens once they are ready."
      toc={[
        { id: "find-stream", label: "Find your stream" },
        { id: "check-ready", label: "Check whether it is ready" },
        { id: "claim", label: "Claim the tokens" },
      ]}
    >
      <div className="space-y-6">
        <section id="find-stream" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Find your stream</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Open Active Streams and search by wallet address, stream ID, or mint.
          </p>
        </section>

        <section id="check-ready" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Check whether it is ready</h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            <li>Open the stream card to see the current status.</li>
            <li>Look at the amount available to claim.</li>
            <li>If the wallet does not match the recipient, withdraw will not appear.</li>
          </ul>
        </section>

        <section id="claim" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6">
          <h3 className="font-semibold text-zinc-100">Claim the tokens</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            When the stream is ready, use the withdraw action and confirm the transaction in your wallet.
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
