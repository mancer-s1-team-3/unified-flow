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

// Resolve a user/LLM-supplied token reference — a symbol like "USDC"/"SOL" or a
// raw mint address — to the correct mint for the *active* cluster. This guards
// the common failure where an assistant emits a well-known mainnet address
// (e.g. USDC `EPjFW…`) while the app is on devnet: we remap it by label to the
// active cluster's equivalent. Unknown addresses pass through untouched so
// on-chain validation can reject genuinely-bad mints.
export function resolveMintInput(input: string, endpoint: string): string {
  const raw = (input ?? "").trim();
  const presets = getMintPresets(endpoint);
  if (!raw) return getDefaultMint(endpoint);

  // 1) Symbol / label match (case-insensitive): "usdc", "wrapped sol", …
  const norm = raw.toLowerCase();
  const bySymbol = presets.find((p) => p.label.toLowerCase() === norm);
  if (bySymbol) return bySymbol.mint;
  if (norm === "sol" || norm === "wsol") {
    const wsol = presets.find((p) => p.mint === WSOL_MINT);
    if (wsol) return wsol.mint;
  }

  // 2) Already a valid preset address for THIS cluster → use as-is.
  if (presets.some((p) => p.mint === raw)) return raw;

  // 3) A known preset address from ANOTHER cluster → remap by label.
  const foreign = [...DEVNET_MINT_PRESETS, ...MAINNET_MINT_PRESETS].find((p) => p.mint === raw);
  if (foreign) {
    const local = presets.find((p) => p.label === foreign.label);
    if (local) return local.mint;
  }

  // 4) Unknown — assume it's a raw mint address; let on-chain validation decide.
  return raw;
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
    `${recipient},2,${defaultMint},2,0,0,0.5,0.5,0.5,0.5`,
  ].join("\n");
}
