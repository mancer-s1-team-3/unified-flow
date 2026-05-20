import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ChevronRight, Rocket } from "lucide-react";
import { guideGroups } from "./guide-data";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[360px] bg-gradient-to-b from-cyan-950/20 via-transparent to-transparent pointer-events-none blur-[120px]" />
      <div className="absolute -top-20 right-[-160px] w-[440px] h-[440px] rounded-full bg-indigo-950/20 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-400 text-sm font-medium transition-colors">
            <span className="text-lg">←</span>
            Back to Dashboard
          </Link>

          <div className="hidden md:flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs text-zinc-400">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            Guide
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-zinc-800 bg-zinc-900/35 backdrop-blur-sm p-5 h-fit lg:sticky lg:top-6">
            <div className="mb-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 mb-3">
                <Rocket className="w-3.5 h-3.5" />
                User Guide
              </div>
              <h1 className="text-2xl font-black tracking-tight">Unified Flow</h1>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Simple guides for people who want to use the app, not read the protocol.
              </p>
            </div>

            <nav className="space-y-5">
              {guideGroups.map((group) => (
                <div key={group.title}>
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 transition-colors"
                      >
                        <span>{item.label}</span>
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/45 p-4">
              <p className="text-xs uppercase tracking-wider font-semibold text-zinc-500 mb-2">Quick links</p>
              <div className="space-y-2 text-sm">
                <Link href="/streams" className="block text-zinc-300 hover:text-white transition-colors">
                  Open streams
                </Link>
                <Link href="/docs" className="block text-zinc-300 hover:text-white transition-colors">
                  Developer docs
                </Link>
                <Link href="/skills" className="block text-zinc-300 hover:text-white transition-colors">
                  AI skills
                </Link>
              </div>
            </div>
          </aside>

          <div>{children}</div>
        </section>
      </div>
    </main>
  );
}
