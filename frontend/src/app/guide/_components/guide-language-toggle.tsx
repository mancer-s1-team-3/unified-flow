"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function GuideLanguageToggle() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get("lang") === "id" ? "id" : "en";

  const setLang = (nextLang: "en" | "id") => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextLang === "en") {
      params.delete("lang");
    } else {
      params.set("lang", nextLang);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950/60 p-1 text-xs font-semibold text-zinc-400">
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`rounded-full px-3 py-1.5 transition-colors ${lang === "en" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("id")}
        className={`rounded-full px-3 py-1.5 transition-colors ${lang === "id" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}
        aria-pressed={lang === "id"}
      >
        ID
      </button>
    </div>
  );
}
