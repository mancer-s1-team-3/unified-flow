export type GuideLang = "en" | "id";

export type GuideText = {
  en: string;
  id: string;
};

export type GuideItem = {
  href: string;
  label: GuideText;
};

export type GuideGroup = {
  title: GuideText;
  items: GuideItem[];
};

export type GuidePageCard = {
  href: string;
  title: GuideText;
  summary: GuideText;
};

export const guideGroups: GuideGroup[] = [
  {
    title: { en: "Basics", id: "Dasar" },
    items: [
      {
        href: "/guide/about-unified-flow",
        label: { en: "Before you start", id: "Sebelum mulai" },
      },
      {
        href: "/guide/why-trust-unified-flow",
        label: { en: "Check your setup", id: "Cek setup" },
      },
      {
        href: "/guide/what-is-vesting",
        label: { en: "What is vesting?", id: "Apa itu vesting?" },
      },
      {
        href: "/guide/connect-wallet",
        label: { en: "Connect your wallet", id: "Hubungkan wallet" },
      },
    ],
  },
  {
    title: { en: "Using the app", id: "Memakai aplikasi" },
    items: [
      {
        href: "/guide/create-stream",
        label: { en: "Create a stream", id: "Buat stream" },
      },
      {
        href: "/guide/receive-tokens",
        label: { en: "Receive tokens", id: "Terima token" },
      },
      {
        href: "/guide/manage-streams",
        label: { en: "Manage streams", id: "Kelola stream" },
      },
    ],
  },
  {
    title: { en: "Support", id: "Bantuan" },
    items: [{ href: "/guide/faq", label: { en: "FAQ", id: "FAQ" } }],
  },
] as const;

export const guidePages: GuidePageCard[] = [
  {
    href: "/guide/about-unified-flow",
    title: { en: "Before you start", id: "Sebelum mulai" },
    summary: {
      en: "Get ready before you create or manage a stream.",
      id: "Siapkan dulu sebelum membuat atau mengelola stream.",
    },
  },
  {
    href: "/guide/why-trust-unified-flow",
    title: { en: "Check your setup", id: "Cek setup" },
    summary: {
      en: "A quick checklist before you move on.",
      id: "Checklist singkat sebelum lanjut.",
    },
  },
  {
    href: "/guide/what-is-vesting",
    title: { en: "What is vesting?", id: "Apa itu vesting?" },
    summary: {
      en: "A simple explanation of how tokens are released over time.",
      id: "Penjelasan sederhana tentang bagaimana token dilepas bertahap.",
    },
  },
  {
    href: "/guide/connect-wallet",
    title: { en: "Connect your wallet", id: "Hubungkan wallet" },
    summary: {
      en: "How to connect a Solana wallet before signing anything.",
      id: "Cara menghubungkan wallet Solana sebelum menandatangani apa pun.",
    },
  },
  {
    href: "/guide/create-stream",
    title: { en: "Create a stream", id: "Buat stream" },
    summary: {
      en: "The shortest path from idea to a live vesting stream.",
      id: "Langkah paling singkat dari ide sampai stream vesting aktif.",
    },
  },
  {
    href: "/guide/receive-tokens",
    title: { en: "Receive tokens", id: "Terima token" },
    summary: {
      en: "How recipients check balances and claim when ready.",
      id: "Cara penerima mengecek saldo dan klaim saat sudah siap.",
    },
  },
  {
    href: "/guide/manage-streams",
    title: { en: "Manage streams", id: "Kelola stream" },
    summary: {
      en: "What creators can do after a stream is live.",
      id: "Apa yang bisa dilakukan creator setelah stream aktif.",
    },
  },
  {
    href: "/guide/faq",
    title: { en: "FAQ", id: "FAQ" },
    summary: {
      en: "Short answers to the most common questions.",
      id: "Jawaban singkat untuk pertanyaan yang paling sering muncul.",
    },
  },
] as const;

export function getGuideLang(lang?: string): GuideLang {
  return lang === "id" ? "id" : "en";
}

export function textByLang(text: GuideText, lang: GuideLang) {
  return text[lang];
}

export function withGuideLang(href: string, lang: GuideLang) {
  return lang === "id" ? `${href}?lang=id` : href;
}
