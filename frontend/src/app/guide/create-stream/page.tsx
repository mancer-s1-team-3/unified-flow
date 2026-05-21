import { GuidePage } from "../_components/guide-page";
import { getGuideLang } from "../guide-data";

export default async function CreateStreamPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <GuidePage
      title={lang === "id" ? "Buat stream" : "Create a stream"}
      intro={
        lang === "id"
          ? "Buat stream saat kamu ingin token terbuka nanti dengan cara yang sederhana dan mudah diprediksi."
          : "Create a stream when you want tokens to unlock later in a simple and predictable way."
      }
      lang={lang}
      toc={[
        {
          id: "preview",
          label: lang === "id" ? "Tampilan" : "Preview",
        },
        {
          id: "choose-type",
          label:
            lang === "id" ? "Pilih jenis stream" : "Choose the stream type",
        },
        {
          id: "fill-details",
          label: lang === "id" ? "Isi detailnya" : "Fill in the details",
        },
        {
          id: "review",
          label: lang === "id" ? "Cek sebelum kirim" : "Review before sending",
        },
      ]}
    >
      <div className="space-y-6">
        <section
          id="preview"
          className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5 scroll-mt-6"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">
                {lang === "id" ? "Tampilan form" : "Form preview"}
              </h3>
              <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                {lang === "id"
                  ? "Gambaran singkat layar saat kamu membuat stream baru."
                  : "A quick view of the screen you fill out when creating a new stream."}
              </p>
            </div>
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300">
              {lang === "id" ? "Screenshot" : "Screenshot"}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-inner shadow-black/20">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    {lang === "id" ? "Buat stream" : "Create stream"}
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-zinc-100">
                    {lang === "id"
                      ? "Isi detail pengiriman"
                      : "Fill in delivery details"}
                  </h4>
                </div>
                <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                  3 {lang === "id" ? "langkah" : "steps"}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {lang === "id" ? "Penerima" : "Recipient"}
                  </p>
                  <p className="mt-2 font-mono text-sm text-zinc-200 break-all">
                    8r4V...3kLm
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {lang === "id" ? "Token" : "Token"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-200">USDC</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {lang === "id" ? "Jumlah" : "Amount"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-200">10,000</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {lang === "id" ? "Tipe" : "Type"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-200">Linear</p>
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {lang === "id" ? "Jadwal" : "Schedule"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-200">
                    12 months, 3 month cliff
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
                {lang === "id" ? "Ringkasan" : "Summary"}
              </p>
              <div className="mt-3 space-y-3 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/50 px-3 py-2">
                  <span>{lang === "id" ? "Penerima" : "Recipient"}</span>
                  <span className="font-mono text-xs text-zinc-400">
                    8r4V...3kLm
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/50 px-3 py-2">
                  <span>{lang === "id" ? "Token" : "Token"}</span>
                  <span>USDC</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/50 px-3 py-2">
                  <span>{lang === "id" ? "Mulai" : "Start"}</span>
                  <span>Apr 1, 2026</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/50 px-3 py-2">
                  <span>{lang === "id" ? "Selesai" : "End"}</span>
                  <span>Mar 31, 2027</span>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-300">
                {lang === "id"
                  ? "Sebelum kirim, cek sekali lagi alamat dan jadwalnya."
                  : "Before sending, double-check the recipient and schedule."}
              </div>
            </div>
          </div>
        </section>

        <section
          id="choose-type"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Pilih jenis stream" : "Choose the stream type"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Linear berjalan stabil, Cliff menunggu sampai tanggal tertentu, dan Milestone terbuka bertahap."
              : "Linear is steady, Cliff waits until a date, and Milestone unlocks in steps."}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {lang === "id" ? (
              <>
                <li>
                  Pilih Linear kalau kamu mau token terbuka pelan-pelan dari
                  awal sampai akhir.
                </li>
                <li>
                  Pilih Cliff kalau token harus menunggu sampai tanggal tertentu
                  dulu.
                </li>
                <li>
                  Pilih Milestone kalau pelepasan token mengikuti target kerja
                  atau target produk.
                </li>
              </>
            ) : (
              <>
                <li>
                  Choose Linear if you want tokens to unlock gradually from
                  start to finish.
                </li>
                <li>
                  Choose Cliff if the tokens should wait until a specific date.
                </li>
                <li>
                  Choose Milestone if releases should follow work or product
                  milestones.
                </li>
              </>
            )}
          </ul>
        </section>

        <section
          id="fill-details"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Isi detailnya" : "Fill in the details"}
          </h3>
          <ol className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-decimal list-inside">
            {lang === "id" ? (
              <>
                <li>
                  Masukkan alamat penerima. Pastikan tidak ada karakter yang
                  salah.
                </li>
                <li>
                  Pilih token mint yang benar, terutama kalau ada beberapa versi
                  token.
                </li>
                <li>
                  Tentukan jumlah, tanggal mulai, cliff, dan durasi vesting.
                </li>
                <li>
                  Kalau pakai milestone, cek totalnya satu per satu supaya hasil
                  akhirnya pas.
                </li>
              </>
            ) : (
              <>
                <li>
                  Enter the recipient address. Make sure there are no stray
                  characters.
                </li>
                <li>
                  Choose the right token mint, especially if there are multiple
                  token versions.
                </li>
                <li>
                  Set the amount, start date, cliff, and vesting duration.
                </li>
                <li>
                  If you use milestones, check each amount so the final total is
                  exact.
                </li>
              </>
            )}
          </ol>
        </section>

        <section
          id="review"
          className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6"
        >
          <h3 className="font-semibold text-zinc-100">
            {lang === "id" ? "Cek sebelum kirim" : "Review before sending"}
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {lang === "id" ? (
              <>
                <li>Baca ulang alamat penerima dan token yang dipilih.</li>
                <li>
                  Cek jadwal, jumlah, dan tipe stream sebelum menandatangani.
                </li>
                <li>
                  Setelah transaksi selesai, stream akan muncul di dashboard dan
                  bisa dicek lagi nanti.
                </li>
              </>
            ) : (
              <>
                <li>
                  Read the recipient address and selected token one more time.
                </li>
                <li>
                  Check the schedule, amount, and stream type before signing.
                </li>
                <li>
                  After the transaction finishes, the stream appears in the
                  dashboard and can be checked later.
                </li>
              </>
            )}
          </ul>
        </section>
      </div>
    </GuidePage>
  );
}
