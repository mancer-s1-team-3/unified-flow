import { GuidePage } from "../_components/guide-page";
import { getGuideLang } from "../guide-data";

export default async function ReceiveTokensPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <GuidePage
      title={lang === "id" ? "Terima token" : "Receive tokens"}
      intro={
        lang === "id"
          ? "Penerima bisa mengecek stream dan mengklaim token saat sudah siap."
          : "Recipients can check their stream and claim tokens once they are ready."
      }
      lang={lang}
      toc={[
        {
          id: "preview",
          label: lang === "id" ? "Tampilan" : "Preview",
        },
        {
          id: "find-stream",
          label: lang === "id" ? "Cari stream kamu" : "Find your stream",
        },
        {
          id: "check-ready",
          label:
            lang === "id"
              ? "Cek apakah sudah siap"
              : "Check whether it is ready",
        },
        {
          id: "claim",
          label: lang === "id" ? "Klaim token" : "Claim the tokens",
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
                {lang === "id" ? "Tampilan klaim" : "Claim preview"}
              </h3>
              <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                {lang === "id"
                  ? "Gambaran layar saat penerima membuka stream mereka."
                  : "A quick view of what recipients see when they open their stream."}
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
                    {lang === "id" ? "Active Streams" : "Active Streams"}
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-zinc-100">
                    1 stream ready
                  </h4>
                </div>
                <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                  {lang === "id" ? "Siap klaim" : "Ready to claim"}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {lang === "id" ? "Stream #2481" : "Stream #2481"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      8r4V...3kLm · USDC
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                    {lang === "id" ? "Tersedia" : "Available"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
                  <div className="rounded-xl bg-zinc-900/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      {lang === "id" ? "Bisa diklaim" : "Claimable"}
                    </p>
                    <p className="mt-2 text-zinc-100">2,450 USDC</p>
                  </div>
                  <div className="rounded-xl bg-zinc-900/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      {lang === "id" ? "Berikutnya" : "Next unlock"}
                    </p>
                    <p className="mt-2 text-zinc-100">Apr 15, 2026</p>
                  </div>
                  <div className="rounded-xl bg-zinc-900/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      {lang === "id" ? "Status" : "Status"}
                    </p>
                    <p className="mt-2 text-zinc-100">
                      {lang === "id" ? "Aktif" : "Active"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
                {lang === "id" ? "Yang muncul di samping" : "Side panel"}
              </p>
              <div className="mt-3 space-y-3 text-sm text-zinc-300">
                <div className="rounded-xl bg-zinc-950/50 px-3 py-2">
                  {lang === "id"
                    ? "Gunakan search untuk cari stream berdasarkan wallet, ID, atau mint."
                    : "Use search to find a stream by wallet, ID, or mint."}
                </div>
                <div className="rounded-xl bg-zinc-950/50 px-3 py-2">
                  {lang === "id"
                    ? "Tombol withdraw baru muncul kalau stream sudah siap dan wallet cocok."
                    : "The withdraw button appears only when the stream is ready and the wallet matches."}
                </div>
                <div className="rounded-xl bg-zinc-950/50 px-3 py-2">
                  {lang === "id"
                    ? "Setelah klaim, riwayat transaksi tetap bisa dicek lagi di kartu stream."
                    : "After claiming, the transaction history stays visible in the stream card."}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="find-stream"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Cari stream kamu" : "Find your stream"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Buka Active Streams dan cari lewat alamat wallet, ID stream, atau mint."
              : "Open Active Streams and search by wallet address, stream ID, or mint."}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {lang === "id" ? (
              <>
                <li>
                  Kalau kamu punya banyak stream, cari dengan ID supaya lebih
                  cepat.
                </li>
                <li>
                  Kalau kamu lupa ID, pakai wallet address yang terhubung.
                </li>
                <li>
                  Kalau ada beberapa token, pilih mint yang sesuai di hasil
                  pencarian.
                </li>
              </>
            ) : (
              <>
                <li>
                  If you have many streams, search by ID first to move faster.
                </li>
                <li>
                  If you do not remember the ID, use the connected wallet
                  address.
                </li>
                <li>
                  If there are multiple tokens, choose the correct mint from the
                  results.
                </li>
              </>
            )}
          </ul>
        </section>

        <section
          id="check-ready"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id"
              ? "Cek apakah sudah siap"
              : "Check whether it is ready"}
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {lang === "id" ? (
              <>
                <li>Buka kartu stream untuk melihat statusnya.</li>
                <li>Lihat jumlah yang sudah bisa diklaim.</li>
                <li>
                  Kalau wallet tidak cocok dengan penerima, tombol withdraw
                  tidak akan muncul.
                </li>
              </>
            ) : (
              <>
                <li>Open the stream card to see the current status.</li>
                <li>Look at the amount available to claim.</li>
                <li>
                  If the wallet does not match the recipient, withdraw will not
                  appear.
                </li>
              </>
            )}
          </ul>
        </section>

        <section
          id="claim"
          className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 scroll-mt-6"
        >
          <h3 className="font-semibold text-zinc-100">
            {lang === "id" ? "Klaim token" : "Claim the tokens"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {lang === "id"
              ? "Saat stream sudah siap, gunakan aksi withdraw lalu konfirmasi transaksinya di wallet kamu."
              : "When the stream is ready, use the withdraw action and confirm the transaction in your wallet."}
          </p>
        </section>
      </div>
    </GuidePage>
  );
}
