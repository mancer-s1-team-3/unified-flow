import { PublicKey } from "@solana/web3.js";

export type ClusterKey = "devnet" | "mainnet" | "testnet";

export type ClusterVisibility = "enable" | "disable" | "hide";

export type NetworkConfig = {
  cluster: ClusterKey;
  label: string;
  rpc: string;
  wsRpc?: string;
  programId: string;
  apiBaseUrl: string;
  explorerCluster: "devnet" | "testnet" | "mainnet-beta";
};

const CLUSTER_KEYS = ["devnet", "mainnet", "testnet"] as const;

export const ALL_CLUSTERS: ClusterKey[] = [...CLUSTER_KEYS];

const LABELS: Record<ClusterKey, string> = {
  devnet: "Devnet",
  mainnet: "Mainnet",
  testnet: "Testnet",
};

const EXPLORER_CLUSTERS: Record<ClusterKey, NetworkConfig["explorerCluster"]> = {
  devnet: "devnet",
  testnet: "testnet",
  mainnet: "mainnet-beta",
};

type RawClusterEnv = {
  visibility: string | undefined;
  rpc: string | undefined;
  wsRpc: string | undefined;
  programId: string | undefined;
  apiBaseUrl: string | undefined;
};

// Next.js only inlines NEXT_PUBLIC_* vars when accessed as a literal property —
// dynamic lookups like process.env[`NEXT_PUBLIC_${x}`] return undefined in the
// client bundle. Each var must be referenced statically below.
const RAW_ENV: Record<ClusterKey, RawClusterEnv> = {
  devnet: {
    visibility: process.env.NEXT_PUBLIC_DEVNET_VISIBILITY,
    rpc: process.env.NEXT_PUBLIC_DEVNET_RPC,
    wsRpc: process.env.NEXT_PUBLIC_DEVNET_WS_RPC,
    programId: process.env.NEXT_PUBLIC_DEVNET_PROGRAM_ID,
    apiBaseUrl: process.env.NEXT_PUBLIC_DEVNET_API,
  },
  mainnet: {
    visibility: process.env.NEXT_PUBLIC_MAINNET_VISIBILITY,
    rpc: process.env.NEXT_PUBLIC_MAINNET_RPC,
    wsRpc: process.env.NEXT_PUBLIC_MAINNET_WS_RPC,
    programId: process.env.NEXT_PUBLIC_MAINNET_PROGRAM_ID,
    apiBaseUrl: process.env.NEXT_PUBLIC_MAINNET_API,
  },
  testnet: {
    visibility: process.env.NEXT_PUBLIC_TESTNET_VISIBILITY,
    rpc: process.env.NEXT_PUBLIC_TESTNET_RPC,
    wsRpc: process.env.NEXT_PUBLIC_TESTNET_WS_RPC,
    programId: process.env.NEXT_PUBLIC_TESTNET_PROGRAM_ID,
    apiBaseUrl: process.env.NEXT_PUBLIC_TESTNET_API,
  },
};

function parseVisibility(raw: string | undefined, cluster: ClusterKey): ClusterVisibility {
  const normalized = (raw ?? "hide").trim().toLowerCase();
  if (normalized === "enable" || normalized === "disable" || normalized === "hide") {
    return normalized;
  }
  throw new Error(
    `[network-config] Invalid NEXT_PUBLIC_${cluster.toUpperCase()}_VISIBILITY="${raw}". ` +
    `Expected "enable", "disable", or "hide".`,
  );
}

const VISIBILITIES: Record<ClusterKey, ClusterVisibility> = {
  devnet: parseVisibility(RAW_ENV.devnet.visibility, "devnet"),
  mainnet: parseVisibility(RAW_ENV.mainnet.visibility, "mainnet"),
  testnet: parseVisibility(RAW_ENV.testnet.visibility, "testnet"),
};

