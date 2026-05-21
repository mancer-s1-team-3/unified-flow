import { GuidePage } from "../_components/guide-page";
import { getGuideLang } from "../guide-data";

export default async function ManageStreamsPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <GuidePage
      title={lang === "id" ? "Kelola stream" : "Manage streams"}
      intro={
        lang === "id"
          ? "Creator bisa mengelola beberapa stream setelah aktif, tergantung aturannya."
          : "Creators can manage some streams after they go live, depending on the stream rules."
      }
      lang={lang}
      toc={[
        {
          id: "preview",
          label: lang === "id" ? "Tampilan" : "Preview",
        },
        {
          id: "what-you-can-do",
          label: lang === "id" ? "Yang bisa dilakukan" : "What you can do",
        },
        {
          id: "rules",
          label:
            lang === "id" ? "Aturan yang perlu diingat" : "Rules to remember",
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
                {lang === "id" ? "Tampilan pengelolaan" : "Management preview"}
              </h3>
              <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                {lang === "id"
                  ? "Gambaran layar saat creator membuka detail stream mereka."
                  : "A quick view of the screen creators see when they open a stream."}
              </p>
            </div>
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300">
              {lang === "id" ? "Screenshot" : "Screenshot"}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-inner shadow-black/20">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    {lang === "id" ? "Stream #2481" : "Stream #2481"}
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-zinc-100">
                    {lang === "id"
                      ? "Detail dan riwayat"
                      : "Details and history"}
                  </h4>
                </div>
                <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                  {lang === "id" ? "Aktif" : "Active"}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    {lang === "id" ? "Penerima" : "Recipient"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-200 font-mono break-all">
                    8r4V...3kLm
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    {lang === "id" ? "Token" : "Token"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-200">USDC</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    {lang === "id" ? "Sisa" : "Remaining"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-200">7,550 USDC</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  {lang === "id" ? "Riwayat" : "History"}
                </p>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <div className="flex items-center justify-between rounded-lg bg-zinc-900/70 px-3 py-2">
                    <span>{lang === "id" ? "Dibuat" : "Created"}</span>
                    <span className="text-zinc-500">Mar 15, 2026</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-zinc-900/70 px-3 py-2">
                    <span>
                      {lang === "id" ? "Unlock pertama" : "First unlock"}
                    </span>
                    <span className="text-zinc-500">Apr 15, 2026</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-zinc-900/70 px-3 py-2">
                    <span>
                      {lang === "id" ? "Klaim terakhir" : "Last claim"}
                    </span>
                    <span className="text-zinc-500">Apr 15, 2026</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
                {lang === "id" ? "Aksi" : "Actions"}
              </p>
              <div className="mt-3 space-y-3 text-sm text-zinc-300">
                <div className="rounded-xl bg-zinc-950/50 px-3 py-2">
                  {lang === "id"
                    ? "Cancel akan muncul kalau stream memang bisa dibatalkan."
                    : "Cancel appears only if the stream can actually be cancelled."}
                </div>
                <div className="rounded-xl bg-zinc-950/50 px-3 py-2">
                  {lang === "id"
                    ? "Edit hanya tersedia kalau stream masih bisa diubah."
                    : "Edit is only available when the stream is still editable."}
                </div>
                <div className="rounded-xl bg-zinc-950/50 px-3 py-2">
                  {lang === "id"
                    ? "CSV dipakai kalau kamu ingin mengerjakan banyak stream sekaligus."
                    : "CSV tools are for when you need to work on many streams at once."}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="what-you-can-do"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Yang bisa dilakukan" : "What you can do"}
          </h3>
          <ol className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-decimal list-inside">
            {lang === "id" ? (
              <>
                <li>
                  Buka drawer stream untuk melihat detail, status, dan
                  riwayatnya.
                </li>
                <li>
                  Batalkan stream kalau aturannya mengizinkan, biasanya
                  tombolnya ada di area aksi.
                </li>
                <li>
                  Edit stream kalau masih bisa diubah dan belum terkunci penuh.
                </li>
                <li>
                  Pakai alat CSV kalau kamu perlu menangani banyak stream
                  sekaligus.
                </li>
              </>
            ) : (
              <>
                <li>
                  Open the stream drawer to see details, status, and history.
                </li>
                <li>
                  Cancel a stream if the rules allow it, usually from the action
                  area.
                </li>
                <li>
                  Edit a stream if it is still editable and not fully locked.
                </li>
                <li>
                  Use CSV tools if you need to handle many streams at once.
                </li>
              </>
            )}
          </ol>
        </section>

        <section
          id="rules"
          className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6"
        >
          <h3 className="font-semibold text-zinc-100">
            {lang === "id" ? "Aturan yang perlu diingat" : "Rules to remember"}
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {lang === "id" ? (
              <>
                <li>Ada aksi yang hanya bisa dilakukan creator.</li>
                <li>Ada aksi yang hanya bisa dilakukan penerima.</li>
                <li>
                  Stream milestone terbuka satu langkah demi satu langkah, jadi
                  riwayatnya penting untuk dicek.
                </li>
              </>
            ) : (
              <>
                <li>Some actions are creator-only.</li>
                <li>Some actions are recipient-only.</li>
                <li>
                  Milestone streams unlock one step at a time, so the history is
                  worth checking.
                </li>
              </>
            )}
          </ul>
        </section>
      </div>
    </GuidePage>
  );
}
