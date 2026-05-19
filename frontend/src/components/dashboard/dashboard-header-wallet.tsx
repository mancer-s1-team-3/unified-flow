"use client";

import { useState } from "react";

function ConnectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-400"
    >
      Connect Wallet
    </button>
  );
}

export function DashboardHeaderWallet() {
  const [WalletIsland, setWalletIsland] = useState<null | React.ComponentType>(null);

  const loadWalletIsland = async () => {
    if (!WalletIsland) {
      const mod = await import("@/components/wallet/wallet-header-island");
      setWalletIsland(() => mod.WalletHeaderIsland);
      return;
    }
  };

  if (WalletIsland) {
    return <WalletIsland />;
  }

  return <ConnectButton onClick={loadWalletIsland} />;
}
