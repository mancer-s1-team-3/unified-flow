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
  return mint === "So11111111111111111111111111111111111111112" ? "SOL" : "tokens";
}
