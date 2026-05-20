"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { WalletPickerButton } from "@/components/wallet/wallet-picker-button";
import { BrandMark } from "@/components/brand/brand-mark";
import { formatTokenAmount, getAmountUnitLabel } from "@/components/dashboard/utils";
import { 
  Layers, ChevronRight, Copy, Check, X, Info, 
  History, Calendar, RefreshCw, ArrowDownRight, XCircle, 
  Unlock, Settings, ArrowLeft, ArrowUpRight, Search, Users, BookOpen
} from "lucide-react";

export default function StreamsPage() {
  const { wallet } = useWalletConnection();
  const router = useRouter();
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSquadsAddress, setFilterSquadsAddress] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("squads_multisig_address") ?? "";
  });
  const [showOnlySquads, setShowOnlySquads] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("squads_multisig_enabled") === "true";
  });

  // Drawer details state
  const [selectedStream, setSelectedStream] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const handleSearchQueryChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleShowOnlySquadsChange = (checked: boolean) => {
    setShowOnlySquads(checked);
    setCurrentPage(1);
    if (typeof window !== "undefined") {
      localStorage.setItem("squads_multisig_enabled", String(checked));
    }
  };

  const fetchStreams = async () => {
    setLoading(true);
    try {
      const res = await api.get("/streams");
      setStreams(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStreamDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/streams/${id}`);
      setSelectedStream(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 15000);

    // Load Squads persistence
    if (typeof window !== "undefined") {
      const savedSquads = localStorage.getItem("squads_multisig_address");
      if (savedSquads) {
        setFilterSquadsAddress(savedSquads);
      }

      const savedSquadsEnabled = localStorage.getItem("squads_multisig_enabled");
      if (savedSquadsEnabled !== null) {
        setShowOnlySquads(savedSquadsEnabled === "true");
      }
    }

    return () => clearInterval(interval);
  }, []);

  const connectedWalletAddress = wallet?.account.address ? String(wallet.account.address) : null;
  const isRecipientWallet =
    connectedWalletAddress !== null &&
    selectedStream?.recipient?.toLowerCase() === connectedWalletAddress.toLowerCase();
  const isCreatorWallet =
    connectedWalletAddress !== null &&
    selectedStream?.creator?.toLowerCase() === connectedWalletAddress.toLowerCase();
  const selectedMintDecimals = typeof selectedStream?.mintDecimals === "number" ? selectedStream.mintDecimals : null;
  const selectedAmountLabel = getAmountUnitLabel(selectedStream?.mint);

  const handleSquadsAddressChange = (val: string) => {
    setFilterSquadsAddress(val);
    setCurrentPage(1);
    if (typeof window !== "undefined") {
      localStorage.setItem("squads_multisig_address", val);
    }
  };

  const formatDate = (ts: string) => new Date(Number(ts) * 1000).toLocaleString();
  const shorten = (address: string) => address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "";

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter streams client-side
  const filteredStreams = streams.filter(stream => {
    const matchesSearch = searchQuery.trim() === "" ||
      stream.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.mint.toLowerCase().includes(searchQuery.toLowerCase());

    if (showOnlySquads && filterSquadsAddress.trim() !== "") {
      const isSquadsAssociated =
        stream.creator === filterSquadsAddress.trim() ||
        stream.recipient === filterSquadsAddress.trim();
      return matchesSearch && isSquadsAssociated;
    }

    if (connectedWalletAddress) {
      const isWalletRelated =
        stream.creator === connectedWalletAddress ||
        stream.recipient === connectedWalletAddress;
      return matchesSearch && isWalletRelated;
    }

    return false;
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans relative overflow-hidden flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Glow backgrounds */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-950/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-950/15 rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-7xl mx-auto w-full px-6 py-5 border-b border-zinc-900/80 flex justify-between items-center relative z-20 backdrop-blur-md bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center transition-all"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <span className="font-extrabold text-xl tracking-wider bg-gradient-to-r from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Unified Flow
            </span>
            <div className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase">Protocol Streams</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Link
            href="/docs"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 font-medium transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 px-3.5 py-2 rounded-xl"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Developer Docs
          </Link>
          <WalletPickerButton className="shrink-0" />
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="max-w-4xl mx-auto w-full px-6 py-12 flex-grow relative z-10">
        
        <div className="flex items-center justify-between border-b border-zinc-900 pb-5 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Active Streams</h1>
            <p className="text-xs text-zinc-400 mt-1">Select any indexed PDA account to analyze unlock schedules and ledger histories</p>
          </div>
          
          <button
            onClick={fetchStreams}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-all text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : "text-zinc-400"}`} />
            Refresh
          </button>
        </div>

        {/* 🔍 PREMIUM DUAL SEARCH & FILTER BAR */}
        <div className="grid gap-3 sm:grid-cols-2 mb-8 bg-zinc-900/20 border border-zinc-900 rounded-2xl p-4">
          {/* Address search query */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              placeholder="Search by Creator, Recipient, Mint, or PDA ID..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Persistent Squads Filter Switch */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-850 px-3.5 py-1 rounded-xl shrink-0">
              <input
                type="checkbox"
                id="squads-filter-toggle-p"
                checked={showOnlySquads}
                onChange={(e) => handleShowOnlySquadsChange(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-805 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <label htmlFor="squads-filter-toggle-p" className="text-xs font-bold text-zinc-350 cursor-pointer select-none flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                Squads View
              </label>
            </div>

            <input
              type="text"
              value={filterSquadsAddress}
              onChange={(e) => handleSquadsAddressChange(e.target.value)}
              placeholder="Paste Squads Multisig PDA..."
              disabled={!showOnlySquads}
              className={`w-full bg-zinc-950 border rounded-xl px-4 py-2 text-xs font-mono transition-all ${
                showOnlySquads 
                  ? "border-indigo-500 text-zinc-200 focus:outline-none focus:border-indigo-400" 
                  : "border-zinc-850 text-zinc-650 opacity-45 cursor-not-allowed"
              }`}
            />
          </div>
        </div>

        {loading && streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-xs font-medium">Fetching real-time on-chain data...</span>
          </div>
        ) : filteredStreams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 border-2 border-dashed border-zinc-900 rounded-3xl">
            <Layers className="w-12 h-12 text-zinc-700 mb-3" />
            <span className="text-sm font-bold text-zinc-300">No matching streams indexed</span>
            <span className="text-xs text-zinc-500 max-w-xs text-center mt-1">Adjust your search filter parameters or confirm your backfiller status.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-5">
              {(() => {
                const paginatedStreams = filteredStreams.slice(
                  (currentPage - 1) * itemsPerPage,
                  currentPage * itemsPerPage
                );
                return paginatedStreams.map((stream) => {
                  const now = Math.floor(Date.now() / 1000);
                  const start = Number(stream.startTs);
                  const end = Number(stream.endTs);
                  const cliff = Number(stream.cliffTs);
                  const total = Number(stream.totalAmount);
                  const withdrawn = Number(stream.withdrawn);
                  const unlocked = Number(stream.unlockedAmount || 0);
                  const mintDecimals = typeof stream.mintDecimals === "number" ? stream.mintDecimals : null;
                  const amountLabel = getAmountUnitLabel(stream.mint);

                  let vested = 0;
                  let progress = 0;

                  if (stream.vestingType === 2) {
                    // Milestone-based: progress is discrete based on unlocked amount
                    vested = unlocked;
                    progress = Math.min((unlocked / total) * 100, 100);
                  } else if (stream.vestingType === 1) {
                    // Cliff-based: 0 before cliff timestamp, linear scale after
                    if (now < cliff) {
                      vested = 0;
                      progress = 0;
                    } else {
                      const duration = end - start || 1;
                      const elapsed = Math.min(Math.max(now - start, 0), duration);
                      vested = Math.floor((total * elapsed) / duration);
                      progress = Math.min((elapsed / duration) * 100, 100);
                    }
                  } else {
                    // Linear-based
                    const duration = end - start || 1;
                    const elapsed = Math.min(Math.max(now - start, 0), duration);
                    vested = Math.floor((total * elapsed) / duration);
                    progress = Math.min((elapsed / duration) * 100, 100);
                  }

                  const claimable = Math.max(vested - withdrawn, 0);

                  const isCompleted = withdrawn >= total;
                  const isNotStarted = now < start;
                  const isEnded = stream.vestingType === 2 ? (unlocked >= total) : (now >= end);
                  const isCliffLocked = stream.vestingType === 1 && now < cliff;
                  const isMilestone = stream.vestingType === 2;
                  const unlockedCount = isMilestone ? Math.round((Number(stream.unlockedAmount || 0) / Number(stream.totalAmount)) * stream.milestoneCount) : 0;

                  return (
                    <div 
                      key={stream.id}
                      onClick={() => fetchStreamDetails(stream.id)}
                      className="bg-zinc-900/10 border border-zinc-900 hover:border-indigo-500/50 hover:bg-zinc-900/30 rounded-2xl p-5 transition-all shadow-md group relative overflow-hidden cursor-pointer animate-in fade-in-30 duration-200"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />

                      {/* Top Status & PDA */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Stream PDA</span>
                          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded font-mono text-[10px] border border-zinc-850">
                            <span>{shorten(stream.id)}</span>
                          </div>
                          {stream.isCsvCreated && (
                            <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">CSV Created</span>
                          )}
                        </div>
                        
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest ${
                          isCompleted 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                          : isEnded
                            ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25"
                          : isNotStarted
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25"
                          : isCliffLocked
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                          : isMilestone
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/25"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                        }`}>
                          {isCompleted 
                            ? "Completed" 
                            : isEnded 
                            ? "Ended" 
                            : isNotStarted 
                            ? "Scheduled" 
                            : isCliffLocked 
                            ? "Cliff Lock" 
                            : isMilestone 
                            ? `Milestone Index ${unlockedCount}` 
                            : "Streaming"}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between items-center text-xs mb-1.5">
                          <span className="font-semibold text-zinc-400">Vesting Completion</span>
                          <span className="font-mono text-zinc-200 font-bold">{progress.toFixed(2)}%</span>
                        </div>
                        <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Data Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-zinc-950/20 border border-zinc-900/60 rounded-xl p-3.5 text-xs">
                        <div>
                        <div className="text-zinc-500 font-medium">Total Amount</div>
                          <div className="font-bold text-zinc-200">{formatTokenAmount(stream.totalAmount, mintDecimals)} {amountLabel}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500 font-medium">Claimable</div>
                          <div className="font-bold text-indigo-400">{formatTokenAmount(claimable, mintDecimals)} {amountLabel}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500 font-medium">Withdrawn</div>
                          <div className="font-bold text-zinc-200">{formatTokenAmount(withdrawn, mintDecimals)} {amountLabel}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500 font-medium">Type</div>
                          <div className="font-semibold text-zinc-300 uppercase tracking-wider text-[10px]">
                            {stream.vestingType === 0 ? "Linear" : stream.vestingType === 1 ? "Cliff" : "Milestone"}
                          </div>
                        </div>
                      </div>

                      {/* Footer link trigger */}
                      <div className="mt-4 flex flex-col gap-1 border-t border-zinc-900/50 pt-2 text-[10px] text-zinc-500 font-mono">
                        <div className="flex justify-between items-center">
                          <span>Start: {formatDate(stream.startTs)}</span>
                          <span className="text-indigo-400 flex items-center gap-0.5 font-bold group-hover:translate-x-0.5 transition-transform">
                            View Detailed Timeline <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                        {stream.vestingType === 1 && (
                          <div className="flex justify-between items-center text-amber-500 font-bold mt-0.5">
                            <span>Cliff Unlock: {formatDate(stream.cliffTs)}</span>
                            <span>({Number(stream.cliffTs) - Number(stream.startTs)}s duration)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Premium Pagination Control */}
            {(() => {
              const totalPages = Math.ceil(filteredStreams.length / itemsPerPage);
              if (totalPages <= 1) return null;
              return (
                <div className="flex items-center justify-between border border-zinc-900 bg-zinc-900/10 rounded-2xl p-4 text-xs mt-2">
                  <span className="text-zinc-400 font-medium">
                    Showing <span className="text-zinc-200 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
                    <span className="text-zinc-200 font-bold">{Math.min(currentPage * itemsPerPage, filteredStreams.length)}</span> of{" "}
                    <span className="text-indigo-400 font-black">{filteredStreams.length}</span> active streams
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentPage(prev => Math.max(prev - 1, 1));
                      }}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 bg-zinc-950 border border-zinc-850 hover:border-zinc-750 text-zinc-350 hover:text-zinc-50 rounded-xl transition-all disabled:opacity-40 disabled:hover:text-zinc-350 disabled:cursor-not-allowed font-semibold"
                    >
                      Prev page
                    </button>
                    
                    <div className="bg-zinc-950 border border-zinc-850 px-3 py-1.5 rounded-xl font-mono font-bold text-zinc-350 text-[10px]">
                      {currentPage} / {totalPages}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentPage(prev => Math.min(prev + 1, totalPages));
                      }}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 bg-zinc-950 border border-zinc-850 hover:border-zinc-750 text-zinc-350 hover:text-zinc-50 rounded-xl transition-all disabled:opacity-40 disabled:hover:text-zinc-350 disabled:cursor-not-allowed font-semibold"
                    >
                      Next page
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* SLIDE-OVER PREMIUM DRAWER PANEL FOR STREAM DETAILS & TRANSACTION LOGS */}
      {/* ========================================================================= */}
      {selectedStream && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex justify-end animate-in fade-in duration-200">
          
          {/* Drawer Container */}
          <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full flex flex-col justify-between p-6 shadow-2xl relative animate-in slide-in-from-right duration-355">
            
            {/* Scrollable Content */}
            <div className="overflow-y-auto max-h-[85%] pr-1">
              
              {/* Header Title / Close Actions */}
              <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-md font-extrabold text-zinc-100">Stream Specifications</h3>
                </div>
                <button 
                  onClick={() => setSelectedStream(null)}
                  className="p-1 rounded-lg border border-zinc-900 hover:border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingDetails ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-2">
                  <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
                  <span className="text-xs">Fetching event signatures & slots...</span>
                </div>
              ) : (
                <>
                  {/* Interactive Progress Metric */}
                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 mb-5">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                      {selectedStream.vestingType === 2 ? "Milestone Unlock Progress" : "Claim Completeness Index"}
                    </div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xl font-black font-mono bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        {(() => {
                          const total = Number(selectedStream.totalAmount);
                          const withdrawn = Number(selectedStream.withdrawn);
                          const unlocked = Number(selectedStream.unlockedAmount || 0);
                          const value = selectedStream.vestingType === 2 ? unlocked : withdrawn;
                          return ((value / total) * 100).toFixed(1);
                        })()}%
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {selectedStream.vestingType === 2
                          ? `${formatTokenAmount(selectedStream.unlockedAmount || 0, selectedMintDecimals)} / ${formatTokenAmount(selectedStream.totalAmount, selectedMintDecimals)} ${selectedAmountLabel} Unlocked`
                          : `${formatTokenAmount(selectedStream.withdrawn, selectedMintDecimals)} / ${formatTokenAmount(selectedStream.totalAmount, selectedMintDecimals)} ${selectedAmountLabel} Claimed`}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min(((() => {
                            const total = Number(selectedStream.totalAmount);
                            const withdrawn = Number(selectedStream.withdrawn);
                            const unlocked = Number(selectedStream.unlockedAmount || 0);
                            return selectedStream.vestingType === 2 ? unlocked : withdrawn;
                          })() / Number(selectedStream.totalAmount)) * 100, 100)}%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Detail Core Matrix Grid */}
                  <div className="text-xs grid gap-3.5 bg-zinc-900/25 border border-zinc-900 p-4 rounded-2xl">
                    
                    <div>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Stream ID (PDA)</span>
                      <div className="flex items-center justify-between font-mono bg-zinc-950 border border-zinc-900 rounded-lg px-2.5 py-1.5 text-zinc-300">
                        <span className="truncate mr-2">{selectedStream.id}</span>
                        <button 
                          onClick={() => copyToClipboard(selectedStream.id, "drawer_id_streams")}
                          className="text-zinc-500 hover:text-zinc-300 shrink-0"
                        >
                          {copiedId === "drawer_id_streams" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Vesting Mode</span>
                        <span className="font-semibold text-zinc-300">
                          {selectedStream.vestingType === 0 ? "Linear Stream" : selectedStream.vestingType === 1 ? "Cliff Lockup" : "Milestone-Based"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Status Badge</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block ${
                          selectedStream.status === 2
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                        }`}>
                          {selectedStream.status === 2 ? "Completed" : "Active"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Cancelable</span>
                        <span className="font-semibold text-zinc-300">{selectedStream.cancelable ? "Yes (Permitted)" : "No (Immutable)"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Milestones Defined</span>
                        <span className="font-semibold text-zinc-300 font-mono">{selectedStream.milestoneCount} milestones</span>
                      </div>
                    </div>

                    {selectedStream.vestingType === 2 && (
                      <>
                        <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3">
                          <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Unlocked Amount</span>
                            <span className="font-semibold text-emerald-400 font-mono">{formatTokenAmount(selectedStream.unlockedAmount || 0, selectedMintDecimals)} {selectedAmountLabel}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Claimable Remaining</span>
                            <span className="font-semibold text-indigo-400 font-mono">{formatTokenAmount(Math.max(Number(selectedStream.unlockedAmount || 0) - Number(selectedStream.withdrawn), 0), selectedMintDecimals)} {selectedAmountLabel}</span>
                          </div>
                        </div>

                        <div className="border-t border-zinc-900/60 pt-3">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Milestones Allocation per Index</span>
                          <div className="grid gap-2">
                            {(() => {
                              const list = selectedStream.milestones
                                ? selectedStream.milestones.split(";").map(Number)
                                : Array(selectedStream.milestoneCount).fill(Math.floor(Number(selectedStream.totalAmount) / (selectedStream.milestoneCount || 1)));
                              
                              let cumulativeSum = 0;
                              const unlocked = Number(selectedStream.unlockedAmount || 0);

                              return list.map((amt: number, idx: number) => {
                                cumulativeSum += amt;
                                const isUnlocked = cumulativeSum <= unlocked;

                                return (
                                  <div 
                                    key={idx}
                                    className="flex items-center justify-between font-mono bg-zinc-950 border border-zinc-900/70 rounded-xl px-3 py-2 text-zinc-300 text-[11px]"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-full ${isUnlocked ? 'bg-emerald-450 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-zinc-800'}`} />
                                      <span className="font-extrabold">Milestone #{idx}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-zinc-400 font-bold">{formatTokenAmount(amt, selectedMintDecimals)} {selectedAmountLabel}</span>
                                      <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${
                                        isUnlocked 
                                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                          : "bg-zinc-900 text-zinc-660 border border-zinc-850"
                                      }`}>
                                        {isUnlocked ? "Unlocked" : "Locked"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="border-t border-zinc-900/60 pt-3">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Creator Account</span>
                      <span className="font-mono text-zinc-400 truncate block">{selectedStream.creator}</span>
                    </div>

                    <div className="border-t border-zinc-900/60 pt-3">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Recipient Destination</span>
                      <span className="font-mono text-zinc-400 truncate block">{selectedStream.recipient}</span>
                    </div>

                    <div className="border-t border-zinc-900/60 pt-3">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Token Mint Address</span>
                      <span className="font-mono text-zinc-400 truncate block">{selectedStream.mint}</span>
                    </div>

                    <div className="border-t border-zinc-900/60 pt-3 grid grid-cols-2 gap-2 text-[10px] text-zinc-500 font-mono">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Start: {formatDate(selectedStream.startTs)}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> End: {formatDate(selectedStream.endTs)}</span>
                      {selectedStream.vestingType === 1 && (
                        <span className="col-span-2 flex items-center gap-1 text-amber-500 font-bold border-t border-zinc-900/40 pt-1.5 mt-1"><Calendar className="w-3 h-3" /> Cliff Unlock: {formatDate(selectedStream.cliffTs)} ({Number(selectedStream.cliffTs) - Number(selectedStream.startTs)}s duration)</span>
                      )}
                    </div>

                  </div>

                  {/* Transaction History Section */}
                  <div className="mt-5 border-t border-zinc-900 pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <History className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-350">Transaction Ledger</h4>
                    </div>

                    {!selectedStream.transactions || selectedStream.transactions.length === 0 ? (
                      <div className="text-[10px] text-zinc-600 bg-zinc-900/10 border border-zinc-900/50 text-center py-4 rounded-xl">
                        No indexed ledger entries found for this stream.
                      </div>
                    ) : (
                      <div className="grid gap-2.5">
                        {selectedStream.transactions.map((tx: any) => (
                          <div 
                            key={tx.id}
                            className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-3 flex justify-between items-start text-[10px]"
                          >
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  tx.type === "CREATE_STREAM" ? "bg-indigo-400" : "bg-emerald-400"
                                }`} />
                                <span className="font-bold text-zinc-300 uppercase tracking-wide">{tx.type}</span>
                              </div>
                              <span className="text-[9px] text-zinc-500 font-mono block">Signature: {shorten(tx.signature)}</span>
                              <span className="text-[9px] text-zinc-500 font-mono block">Slot: {tx.slot}</span>
                            </div>
                            
                            <a 
                              href={`https://solscan.io/tx/${tx.signature}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-bold transition-all"
                            >
                              Solscan <ArrowUpRight className="w-3 h-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>

            {/* Instant Prefill Dashboard Redirect Footer */}
            {!loadingDetails && (
              <div className="border-t border-zinc-900 pt-4 flex flex-col gap-2">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Execute Operations</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                  {isRecipientWallet && (
                    <Link
                      href={`/?tab=withdraw&streamId=${selectedStream.id}`}
                      className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-zinc-50 py-2.5 rounded-xl transition-all"
                    >
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      Claim Tokens
                    </Link>
                  )}

                  {isCreatorWallet && selectedStream.cancelable && (
                    <Link
                      href={`/?tab=cancel&streamId=${selectedStream.id}`}
                      className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-red-400 hover:text-red-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel Stream
                    </Link>
                  )}

                  {isCreatorWallet && selectedStream.vestingType === 2 && (
                    <Link
                      href={`/?tab=unlock_milestone&streamId=${selectedStream.id}`}
                      className="col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Unlock Milestone Target
                    </Link>
                  )}

                  {isCreatorWallet && (
                    <Link
                      href={`/?tab=${selectedStream.vestingType === 0 ? "edit_linear" : selectedStream.vestingType === 1 ? "edit_cliff" : "edit_milestone"}&streamId=${selectedStream.id}`}
                      className="col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-855 hover:border-zinc-750 py-2.5 rounded-xl transition-all"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Modify Vesting Structure
                    </Link>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full px-6 py-6 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-zinc-500 relative z-10">
        <div>
          &copy; {new Date().getFullYear()} Unified Flow Protocol. Built for Solana Devnet.
        </div>
        <div className="flex gap-4">
          <Link href="/docs" className="hover:text-indigo-400 transition-colors">
            API Reference
          </Link>
          <span>&middot;</span>
          <Link href="/docs" className="hover:text-indigo-400 transition-colors">
            MCP Server
          </Link>
          <span>&middot;</span>
          <Link href="/docs" className="hover:text-indigo-400 transition-colors">
            CLI & Skills
          </Link>
        </div>
      </footer>
    </main>
  );
}
