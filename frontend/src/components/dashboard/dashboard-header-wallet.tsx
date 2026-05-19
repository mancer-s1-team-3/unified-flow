"use client";

import dynamic from "next/dynamic";

const WalletPickerButton = dynamic(
  () => import("@/components/wallet/wallet-picker-button").then((mod) => mod.WalletPickerButton),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-400"
      >
        Connect Wallet
      </button>
    ),
  }
);

export function DashboardHeaderWallet() {
  return <WalletPickerButton />;
}
