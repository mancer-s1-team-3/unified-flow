export type ClusterKey = "devnet" | "mainnet" | "testnet" | "local";

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

function normalizeEndpoint(endpoint: string) {
  return endpoint.toLowerCase();
}

export function getClusterKey(endpoint: string): ClusterKey {
  const normalized = normalizeEndpoint(endpoint);

  if (normalized.includes("mainnet")) return "mainnet";
  if (normalized.includes("testnet")) return "testnet";
  if (normalized.includes("devnet")) return "devnet";

  return "local";
}

export function getClusterLabel(endpoint: string) {
  switch (getClusterKey(endpoint)) {
    case "mainnet":
      return "mainnet";
    case "testnet":
      return "testnet";
    case "devnet":
      return "devnet";
    default:
      return "current network";
  }
}

export function getMintPresets(endpoint: string): MintPreset[] {
  switch (getClusterKey(endpoint)) {
    case "mainnet":
      return MAINNET_MINT_PRESETS;
    case "devnet":
    case "testnet":
      return DEVNET_MINT_PRESETS;
    default:
      return DEVNET_MINT_PRESETS;
  }
}

export function getDefaultMint(endpoint: string) {
  return getMintPresets(endpoint)[0]?.mint ?? WSOL_MINT;
}

export function buildCreateStreamCsvTemplate(endpoint: string) {
  const defaultMint = getDefaultMint(endpoint);

  return [
    "recipient,amount,mint,type,duration,cliff_duration,cancelable,milestones",
    `AoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,1500,${defaultMint},0,7200,0,true,`,
    `AoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,3000,${defaultMint},1,15000,3600,true,`,
    `AoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,2000,${defaultMint},2,9000,0,false,500;500;500;500`,
  ].join("\n");
}
