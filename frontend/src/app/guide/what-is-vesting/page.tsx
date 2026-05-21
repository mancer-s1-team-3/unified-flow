import { GuidePage } from "../_components/guide-page";
import { getGuideLang } from "../guide-data";

export default async function WhatIsVestingPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <GuidePage
      title={lang === "id" ? "Apa itu vesting?" : "What is vesting?"}
      intro={
        lang === "id"
          ? "Vesting adalah cara sederhana untuk melepas token bertahap, bukan sekaligus."
          : "Vesting is a simple way to release tokens over time instead of giving everything at once."
      }
      lang={lang}
      toc={[
        {
          id: "simple-idea",
          label: lang === "id" ? "Gagasan dasarnya" : "The simple idea",
        },
        {
          id: "why-it-feels-simple",
          label: lang === "id" ? "Kenapa terasa mudah" : "Why it feels simple",
        },
        {
          id: "types",
          label: lang === "id" ? "Tiga jenis" : "The three types",
        },
        {
          id: "why-it-matters",
          label: lang === "id" ? "Kenapa penting" : "Why it matters",
        },
      ]}
    >
      <div className="space-y-6">
        <section
          id="simple-idea"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Gagasan dasarnya" : "The simple idea"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Daripada mengirim semua token di hari pertama, vesting membagi pelepasan token ke beberapa waktu supaya terasa terencana dan mudah diprediksi."
              : "Instead of sending all tokens on day one, vesting spreads the release over time so it feels planned and predictable."}
          </p>
        </section>

        <section
          id="why-it-feels-simple"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Kenapa terasa mudah" : "Why it feels simple"}
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {lang === "id" ? (
              <>
                <li>
                  Alurnya cukup dipahami sekali, lalu bisa diulang dengan cara
                  yang sama.
                </li>
                <li>
                  Status dan waktunya terlihat jelas, jadi kamu tidak perlu
                  menebak.
                </li>
                <li>
                  Info penting tetap di satu tempat supaya gampang dicek lagi
                  nanti.
                </li>
              </>
            ) : (
              <>
                <li>
                  You only need to understand the flow once, then repeat it the
                  same way.
                </li>
                <li>
                  Status and timing are visible, so you do not have to guess.
                </li>
                <li>
                  The important details stay in one place so they are easy to
                  check again later.
                </li>
              </>
            )}
          </ul>
        </section>

        <section id="types" className="grid gap-4 md:grid-cols-3 scroll-mt-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
            <h3 className="font-semibold text-zinc-100">Linear</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              {lang === "id"
                ? "Token terbuka perlahan dari awal sampai akhir."
                : "Tokens unlock gradually from start to finish."}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
            <h3 className="font-semibold text-zinc-100">Cliff</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              {lang === "id"
                ? "Token tetap terkunci sampai tanggal yang dipilih."
                : "Tokens stay locked until a chosen date."}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5">
            <h3 className="font-semibold text-zinc-100">Milestone</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              {lang === "id"
                ? "Token terbuka bertahap saat milestone tercapai."
                : "Tokens unlock in stages when milestones are reached."}
            </p>
          </div>
        </section>

        <section
          id="why-it-matters"
          className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6"
        >
          <h3 className="font-semibold text-zinc-100">
            {lang === "id" ? "Kenapa penting" : "Why it matters"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Vesting membantu tim, creator, dan penerima tetap selaras. Proses pelepasan token jadi lebih jelas, adil, dan mudah dipahami."
              : "Vesting helps teams, creators, and recipients stay aligned. It makes token release clear, fair, and easy to understand."}
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
