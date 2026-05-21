import Link from "next/link";
import { ArrowLeft, BookOpen, FileText, Shield, Sparkles } from "lucide-react";

type SkillPayload = {
  content: string;
  source?: string;
};

async function fetchSkillDoc(): Promise<SkillPayload> {
  const baseUrl = process.env.NEXT_PUBLIC_API || process.env.API_URL || "http://localhost:3000";

  try {
    const res = await fetch(new URL("/skills", baseUrl).toString(), {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Skills endpoint returned ${res.status}`);
    }

    return await res.json();
  } catch {
    return {
      content:
        "Unable to load backend skill documentation. Set NEXT_PUBLIC_API to your backend base URL and ensure GET /skills is available.",
      source: "backend/skill.md",
    };
  }
}

export default async function SkillsPage() {
  const { content, source } = await fetchSkillDoc();
  const isFallback = content.startsWith("Unable to load backend skill documentation.");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-indigo-950/25 via-transparent to-transparent pointer-events-none blur-[120px]" />
      <div className="absolute -top-20 right-[-120px] w-[420px] h-[420px] rounded-full bg-cyan-950/20 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-indigo-400 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Docs
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Dashboard
          </Link>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 backdrop-blur-sm shadow-2xl shadow-black/30 overflow-hidden">
            <div className="border-b border-zinc-800 px-6 py-5 flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold text-indigo-300 mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Backend-powered skill route
                </div>
                <h1 className="text-3xl font-black tracking-tight">AI Agent Skills</h1>
                <p className="mt-2 text-sm text-zinc-400">
                  Rendered from the backend API so the frontend always shows the latest agent capabilities.
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="font-mono">{source || "backend/skill.md"}</span>
              </div>
            </div>

            <div className="px-6 py-5 border-b border-zinc-800/70 text-xs text-zinc-500 flex flex-wrap gap-x-6 gap-y-2">
              <span>Source: <span className="font-mono text-zinc-300">{source || "backend/skill.md"}</span></span>
              <span>Format: Markdown</span>
              <span>{isFallback ? "Fallback content shown" : "Loaded from backend API"}</span>
            </div>

            <div className="max-h-[72vh] overflow-auto p-6">
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-200">
                {content}
              </pre>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Shield className="w-4 h-4 text-indigo-400" />
                Route Notes
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
                <li>Fetches the markdown from `GET /skills` on the backend.</li>
                <li>Does not read files directly from the frontend workspace anymore.</li>
                <li>Falls back gracefully if the backend URL is not configured.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/20 to-zinc-900 p-6">
              <h2 className="text-sm font-semibold text-zinc-100">Useful Links</h2>
              <div className="mt-4 space-y-3">
                <Link
                  href="/guide"
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  Open user guide
                </Link>
                <Link
                  href="/docs"
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  Open protocol docs
                </Link>
                <Link
                  href="/streams"
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  View streams dashboard
                </Link>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
