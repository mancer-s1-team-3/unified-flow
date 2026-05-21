import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { GuideLanguageToggle } from "./_components/guide-language-toggle";
import { GuideSidebarNav } from "./_components/guide-sidebar-nav";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[360px] bg-gradient-to-b from-cyan-950/20 via-transparent to-transparent pointer-events-none blur-[120px]" />
      <div className="absolute -top-20 right-[-160px] w-[440px] h-[440px] rounded-full bg-indigo-950/20 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-400 text-sm font-medium transition-colors"
          >
            <span className="text-lg">←</span>
            Back to Dashboard
          </Link>

          <Suspense fallback={<div className="h-8 w-24 rounded-full border border-zinc-800 bg-zinc-950/60" />}>
            <div className="flex items-center gap-3">
              <GuideLanguageToggle />
            </div>
          </Suspense>
        </div>

        <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Suspense fallback={<div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-5 h-fit lg:sticky lg:top-6" />}>
            <GuideSidebarNav />
          </Suspense>

          <div>{children}</div>
        </section>
      </div>
    </main>
  );
}
