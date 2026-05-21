import Link from "next/link";
import { GuidePage } from "../_components/guide-page";
import { getGuideLang, withGuideLang } from "../guide-data";

export default async function WhyTrustUnifiedFlowPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = getGuideLang(params?.lang);

  const copy =
    lang === "id"
      ? {
          title: "Cek setup",
          intro:
            "Cek beberapa hal dulu supaya kamu tahu apa yang akan terjadi saat mulai memakai aplikasi.",
          toc: [
            { id: "check-list", label: "Checklist" },
            { id: "if-youre-using-it", label: "Kalau mau dipakai" },
            { id: "if-something-is-off", label: "Kalau ada yang tidak cocok" },
          ],
          reasonTitle: "Checklist",
          reasonItems: [
            "Pastikan wallet yang kamu pakai sudah benar.",
            "Pastikan token, recipient, atau stream yang dibuka memang yang kamu cari.",
            "Pastikan kamu sedang berada di halaman yang tepat sebelum menekan tombol apa pun.",
          ],
          checkTitle: "Kalau mau dipakai",
          checkBody:
            "Kalau semuanya sudah benar, lanjutkan ke halaman yang sesuai dengan tugasmu: create, receive, atau manage.",
          signalsTitle: "Yang perlu kamu lihat",
          signals: [
            "Apakah kamu sudah login dengan wallet yang benar.",
            "Apakah data yang ditampilkan cocok dengan yang kamu harapkan.",
            "Apakah tombol aksi yang tersedia memang sesuai dengan peranmu.",
          ],
          expectTitle: "Kalau ada yang tidak cocok",
          expectBody:
            "Kalau sesuatu terlihat salah, jangan lanjut dulu. Kembali ke halaman sebelumnya dan cek ulang wallet, stream, atau token yang dipilih.",
          cta: "Lanjut ke dasar vesting",
        }
      : {
          title: "Check your setup",
          intro:
            "Check a few things first so you know what will happen when you start using the app.",
          toc: [
            { id: "check-list", label: "Checklist" },
            { id: "if-youre-using-it", label: "If you are using it" },
            { id: "if-something-is-off", label: "If something is off" },
          ],
          reasonTitle: "Checklist",
          reasonItems: [
            "Make sure you are connected with the correct wallet.",
            "Make sure the token, recipient, or stream on screen is the one you meant to open.",
            "Make sure you are on the right page before you press any action button.",
          ],
          checkTitle: "If you are using it",
          checkBody:
            "If everything looks right, continue to the page for your task: create, receive, or manage.",
          signalsTitle: "What to look at",
          signals: [
            "Whether you are signed in with the right wallet.",
            "Whether the information on screen matches what you expect.",
            "Whether the available action buttons match your role.",
          ],
          expectTitle: "If something is off",
          expectBody:
            "If something looks wrong, stop there. Go back and check the wallet, stream, or token you selected.",
          cta: "Continue to vesting basics",
        };

  return (
    <GuidePage title={copy.title} intro={copy.intro} toc={copy.toc} lang={lang}>
      <div className="space-y-6">
        <section
          id="check-list"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="text-lg font-semibold text-zinc-100">
            {copy.reasonTitle}
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-400 leading-relaxed list-disc list-inside">
            {copy.reasonItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section
          id="if-youre-using-it"
          className="grid gap-4 md:grid-cols-3 scroll-mt-6"
        >
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 md:col-span-3">
            <h3 className="text-lg font-semibold text-zinc-100">
              {copy.checkTitle}
            </h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              {copy.checkBody}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 md:col-span-3">
            <h3 className="text-sm font-semibold text-cyan-100">
              {copy.signalsTitle}
            </h3>
            <ul className="mt-2 space-y-3 text-sm text-cyan-100/80 leading-relaxed list-disc list-inside">
              {copy.signals.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="if-something-is-off"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-5 scroll-mt-6"
        >
          <h3 className="font-semibold text-zinc-100">{copy.expectTitle}</h3>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            {copy.expectBody}
          </p>
          <Link
            href={withGuideLang("/guide/what-is-vesting", lang)}
            className="mt-3 inline-flex text-sm font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            {copy.cta}
          </Link>
        </section>
      </div>
    </GuidePage>
  );
}
