"use client";

import { useEffect, useRef } from "react";
import { useWalletConnection } from "@solana/react-hooks";
import { upsertUser } from "@/lib/api";

export function WalletUserSync() {
  const { connected, wallet } = useWalletConnection();
  const lastSyncedAddress = useRef<string | null>(null);

  useEffect(() => {
    if (!connected) return;

    const address = wallet?.account.address ? String(wallet.account.address) : null;
    if (!address || address === lastSyncedAddress.current) return;

    lastSyncedAddress.current = address;
    upsertUser(address).catch(() => {});
  }, [connected, wallet?.account.address]);

  return null;
}
