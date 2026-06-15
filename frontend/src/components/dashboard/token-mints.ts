import { getNetworkByEndpoint, type ClusterKey } from "@/lib/solana/network-config";

export type { ClusterKey };

export type MintPreset = {
  label: string;
  mint: string;
  decimals: number;
  logoURI: string;
  accent: string;
  note: string;
};

const WSOL_MINT = "So11111111111111111111111111111111111111112";

const SOLANA_TOKEN_LIST_BASE = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet";

const DEVNET_MINT_PRESETS: MintPreset[] = [
  {
    label: "USDC",
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    decimals: 6,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
    accent: "#2775CA",
    note: "Official devnet USDC mint.",
  },
  {
    label: "Wrapped SOL",
    mint: WSOL_MINT,
    decimals: 9,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/So11111111111111111111111111111111111111112/logo.png`,
    accent: "#9945FF",
    note: "Native mint for wrapped SOL.",
  },
];

const MAINNET_MINT_PRESETS: MintPreset[] = [
  {
    label: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
    accent: "#2775CA",
    note: "Circle's mainnet USDC mint.",
  },
  {
    label: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png`,
    accent: "#26A17B",
    note: "Tether's mainnet USDT mint.",
  },
  {
    label: "PYUSD",
    mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    decimals: 6,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo/logo.png`,
    accent: "#111827",
    note: "PayPal's mainnet PYUSD mint.",
  },
  {
    label: "USDG",
    mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    decimals: 6,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH/logo.png`,
    accent: "#0f766e",
    note: "Paxos' mainnet USDG mint.",
  },
  {
    label: "Wrapped SOL",
    mint: WSOL_MINT,
    decimals: 9,
    logoURI: `${SOLANA_TOKEN_LIST_BASE}/So11111111111111111111111111111111111111112/logo.png`,
    accent: "#9945FF",
    note: "Native mint for wrapped SOL.",
  },
];

export function getClusterKey(endpoint: string): ClusterKey | null {
  return getNetworkByEndpoint(endpoint)?.cluster ?? null;
}

export function getClusterLabel(endpoint: string) {
  const cluster = getClusterKey(endpoint);
  if (!cluster) return "current network";
  return cluster;
}

export function getMintPresets(endpoint: string): MintPreset[] {
  const cluster = getClusterKey(endpoint);
  if (cluster === "mainnet") return MAINNET_MINT_PRESETS;
  return DEVNET_MINT_PRESETS;
}

export function getDefaultMint(endpoint: string) {
  return getMintPresets(endpoint)[0]?.mint ?? WSOL_MINT;
}

export function buildCreateStreamCsvTemplate(endpoint: string) {
  const defaultMint = getDefaultMint(endpoint);
  const cluster = getClusterKey(endpoint);
  // The prefilled recipient is a devnet test wallet. On mainnet/testnet use a
  // clear placeholder so a test address is never streamed to by accident — the
  // user must replace it (CSV validation will flag it until they do).
  const recipient =
    cluster === "devnet" || cluster === null
      ? "AoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY"
      : "RECIPIENT_WALLET_ADDRESS";

  return [
    "recipient,amount,mint,type,duration,cliff_duration,milestones",
    `${recipient},2,${defaultMint},0,7200,0,`,
    `${recipient},2,${defaultMint},1,15000,3600,`,
    `${recipient},2,${defaultMint},2,9000,0,0.5,0.5,0.5,0.5`,
  ].join("\n");
}
