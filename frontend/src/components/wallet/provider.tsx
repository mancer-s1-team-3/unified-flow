"use client";

import { useMemo } from "react";
import { autoDiscover, filterByNames } from "@solana/client";
import { SolanaProvider } from "@solana/react-hooks";
import { NetworkProvider, useNetwork } from "@/components/wallet/network-context";

function SolanaProviderWithNetwork({ children }: { children: React.ReactNode }) {
  const { cluster, network } = useNetwork();

  const config = useMemo(
    () => ({
      endpoint: network.rpc,
      ...(network.wsRpc ? { websocketEndpoint: network.wsRpc } : {}),
      walletConnectors: autoDiscover({
        filter: filterByNames("phantom", "solflare", "backpack"),
      }),
    }),
    [network.rpc, network.wsRpc],
  );

  // Re-mount SolanaProvider on cluster change so the wallet adapter and any
  // downstream useClusterState consumers pick up the new endpoint cleanly.
  return (
    <SolanaProvider key={cluster} config={config}>
      {children}
    </SolanaProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <SolanaProviderWithNetwork>{children}</SolanaProviderWithNetwork>
    </NetworkProvider>
  );
}
