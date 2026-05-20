"use client";

import { useMemo } from "react";
import { autoDiscover, filterByNames } from "@solana/client";
import { SolanaProvider } from "@solana/react-hooks";

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = useMemo(() => {
    const endpoint = process.env.NEXT_PUBLIC_RPC ?? "https://api.devnet.solana.com";
    const websocketEndpoint = process.env.NEXT_PUBLIC_WS_RPC;

    return {
      endpoint,
      ...(websocketEndpoint ? { websocketEndpoint } : {}),
      walletConnectors: autoDiscover({
        filter: filterByNames("phantom", "solflare", "backpack"),
      }),
    };
  }, []);

  return <SolanaProvider config={config}>{children}</SolanaProvider>;
}
