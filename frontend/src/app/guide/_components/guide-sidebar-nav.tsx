"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Rocket } from "lucide-react";
import { guideGroups, textByLang, withGuideLang } from "../guide-data";

function getLangFromSearch(searchParams: ReturnType<typeof useSearchParams>) {
  return searchParams.get("lang") === "id" ? "id" : "en";
}

export function GuideSidebarNav() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const lang = getLangFromSearch(searchParams);

  return (
    <aside className="rounded-3xl border border-zinc-800 bg-zinc-900/35 backdrop-blur-sm p-5 h-fit lg:sticky lg:top-6">
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 mb-3">
          <Rocket className="w-3.5 h-3.5" />
          {lang === "id" ? "Panduan Pengguna" : "User Guide"}
        </div>
        <h1 className="text-2xl font-black tracking-tight">Unified Flow</h1>
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
          {lang === "id"
            ? "Panduan singkat untuk orang yang mau memakai aplikasi, bukan membaca protokol."
            : "Simple guides for people who want to use the app, not read the protocol."}
        </p>
      </div>

      <nav className="space-y-5">
        {guideGroups.map((group) => (
          <div key={textByLang(group.title, lang)}>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {textByLang(group.title, lang)}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const href = withGuideLang(item.href, lang);
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-zinc-900/80 text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70"
                    }`}
                  >
                    <span>{textByLang(item.label, lang)}</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/45 p-4">
        <p className="text-xs uppercase tracking-wider font-semibold text-zinc-500 mb-2">
          {lang === "id" ? "Tautan cepat" : "Quick links"}
        </p>
        <div className="space-y-2 text-sm">
          <Link
            href={withGuideLang("/streams", lang)}
            className="block text-zinc-300 hover:text-white transition-colors"
          >
            {lang === "id" ? "Buka streams" : "Open streams"}
          </Link>
          <Link
            href={withGuideLang("/docs", lang)}
            className="block text-zinc-300 hover:text-white transition-colors"
          >
            {lang === "id" ? "Docs developer" : "Developer docs"}
          </Link>
          <Link
            href={withGuideLang("/skills", lang)}
            className="block text-zinc-300 hover:text-white transition-colors"
          >
            {lang === "id" ? "Skill AI" : "AI skills"}
          </Link>
        </div>
      </div>
    </aside>
  );
}
