"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { WalletConnectWalletAdapter } from "@walletconnect/solana-adapter";
import { WalletPickerButton } from "@/components/wallet/wallet-picker-button";

export function WalletHeaderIsland() {
  const endpoint = process.env.NEXT_PUBLIC_RPC!;

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
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletPickerButton />
      </WalletProvider>
    </ConnectionProvider>
  );
}
