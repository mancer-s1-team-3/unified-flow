"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";

import {
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-phantom";

import {
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-solflare";

import {
  WalletAdapterNetwork,
} from "@solana/wallet-adapter-base";

import {
  WalletConnectWalletAdapter,
} from "@walletconnect/solana-adapter";



import {
  useMemo,
} from "react";

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const endpoint =
    process.env
      .NEXT_PUBLIC_RPC!;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
      ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
        ? [
            new WalletConnectWalletAdapter({
              network: WalletAdapterNetwork.Devnet,
              options: {
                projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
              },
            }),
          ]
        : []),
    ],
    []
  );

  return (
    <ConnectionProvider
      endpoint={endpoint}
    >
      <WalletProvider
        wallets={wallets}
        autoConnect
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