export function getClusterVisibility(cluster: ClusterKey): ClusterVisibility {
  return VISIBILITIES[cluster];
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function requireField(
  value: string | undefined,
  envKey: string,
  cluster: ClusterKey,
): string {
  const v = nonEmpty(value);
  if (!v) {
    throw new Error(
      `[network-config] Missing required env "${envKey}" for enabled cluster "${cluster}". ` +
      `Set it or change NEXT_PUBLIC_${cluster.toUpperCase()}_VISIBILITY to "disable" or "hide".`,
    );
  }
  return v;
}

function validatePubkey(value: string, key: string): string {
  try {
    new PublicKey(value);
    return value;
  } catch {
    throw new Error(`[network-config] Invalid Solana public key in "${key}": ${value}`);
  }
}

function buildNetworkConfig(cluster: ClusterKey): NetworkConfig | null {
  if (VISIBILITIES[cluster] !== "enable") return null;

  const raw = RAW_ENV[cluster];
  const upper = cluster.toUpperCase();
  const programIdKey = `NEXT_PUBLIC_${upper}_PROGRAM_ID`;
  return {
    cluster,
    label: LABELS[cluster],
    rpc: requireField(raw.rpc, `NEXT_PUBLIC_${upper}_RPC`, cluster),
    wsRpc: nonEmpty(raw.wsRpc),
    programId: validatePubkey(requireField(raw.programId, programIdKey, cluster), programIdKey),
    apiBaseUrl: requireField(raw.apiBaseUrl, `NEXT_PUBLIC_${upper}_API`, cluster),
    explorerCluster: EXPLORER_CLUSTERS[cluster],
  };
}

export const NETWORKS: Record<ClusterKey, NetworkConfig | null> = {
  devnet: buildNetworkConfig("devnet"),
  mainnet: buildNetworkConfig("mainnet"),
  testnet: buildNetworkConfig("testnet"),
};

export const ENABLED_CLUSTERS: ClusterKey[] = CLUSTER_KEYS.filter(
  (cluster) => NETWORKS[cluster] !== null,
);

export const VISIBLE_CLUSTERS: ClusterKey[] = CLUSTER_KEYS.filter(
  (cluster) => VISIBILITIES[cluster] !== "hide",
);

function resolveDefaultCluster(): ClusterKey {
  if (ENABLED_CLUSTERS.length === 0) {
    throw new Error(
      "[network-config] No clusters enabled. Set at least one NEXT_PUBLIC_<CLUSTER>_VISIBILITY=enable.",
    );
  }

  const raw = nonEmpty(process.env.NEXT_PUBLIC_DEFAULT_CLUSTER);
  if (!raw) return ENABLED_CLUSTERS[0];

  if (!CLUSTER_KEYS.includes(raw as ClusterKey)) {
    throw new Error(
      `[network-config] NEXT_PUBLIC_DEFAULT_CLUSTER="${raw}" is not a valid cluster (devnet | mainnet | testnet).`,
    );
  }

  const cluster = raw as ClusterKey;
  if (NETWORKS[cluster] === null) {
    throw new Error(
      `[network-config] NEXT_PUBLIC_DEFAULT_CLUSTER="${cluster}" is set but the cluster is not enabled. ` +
      `Set NEXT_PUBLIC_${cluster.toUpperCase()}_VISIBILITY=enable or pick a different default.`,
    );
  }
  return cluster;
}

export const DEFAULT_CLUSTER: ClusterKey = resolveDefaultCluster();

export function getNetwork(cluster: ClusterKey): NetworkConfig {
  const config = NETWORKS[cluster];
  if (!config) {
    throw new Error(`[network-config] Cluster "${cluster}" is not enabled.`);
  }
  return config;
}

export function getActiveNetwork(): NetworkConfig {
  return getNetwork(DEFAULT_CLUSTER);
}

export function isClusterEnabled(cluster: ClusterKey): boolean {
  return NETWORKS[cluster] !== null;
}

function inferClusterFromEndpointString(endpoint: string): ClusterKey | null {
  const normalized = endpoint.toLowerCase();
  if (normalized.includes("mainnet")) return "mainnet";
  if (normalized.includes("testnet")) return "testnet";
  if (normalized.includes("devnet")) return "devnet";
  return null;
}

export function getNetworkByEndpoint(endpoint: string): NetworkConfig | null {
  for (const cluster of CLUSTER_KEYS) {
    const config = NETWORKS[cluster];
    if (config && config.rpc === endpoint) return config;
  }
  const inferred = inferClusterFromEndpointString(endpoint);
  if (inferred) return NETWORKS[inferred];
  return null;
}

export function getProgramIdForEndpoint(endpoint: string): PublicKey {
  const network = getNetworkByEndpoint(endpoint) ?? getActiveNetwork();
  return new PublicKey(network.programId);
}

export function getExplorerClusterParam(endpoint: string): string {
  const network = getNetworkByEndpoint(endpoint);
  if (network) return network.explorerCluster;

  const inferred = inferClusterFromEndpointString(endpoint);
  if (inferred) return EXPLORER_CLUSTERS[inferred];
  return "custom";
}
