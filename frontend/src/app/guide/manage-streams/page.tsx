import { GuidePage } from "../_components/guide-page";

export default function ManageStreamsPage() {
  return (
    <GuidePage
      title="Manage streams"
      intro="Creators can manage some streams after they go live, depending on the stream rules."
      toc={[
        { id: "what-you-can-do", label: "What you can do" },
        { id: "rules", label: "Rules to remember" },
      ]}
    >
      <div className="space-y-6">
        <section id="what-you-can-do" className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6">
          <h3 className="text-lg font-semibold text-zinc-100">What you can do</h3>
          <ol className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-decimal list-inside">
            <li>Open the stream drawer to see details and history.</li>
            <li>Cancel a stream if the rules allow it.</li>
            <li>Edit a stream if it is still editable.</li>
            <li>Use CSV tools if you need to handle many streams at once.</li>
          </ol>
        </section>

        <section id="rules" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6">
          <h3 className="font-semibold text-zinc-100">Rules to remember</h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            <li>Some actions are creator-only.</li>
            <li>Some actions are recipient-only.</li>
            <li>Milestone streams unlock one step at a time.</li>
          </ul>
        </section>
      </div>
    </GuidePage>
  );
}
