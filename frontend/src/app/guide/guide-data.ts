export const guideGroups = [
  {
    title: "Basics",
    items: [
      { href: "/guide/what-is-vesting", label: "What is vesting?" },
      { href: "/guide/connect-wallet", label: "Connect your wallet" },
    ],
  },
  {
    title: "Using the app",
    items: [
      { href: "/guide/create-stream", label: "Create a stream" },
      { href: "/guide/receive-tokens", label: "Receive tokens" },
      { href: "/guide/manage-streams", label: "Manage streams" },
    ],
  },
  {
    title: "Support",
    items: [{ href: "/guide/faq", label: "FAQ" }],
  },
] as const;

export const guidePages = [
  {
    href: "/guide/what-is-vesting",
    title: "What is vesting?",
    summary: "A simple explanation of how tokens are released over time.",
  },
  {
    href: "/guide/connect-wallet",
    title: "Connect your wallet",
    summary: "How to connect a Solana wallet before signing anything.",
  },
  {
    href: "/guide/create-stream",
    title: "Create a stream",
    summary: "The shortest path from idea to a live vesting stream.",
  },
  {
    href: "/guide/receive-tokens",
    title: "Receive tokens",
    summary: "How recipients check balances and claim when ready.",
  },
  {
    href: "/guide/manage-streams",
    title: "Manage streams",
    summary: "What creators can do after a stream is live.",
  },
  {
    href: "/guide/faq",
    title: "FAQ",
    summary: "Short answers to the most common questions.",
  },
] as const;
