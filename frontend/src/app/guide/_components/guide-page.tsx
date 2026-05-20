import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

type TocItem = {
  id: string;
  label: string;
};

export function GuidePage({
  title,
  intro,
  toc,
  children,
}: {
  title: string;
  intro: string;
  toc: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-6 lg:space-y-0">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/35 backdrop-blur-sm shadow-2xl shadow-black/30 overflow-hidden">
        <div className="border-b border-zinc-800 px-6 py-6">
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guide" className="hover:text-zinc-300 transition-colors">Guide</Link>
            <span>/</span>
            <span className="text-cyan-300">{title}</span>
          </div>
          <h2 className="text-4xl font-black tracking-tight">{title}</h2>
          <p className="mt-3 text-sm text-zinc-400 max-w-2xl leading-relaxed">{intro}</p>
        </div>

        <div className="px-6 py-6">{children}</div>
      </section>

      <aside className="space-y-6 lg:sticky lg:top-6 h-fit">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-6">
          <h2 className="text-sm font-semibold text-zinc-100 mb-4">On this page</h2>
          <div className="space-y-2 text-sm">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-xl px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/15 to-zinc-900 p-6">
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-cyan-400" />
            More docs
          </h2>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Want the technical reference? Open the developer docs for API, MCP, and CLI details.
          </p>
          <Link
            href="/docs"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          >
            Open developer docs
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </aside>
    </div>
  );
}
