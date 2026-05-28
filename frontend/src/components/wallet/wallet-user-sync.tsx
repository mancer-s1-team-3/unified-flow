"use client";

import { useEffect, useRef } from "react";
import { useWalletConnection, useDisconnectWallet, useConnectWallet } from "@solana/react-hooks";
import { useNotifications } from "@/lib/notification-context";
import { upsertUser } from "@/lib/api";

interface InjectedWalletProvider {
  on(event: string, handler: (newAddress: string | undefined) => void): void;
  off(event: string, handler: (newAddress: string | undefined) => void): void;
}

function getInjectedProviders(): InjectedWalletProvider[] {
  if (typeof window === "undefined") return [];
  const providers: InjectedWalletProvider[] = [];
  if ((window as any).solana?.on) providers.push((window as any).solana);
  if ((window as any).solflare?.on) providers.push((window as any).solflare);
  return providers;
}

export function WalletUserSync() {
  const { connected, wallet, connectorId } = useWalletConnection();
  const disconnect = useDisconnectWallet();
  const connect = useConnectWallet();
  const { addNotification } = useNotifications();
  const lastSyncedAddress = useRef<string | null>(null);
  const connectorIdRef = useRef<string | null>(null);

  useEffect(() => {
    connectorIdRef.current = connectorId ?? null;
  }, [connectorId]);

  // Upsert user record on wallet connect
  useEffect(() => {
    if (!connected) return;

    const address = wallet?.account.address ? String(wallet.account.address) : null;
    if (!address || address === lastSyncedAddress.current) return;

    lastSyncedAddress.current = address;
    upsertUser(address).catch(() => {});
  }, [connected, wallet?.account.address]);

  // Detect account switch in wallet extension → auto re-connect to new account
  useEffect(() => {
    if (!connected) return;

    const currentAddress = wallet?.account.address ? String(wallet.account.address) : null;

    const handleAccountChanged = async (newAddress: string | undefined) => {
      // newAddress may be a PublicKey object — always use .toString()
      const next = newAddress != null ? newAddress.toString() : null;
      if (!next || next === currentAddress) return;

      const cId = connectorIdRef.current;
      if (!cId) return;

      addNotification({
        type: "info",
        title: "Wallet account switched",
        message: "Switching to your new wallet account...",
        duration: 3000,
      });

      lastSyncedAddress.current = null;

      // Disconnect first, wait for Phantom to finalize the switch,
      // then reconnect silently using the same connector.
      await disconnect();
      await new Promise((r) => setTimeout(r, 200));
      await connect(cId, { autoConnect: true, allowInteractiveFallback: false } as any);
    };

    const providers = getInjectedProviders();
    providers.forEach((p) => p.on("accountChanged", handleAccountChanged));
    return () => providers.forEach((p) => p.off("accountChanged", handleAccountChanged));
  }, [connected, wallet?.account.address, disconnect, connect, addNotification]);

  return null;
}
