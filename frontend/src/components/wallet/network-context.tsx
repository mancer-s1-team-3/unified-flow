"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CLUSTER,
  ENABLED_CLUSTERS,
  getNetwork,
  isClusterEnabled,
  type ClusterKey,
  type NetworkConfig,
} from "@/lib/solana/network-config";
import { setApiBaseUrl } from "@/lib/api";

const STORAGE_KEY = "uf:active-cluster";

type NetworkContextValue = {
  cluster: ClusterKey;
  network: NetworkConfig;
  enabledClusters: ClusterKey[];
  setCluster: (cluster: ClusterKey) => void;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

function readStoredCluster(): ClusterKey {
  if (typeof window === "undefined") return DEFAULT_CLUSTER;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isClusterEnabled(stored as ClusterKey)) {
      return stored as ClusterKey;
    }
  } catch {
    // localStorage may be unavailable (SSR, privacy mode) — ignore.
  }
  return DEFAULT_CLUSTER;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [cluster, setClusterState] = useState<ClusterKey>(DEFAULT_CLUSTER);

  useEffect(() => {
    const initial = readStoredCluster();
    if (initial !== cluster) {
      setClusterState(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setApiBaseUrl(getNetwork(cluster).apiBaseUrl);
  }, [cluster]);

  const setCluster = useCallback((next: ClusterKey) => {
    if (!isClusterEnabled(next)) {
      throw new Error(`Cluster "${next}" is not enabled.`);
    }
    setClusterState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort persistence
    }
  }, []);

  const value = useMemo<NetworkContextValue>(
    () => ({
      cluster,
      network: getNetwork(cluster),
      enabledClusters: ENABLED_CLUSTERS,
      setCluster,
    }),
    [cluster, setCluster],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork must be used inside a NetworkProvider.");
  }
  return ctx;
}
