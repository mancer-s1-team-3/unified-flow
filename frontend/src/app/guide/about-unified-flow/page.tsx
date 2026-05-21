import Link from "next/link";
import { GuidePage } from "../_components/guide-page";
import { getGuideLang, withGuideLang } from "../guide-data";

export default async function AboutUnifiedFlowPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  const copy =
    lang === "id"
      ? {
          title: "Sebelum mulai",
          intro:
            "Pakai halaman ini untuk siap dulu sebelum membuat atau mengelola stream.",
          toc: [
            { id: "what-youll-do", label: "Yang akan kamu lakukan" },
            { id: "what-you-need", label: "Yang perlu disiapkan" },
            { id: "next-step", label: "Langkah berikutnya" },
          ],
          whatYoullDo: [
            "Buka guide yang sesuai dengan tugasmu.",
            "Hubungkan wallet kalau kamu akan menandatangani transaksi.",
            "Pilih alur yang sesuai: buat stream, terima token, atau kelola stream.",
          ],
          whatYouNeed: [
            "Wallet yang benar.",
            "Token atau stream yang ingin kamu pakai.",
            "Waktu beberapa menit untuk cek detail sebelum konfirmasi.",
          ],
          next: "Lanjut",
          nextCopy:
            "Kalau kamu ingin memastikan semuanya siap, buka halaman pengecekan dulu.",
          nextCta: "Buka halaman pengecekan",
        }
      : {
          title: "Before you start",
          intro:
            "Use this page to get ready before you create or manage a stream.",
          toc: [
            { id: "what-youll-do", label: "What you will do" },
            { id: "what-you-need", label: "What you need" },
            { id: "next-step", label: "Next step" },
          ],
          whatYoullDo: [
            "Open the guide that matches your task.",
            "Connect your wallet if you plan to sign a transaction.",
            "Pick the flow you need: create a stream, receive tokens, or manage streams.",
          ],
          whatYouNeed: [
            "The correct wallet.",
            "The token or stream you want to work with.",
            "A few minutes to review the details before you confirm.",
          ],
          next: "Next",
          nextCopy:
            "If you want to make sure everything is ready, open the check page first.",
          nextCta: "Open the check page",
        };

  return (
    <GuidePage title={copy.title} intro={copy.intro} toc={copy.toc} lang={lang}>
      <div className="space-y-6">
        <section
          id="what-youll-do"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Yang akan kamu lakukan" : "What you will do"}
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {copy.whatYoullDo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section
          id="what-you-need"
          className="grid gap-4 md:grid-cols-3 scroll-mt-6"
        >
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 md:col-span-3">
            <h3 className="text-lg font-semibold text-zinc-100">
              {lang === "id" ? "Yang perlu disiapkan" : "What you need"}
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
              {copy.whatYouNeed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="next-step"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="font-semibold text-zinc-100">
            {lang === "id" ? "Langkah berikutnya" : "Next step"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {copy.nextCopy}
          </p>
          <Link
            href={withGuideLang("/guide/why-trust-unified-flow", lang)}
            className="mt-3 inline-flex text-sm font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            {copy.nextCta}
          </Link>
        </section>
      </div>
    </GuidePage>
  );
}
