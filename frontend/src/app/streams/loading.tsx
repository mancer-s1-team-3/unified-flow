export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-5">
        <div className="h-16 rounded-2xl border border-zinc-900 bg-zinc-900/30 animate-pulse" />
      </div>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12 space-y-6">
        <div className="h-24 rounded-3xl border border-zinc-900 bg-zinc-900/20 animate-pulse" />
        <div className="h-20 rounded-2xl border border-zinc-900 bg-zinc-900/20 animate-pulse" />
        <div className="space-y-4">
          <div className="h-36 rounded-2xl border border-zinc-900 bg-zinc-900/20 animate-pulse" />
          <div className="h-36 rounded-2xl border border-zinc-900 bg-zinc-900/20 animate-pulse" />
          <div className="h-36 rounded-2xl border border-zinc-900 bg-zinc-900/20 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
