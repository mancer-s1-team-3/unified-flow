// src/lib/useUnifiedFlowClient.ts
"use client";

import { useMemo } from "react";
import { useWalletConnection, useClusterState } from "@solana/react-hooks";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { IDL, UnifiedFlowClient, getAnchorWallet } from "@unifiedflow/unified-flow-sdk";
import { Connection } from "@solana/web3.js";
import type { WalletSession } from "@solana/client";



export function useUnifiedFlowClient() {
  const { wallet, connected } = useWalletConnection();
  const { endpoint } = useClusterState();

  return useMemo(() => {
    if (!connected || !wallet?.account?.address) return null;

    const connection = new Connection(endpoint, "confirmed");
    const provider = new AnchorProvider(
      connection,
      getAnchorWallet(wallet as WalletSession),
      { commitment: "confirmed" }
    );
    const program = new Program(IDL, provider) as any;
    return new UnifiedFlowClient(program, wallet as WalletSession, connection);
  }, [connected, wallet?.account?.address, endpoint]);
}