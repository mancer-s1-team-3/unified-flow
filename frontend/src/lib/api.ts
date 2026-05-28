import axios from "axios";
import { getActiveNetwork } from "@/lib/solana/network-config";

export const api = axios.create({
    baseURL: getActiveNetwork().apiBaseUrl,
});

export function setApiBaseUrl(baseUrl: string) {
    api.defaults.baseURL = baseUrl;
}

export async function upsertUser(walletAddress: string): Promise<void> {
    await api.post("/users/upsert", { walletAddress });
}
