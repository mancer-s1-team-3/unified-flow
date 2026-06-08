// src/lib/useUnifiedFlowClient.ts
"use client";

import { useMemo } from "react";
import { useWalletConnection, useClusterState } from "@solana/react-hooks";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { IDL, UnifiedFlowClient } from "@unifiedflow/unified-flow-sdk";
import { Connection } from "@solana/web3.js";
import type { WalletSession } from "@solana/client";

// Definisikan sendiri — tidak di-export dari SDK
function getAnchorWallet(session: WalletSession) {
  return {
    publicKey: new (require("@solana/web3.js").PublicKey)(session.account.address.toString()),
    signTransaction: async <T extends any>(transaction: T): Promise<T> => {
      if (session.signTransaction) {
        return (await session.signTransaction(transaction as never)) as unknown as T;
      }
      return transaction;
    },
    signAllTransactions: async <T extends any>(transactions: T[]): Promise<T[]> => {
      if (session.signTransaction) {
        return (await Promise.all(
          transactions.map((tx) => session.signTransaction!(tx as never))
        )) as unknown as T[];
      }
      return transactions;
    },
  };
}

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