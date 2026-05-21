import { GuidePage } from "../_components/guide-page";
import { getGuideLang } from "../guide-data";

export default async function ConnectWalletPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  return (
    <GuidePage
      title={lang === "id" ? "Hubungkan wallet" : "Connect your wallet"}
      intro={
        lang === "id"
          ? "Kamu butuh wallet saat ingin menandatangani aksi di aplikasi. Menjelajah tetap bisa tanpa wallet."
          : "You need a wallet when you want to sign actions in the app. Browsing still works without one."
      }
      lang={lang}
      toc={[
        {
          id: "before-you-start",
          label: lang === "id" ? "Sebelum mulai" : "Before you start",
        },
        {
          id: "what-it-is-for",
          label: lang === "id" ? "Untuk apa wallet" : "What the wallet is for",
        },
      ]}
    >
      <div className="space-y-6">
        <section
          id="before-you-start"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {lang === "id" ? "Sebelum mulai" : "Before you start"}
          </h3>
          <ol className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-decimal list-inside">
            {lang === "id" ? (
              <>
                <li>Klik tombol wallet di pojok kanan atas.</li>
                <li>Pilih wallet kamu lalu setujui koneksinya.</li>
                <li>
                  Cek alamat yang tampil di aplikasi sebelum menandatangani apa
                  pun.
                </li>
              </>
            ) : (
              <>
                <li>Click the wallet button in the top-right corner.</li>
                <li>Pick your wallet and approve the connection.</li>
                <li>
                  Check the address shown in the app before signing anything.
                </li>
              </>
            )}
          </ol>
        </section>

        <section
          id="what-it-is-for"
          className="grid gap-4 md:grid-cols-3 scroll-mt-6"
        >
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 md:col-span-3">
            <p className="text-sm text-zinc-400 leading-relaxed">
              {lang === "id"
                ? "Aplikasi memakai wallet yang terhubung untuk menentukan aksi yang tersedia, seperti membuat stream, menarik token, atau membatalkan."
                : "The app uses your connected wallet to decide which actions are available, like creating a stream, withdrawing, or cancelling."}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 md:col-span-3">
            <h3 className="text-sm font-semibold text-cyan-100">
              {lang === "id"
                ? "Di browser iPhone atau Android"
                : "On iPhone or Android browsers"}
            </h3>
            <p className="mt-2 text-sm text-cyan-100/80 leading-relaxed">
              {lang === "id"
                ? "Kalau daftar wallet kosong, buka situs ini lewat browser di aplikasi wallet dulu. Phantom dan Solflare biasanya menampilkan wallet dengan lebih baik di sana dibanding Safari atau Chrome."
                : "If the wallet list is empty, open the site in your wallet app browser first. Phantom and Solflare expose the wallet more reliably there than in Safari or Chrome."}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 md:col-span-3">
            <ul className="space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
              {lang === "id" ? (
                <>
                  <li>Kamu tetap bisa menjelajah tanpa koneksi wallet.</li>
                  <li>Kamu hanya butuh wallet saat ingin menandatangani.</li>
                  <li>
                    Wallet yang terhubung harus cocok dengan aksi yang ingin
                    kamu lakukan.
                  </li>
                </>
              ) : (
                <>
                  <li>You can still browse without connecting.</li>
                  <li>You only need a wallet when you want to sign.</li>
                  <li>
                    The connected wallet must match the action you are trying to
                    take.
                  </li>
                </>
              )}
            </ul>
          </div>
        </section>
      </div>
    </GuidePage>
  );
}
