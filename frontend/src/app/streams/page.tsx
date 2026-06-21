"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWalletConnection, useClusterState } from "@solana/react-hooks";
import { api } from "@/lib/api";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardStreamsPanel } from "@/components/dashboard/dashboard-streams-panel";
import { StreamDetailsDrawer } from "@/components/dashboard/stream-details-drawer";
import { MobileBottomNav } from "@/components/dashboard/dashboard-sidebar";
import type { TabId } from "@/components/dashboard/types";
import { fetchAdminConfig } from "@/lib/solana/admin";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { getNetworkByEndpoint } from "@/lib/solana/network-config";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
type TxPhase = "wallet_approval" | "sending" | "confirming";

export default function StreamsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, connected } = useWalletConnection();
  const { endpoint } = useClusterState();

  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const [selectedStream, setSelectedStream] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTxAction, setActiveTxAction] = useState<string | null>(null);
  const [activeTxPhase,  setActiveTxPhase]  = useState<TxPhase | null>(null);
  const searchFromUrl = searchParams.get("search") ?? "";
  const [waitingForIndex, setWaitingForIndex] = useState(false);
  const indexRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectedWalletAddress = connected && wallet?.account.address
    ? String(wallet.account.address)
    : null;

  const fetchStreams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/streams");
      setStreams(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStreamDetails = useCallback(async (id: string) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/streams/${id}`);
      setSelectedStream(res.data);
    } catch {
      // silent
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Tick nowTs every 30s
  useEffect(() => {
    const interval = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch on mount + poll every 15s
  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 15000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  // Fast-retry when opened via share link and stream not indexed yet
  useEffect(() => {
    if (!searchFromUrl) return;

    const alreadyFound = streams.some(
      (s) => s.id?.toLowerCase() === searchFromUrl.toLowerCase()
    );

    if (alreadyFound) {
      setWaitingForIndex(false);
      if (indexRetryRef.current) clearInterval(indexRetryRef.current);
      return;
    }

    if (!loading) {
      setWaitingForIndex(true);
      let retries = 0;
      if (indexRetryRef.current) clearInterval(indexRetryRef.current);
      indexRetryRef.current = setInterval(() => {
        retries += 1;
        fetchStreams();
        if (retries >= 20) {
          clearInterval(indexRetryRef.current!);
          setWaitingForIndex(false);
        }
      }, 3000);
    }

    return () => {
      if (indexRetryRef.current) clearInterval(indexRetryRef.current);
    };
  }, [searchFromUrl, streams, loading, fetchStreams]);

  // Navigation helpers for StreamDetailsDrawer
  const prefillAction = useCallback((tab: TabId, streamOrId: any) => {
    const streamId = typeof streamOrId === "string" ? streamOrId : String(streamOrId?.id || "");
    router.push(`/?tab=${tab}&streamId=${streamId}`);
  }, [router]);

  const setActiveTab = useCallback((tab: TabId) => {
    router.push(`/?tab=${tab}`);
  }, [router]);

  const setCsvEditText = useCallback((_val: string) => {
    router.push("/?tab=edit_csv");
  }, [router]);

  const [adminConfig, setAdminConfig] = useState<any>(null);
  const [adminConfigLoading, setAdminConfigLoading] = useState(false);
const loadAdminConfig = useCallback(async () => {
  setAdminConfigLoading(true);
  const config = await fetchAdminConfig({ endpoint });
  setAdminConfig(config);
  setAdminConfigLoading(false);
}, [endpoint]);

useEffect(() => { loadAdminConfig(); }, [loadAdminConfig]);

// Refetch setelah transaksi admin selesai (gantikan effect serupa di AdminPanel)
const isFirstAdminLoad = useRef(true);
useEffect(() => {
  if (isFirstAdminLoad.current) { isFirstAdminLoad.current = false; return; }
  if (!activeTxAction && !activeTxPhase) loadAdminConfig();
}, [activeTxAction, activeTxPhase, loadAdminConfig]);
 const isUnauthorized =
    !adminConfigLoading &&
    adminConfig &&
    connectedWalletAddress &&
    adminConfig.adminAuthority !== connectedWalletAddress;
    const canAccessAdmin =
  connected &&
  !!adminConfig &&
  !isUnauthorized;
 const network = useMemo(() => {
    const c = getNetworkByEndpoint(endpoint)?.cluster;
    return c === "mainnet"
      ? WalletAdapterNetwork.Mainnet
      : c === "testnet"
      ? WalletAdapterNetwork.Testnet
      : WalletAdapterNetwork.Devnet;
  }, [endpoint]);
  const wallets = useMemo(() => [new SolflareWalletAdapter()], [network]);
  return (
    
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <DashboardHeader />
 <WalletProvider wallets={wallets}>
      <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans relative overflow-hidden flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">

        {/* Glow backgrounds */}
        <div className="hidden md:block absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-950/20 rounded-full blur-[140px] pointer-events-none" />
        <div className="hidden md:block absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-950/15 rounded-full blur-[160px] pointer-events-none" />

        {/* Mobile bottom tab bar */}
        <div className="md:hidden">
          <MobileBottomNav
          showAdmin={canAccessAdmin}
            activeTab="streams"
            onSelect={(tab: TabId) => router.push(`/?tab=${tab}`)}
            streamsCount={streams.length}
          />
        </div>

        {/* Main content */}
        <div className="max-w-7xl mx-auto w-full px-4 py-4 sm:px-6 sm:py-8 pb-20 md:pb-8 flex-grow flex flex-col md:flex-row gap-4 md:gap-8 relative z-10">
          <section className="flex-grow min-w-0 max-w-full bg-zinc-900/25 border border-zinc-800/80 rounded-3xl p-4 sm:p-6 md:backdrop-blur-sm md:shadow-2xl shadow-none flex flex-col justify-between relative overflow-x-hidden">
            <DashboardStreamsPanel
              streams={streams}
              loading={loading}
              nowTs={nowTs}
              fetchStreams={fetchStreams}
              fetchStreamDetails={fetchStreamDetails}
              connectedWalletAddress={connectedWalletAddress}
              initialSearch={searchFromUrl}
              waitingForIndex={waitingForIndex}
            />
          </section>
        </div>

        <StreamDetailsDrawer
          selectedStream={selectedStream}
          loadingDetails={loadingDetails}
          copiedId={copiedId}
          copyToClipboard={copyToClipboard}
          prefillAction={prefillAction}
          setActiveTab={setActiveTab}
          setCsvEditText={setCsvEditText}
          setSelectedStream={setSelectedStream}
          connectedWalletAddress={connectedWalletAddress}
          currentTimeTs={nowTs}
          endpoint={endpoint}
        />

      </main>
       </WalletProvider>
    </div>
   
  );
}
