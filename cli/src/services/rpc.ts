import dotenv from "dotenv";
import { Connection, Commitment, PublicKey } from "@solana/web3.js";

dotenv.config();

const DEFAULT_COMMITMENT: Commitment = "confirmed";
const DEFAULT_HTTP = "https://api.devnet.solana.com";

function splitList(value: string | undefined): string[] {
    if (!value) return [];

    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function normalizeHttpUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

function toWsUrl(httpUrl: string): string | undefined {
    try {
        const parsed = new URL(httpUrl);
        if (parsed.protocol === "https:") {
            parsed.protocol = "wss:";
            return parsed.toString().replace(/\/$/, "");
        }

        if (parsed.protocol === "http:") {
            parsed.protocol = "ws:";
            return parsed.toString().replace(/\/$/, "");
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function getHttpEndpoints(): string[] {
    const configured = unique([
        ...splitList(process.env.RPC_HTTP_LIST),
        ...splitList(process.env.RPC_HTTP_FALLBACKS),
        process.env.RPC_HTTP || DEFAULT_HTTP,
    ].map(normalizeHttpUrl));

    return configured.length > 0 ? configured : [DEFAULT_HTTP];
}

function getWsEndpoints(httpEndpoints: string[]): string[] {
    return unique([
        ...splitList(process.env.RPC_WS_LIST),
        ...splitList(process.env.RPC_WS_FALLBACKS),
        process.env.RPC_WS,
        ...httpEndpoints.map(toWsUrl),
    ]
        .filter((value): value is string => Boolean(value))
        .map(normalizeHttpUrl));
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
    return !!value && typeof value === "object" && typeof (value as Promise<T>).then === "function";
}

class RpcPool {
    private readonly httpEndpoints: string[];
    private readonly wsEndpoints: string[];
    private readonly commitment: Commitment;
    private readonly connections = new Map<string, Connection>();
    private activeIndex = 0;

    constructor(commitment: Commitment = DEFAULT_COMMITMENT) {
        this.httpEndpoints = getHttpEndpoints();
        this.wsEndpoints = getWsEndpoints(this.httpEndpoints);
        this.commitment = commitment;
    }

    private endpointAt(index: number): string {
        return this.httpEndpoints[index % this.httpEndpoints.length];
    }

    private wsEndpointFor(httpEndpoint: string): string | undefined {
        const httpIndex = this.httpEndpoints.indexOf(httpEndpoint);
        if (httpIndex >= 0 && this.wsEndpoints[httpIndex]) {
            return this.wsEndpoints[httpIndex];
        }

        return toWsUrl(httpEndpoint);
    }

    private getConnection(httpEndpoint: string): Connection {
        const existing = this.connections.get(httpEndpoint);
        if (existing) return existing;

        const connection = new Connection(httpEndpoint, {
            commitment: this.commitment,
            wsEndpoint: this.wsEndpointFor(httpEndpoint),
        });

        this.connections.set(httpEndpoint, connection);
        return connection;
    }

    private async withFailover<T>(
        fn: (connection: Connection, endpoint: string) => Promise<T>
    ): Promise<T> {
        let lastError: unknown;
        const start = this.activeIndex;

        for (let offset = 0; offset < this.httpEndpoints.length; offset++) {
            const endpoint = this.endpointAt(start + offset);

            try {
                const result = await fn(this.getConnection(endpoint), endpoint);
                this.activeIndex = this.httpEndpoints.indexOf(endpoint);
                return result;
            } catch (error) {
                lastError = error;
                this.connections.delete(endpoint);
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "RPC failover exhausted"));
    }

    private withFailoverSync<T>(
        fn: (connection: Connection, endpoint: string) => T
    ): T {
        let lastError: unknown;
        const start = this.activeIndex;

        for (let offset = 0; offset < this.httpEndpoints.length; offset++) {
            const endpoint = this.endpointAt(start + offset);

            try {
                const result = fn(this.getConnection(endpoint), endpoint);
                this.activeIndex = this.httpEndpoints.indexOf(endpoint);
                return result;
            } catch (error) {
                lastError = error;
                this.connections.delete(endpoint);
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "RPC failover exhausted"));
    }

    get endpoints(): string[] {
        return [...this.httpEndpoints];
    }

    get activeHttpEndpoint(): string {
        return this.endpointAt(this.activeIndex);
    }

    async getSignaturesForAddress(pubkey: PublicKey, config?: { before?: string; limit?: number; minContextSlot?: number }) {
        return this.withFailover((connection) => connection.getSignaturesForAddress(pubkey, config));
    }

    async getTransaction(signature: string, config?: any) {
        return this.withFailover((connection) => connection.getTransaction(signature, config));
    }

    async getLatestBlockhash(commitmentOrConfig?: Commitment | { commitment?: Commitment }) {
        return this.withFailover((connection) => connection.getLatestBlockhash(commitmentOrConfig as any));
    }

    async sendRawTransaction(rawTransaction: Buffer | Uint8Array | Array<number>, options?: any) {
        return this.withFailover((connection) => connection.sendRawTransaction(rawTransaction as any, options));
    }

    async confirmTransaction(strategy: any, commitment?: Commitment) {
        return this.withFailover((connection) => connection.confirmTransaction(strategy, commitment));
    }

    onLogs(
        programId: PublicKey,
        callback: Parameters<Connection["onLogs"]>[1],
        commitment?: Commitment
    ) {
        return this.withFailoverSync((connection) => connection.onLogs(programId, callback, commitment ?? this.commitment));
    }

    removeOnLogsListener(listenerId: number) {
        return this.withFailover((connection) => connection.removeOnLogsListener(listenerId));
    }

    // Generic method fallback so this pool behaves like a Connection for the methods we do not list explicitly.
    [key: string]: any;
}

function buildRpcConnection() {
    const pool = new RpcPool(DEFAULT_COMMITMENT);

    return new Proxy(pool, {
        get(target, prop, receiver) {
            if (prop === "activeHttpEndpoint" || prop === "endpoints") {
                return Reflect.get(target, prop, receiver);
            }

            if (typeof prop === "string" && prop in target) {
                return Reflect.get(target, prop, receiver);
            }

            const current = (target as any).getConnection((target as any).activeHttpEndpoint);
            const value = current[prop as keyof Connection];

            if (typeof value !== "function") {
                return value;
            }

            if (prop === "onLogs") {
                return (...args: any[]) => (target as any).onLogs(...args);
            }

            if (prop === "removeOnLogsListener") {
                return (...args: any[]) => (target as any).removeOnLogsListener(...args);
            }

            return (...args: any[]) => {
                const attempt = async () => {
                    for (const endpoint of (target as any).endpoints) {
                        try {
                            const connection = (target as any).getConnection(endpoint);
                            const result = connection[prop as keyof Connection](...args);

                            if (isPromiseLike(result)) {
                                return await result;
                            }

                            return result;
                        } catch (error) {
                            (target as any).connections?.delete?.(endpoint);
                        }
                    }

                    throw new Error(`RPC failover exhausted for ${String(prop)}`);
                };

                return attempt();
            };
        },
    });
}

export const connection = buildRpcConnection() as unknown as Connection & {
    activeHttpEndpoint: string;
    endpoints: string[];
};

export function createConnection(commitment: Commitment = DEFAULT_COMMITMENT) {
    return new RpcPool(commitment) as unknown as Connection & {
        activeHttpEndpoint: string;
        endpoints: string[];
    };
}

