import { GuidePage } from "../_components/guide-page";

export default function ConnectWalletPage() {
  return (
    <GuidePage
      title="Connect your wallet"
      intro="You need a wallet when you want to sign actions in the app. Browsing still works without one."
      toc={[
        { id: "before-you-start", label: "Before you start" },
        { id: "what-it-is-for", label: "What the wallet is for" },
      ]}
    >
      <div className="space-y-6">
        <section id="before-you-start" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">Before you start</h3>
          <ol className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-decimal list-inside">
            <li>Click the wallet button in the top-right corner.</li>
            <li>Pick your wallet and approve the connection.</li>
            <li>Check the address shown in the app before signing anything.</li>
          </ol>
        </section>

        <section id="what-it-is-for" className="grid gap-4 md:grid-cols-3 scroll-mt-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 md:col-span-3">
            <p className="text-sm text-zinc-400 leading-relaxed">
              The app uses your connected wallet to decide which actions are available, like creating a stream, withdrawing, or cancelling.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 md:col-span-3">
            <ul className="space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
              <li>You can still browse without connecting.</li>
              <li>You only need a wallet when you want to sign.</li>
              <li>The connected wallet must match the action you are trying to take.</li>
            </ul>
          </div>
        </section>
      </div>
    </GuidePage>
  );
}
