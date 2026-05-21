import { GuidePage } from "../_components/guide-page";
import { getGuideLang } from "../guide-data";

export default async function GuideFaqPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <GuidePage
      title="FAQ"
      intro={
        lang === "id"
          ? "Jawaban singkat untuk pertanyaan yang paling sering muncul saat memakai aplikasi."
          : "Short answers to the most common questions about using the app."
      }
      lang={lang}
      toc={[
        {
          id: "need-wallet",
          label: lang === "id" ? "Perlu wallet?" : "Do I need a wallet?",
        },
        {
          id: "withdraw",
          label:
            lang === "id"
              ? "Kenapa tidak bisa withdraw?"
              : "Why can’t I withdraw?",
        },
        {
          id: "wrong-type",
          label:
            lang === "id"
              ? "Kalau salah pilih tipe?"
              : "What if I choose the wrong type?",
        },
      ]}
    >
      <div className="space-y-6">
        <section
          id="need-wallet"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Perlu wallet?" : "Do I need a wallet?"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Tidak. Kamu bisa menjelajah tanpa menghubungkan wallet. Wallet hanya dibutuhkan saat ingin menandatangani aksi."
              : "No. You can browse without connecting a wallet. You only need one when you want to sign an action."}
          </p>
        </section>

        <section
          id="withdraw"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id"
              ? "Kenapa tidak bisa withdraw?"
              : "Why can’t I withdraw?"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Biasanya karena stream belum siap, atau wallet yang terhubung bukan penerimanya."
              : "Usually the stream is not ready yet, or your connected wallet is not the recipient."}
          </p>
        </section>

        <section
          id="wrong-type"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id"
              ? "Kalau salah pilih tipe?"
              : "What if I choose the wrong type?"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Linear berjalan bertahap, Cliff menunggu tanggal tertentu, dan Milestone terbuka dalam langkah-langkah. Pilih yang sesuai dengan rencanamu."
              : "Linear is gradual, Cliff waits for a date, and Milestone releases in steps. Pick the one that matches your plan."}
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
