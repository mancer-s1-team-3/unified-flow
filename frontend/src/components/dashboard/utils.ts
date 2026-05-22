export const formatDate = (ts: string) => new Date(Number(ts) * 1000).toLocaleString();

export const shorten = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "";

function addThousandsSeparators(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatTokenAmount(amount: string | number | bigint, decimals?: number | null) {
  const raw = typeof amount === "bigint" ? amount.toString() : String(amount ?? "0");
  if (!decimals || decimals <= 0) {
    return addThousandsSeparators(raw);
  }

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const padded = unsigned.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${addThousandsSeparators(whole)}${fraction ? `.${fraction}` : ""}`;
}

export function getAmountUnitLabel(mint: string | null | undefined) {
  if (!mint) return "tokens";

  const knownLabels: Record<string, string> = {
    "So11111111111111111111111111111111111111112": "SOL",
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
    "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
  };

  return knownLabels[mint] ?? "tokens";
}

export function getMilestoneAllocations({
  totalAmount,
  milestoneCount,
  milestones,
}: {
  totalAmount: string | number | bigint;
  milestoneCount: number;
  milestones?: string | null;
}) {
  const count = Number.isFinite(milestoneCount) ? Math.max(Math.floor(milestoneCount), 0) : 0;

  if (milestones && milestones.trim() !== "") {
    const parsed = milestones.split(";").map((value) => {
      const amount = Number(value);
      return Number.isFinite(amount) ? amount : 0;
    });

    if (count > 0) {
      const normalized = parsed.slice(0, count);
      while (normalized.length < count) {
        normalized.push(0);
      }
      return normalized;
    }

    return parsed;
  }

  if (count <= 0) {
    return [];
  }

  const total = Number(totalAmount || 0);
  const base = Math.floor(total / count);
  return Array(count).fill(base);
}
