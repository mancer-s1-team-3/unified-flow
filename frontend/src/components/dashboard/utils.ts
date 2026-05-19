export const formatDate = (ts: string) => new Date(Number(ts) * 1000).toLocaleString();

export const shorten = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "";

