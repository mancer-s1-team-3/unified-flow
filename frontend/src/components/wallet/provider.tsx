"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";

import {
  WalletModalProvider,
} from "@solana/wallet-adapter-react-ui";

import {
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-wallets";



import {
  useMemo,
} from "react";

// src/app/layout.tsx
import "@solana/wallet-adapter-react-ui/styles.css";

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
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}