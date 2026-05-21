import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronRight, Rocket } from "lucide-react";
import {
  guidePages,
  getGuideLang,
  textByLang,
  withGuideLang,
} from "./guide-data";

export default async function GuideIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/35 backdrop-blur-sm shadow-2xl shadow-black/30 overflow-hidden">
        <div className="border-b border-zinc-800 px-6 py-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 mb-4">
            <Rocket className="w-3.5 h-3.5" />
            {lang === "id" ? "Panduan Pengguna" : "User Guide"}
          </div>
          <h2 className="text-4xl font-black tracking-tight">
            {lang === "id" ? "Panduan" : "Guide"}
          </h2>
          <p className="mt-3 text-sm text-zinc-400 max-w-2xl leading-relaxed">
            {lang === "id"
              ? "Pilih topik di bawah. Setiap halaman hanya membahas satu hal, jadi lebih mudah diikuti daripada satu panduan panjang gabungan."
              : "Pick a topic below. Each page covers one thing only, so it is easier to follow than a long combined guide."}
          </p>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
          {guidePages.map((page) => (
            <Link
              key={page.href}
              href={withGuideLang(page.href, lang)}
              className="group rounded-2xl border border-zinc-800 bg-zinc-950/55 p-5 hover:border-cyan-500/30 hover:bg-zinc-950/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-zinc-100 group-hover:text-cyan-300 transition-colors">
                    {textByLang(page.title, lang)}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                    {textByLang(page.summary, lang)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-300 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Link
          href={withGuideLang("/", lang)}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-400 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {lang === "id" ? "Kembali ke Dashboard" : "Back to Dashboard"}
        </Link>

        <Link
          href={withGuideLang("/docs", lang)}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-indigo-400 text-sm font-medium transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          {lang === "id" ? "Docs developer" : "Developer docs"}
        </Link>
      </div>
    </div>
  );
}
