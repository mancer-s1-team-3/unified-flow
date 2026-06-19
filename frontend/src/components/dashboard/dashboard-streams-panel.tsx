"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { FileOutput, Layers, RefreshCw, Search, Users } from "lucide-react";
import { StreamCard } from "@/components/dashboard/stream-card";

type Props = {
  streams: any[];
  loading: boolean;
  nowTs: number;
  fetchStreams: () => void;
  fetchStreamDetails: (id: string) => void;
  connectedWalletAddress: string | null;
  onFilteredCountChange?: (count: number) => void;
  initialSearch?: string;
  waitingForIndex?: boolean;
};

export function DashboardStreamsPanel({
  streams,
  loading,
  nowTs,
  fetchStreams,
  fetchStreamDetails,
  connectedWalletAddress,
  onFilteredCountChange,
  initialSearch = "",
  waitingForIndex = false,
}: Props) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterSquadsAddress, setFilterSquadsAddress] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("squads_multisig_address") ?? "";
  });
  const [showOnlySquads, setShowOnlySquads] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("squads_multisig_enabled") === "true";
  });
 const [currentPage, setCurrentPage] = useState(1);
const itemsPerPage = 5;

// ── New filters: status, vesting type, source (csv/manual), role ──────────
const [filterStatus, setFilterStatus] = useState<string>("all");
const [filterVestingType, setFilterVestingType] = useState<string>("all");
const [filterSource, setFilterSource] = useState<string>("all");
const [filterRole, setFilterRole] = useState<string>("all");

const hasActiveFilters =
  filterStatus !== "all" || filterVestingType !== "all" || filterSource !== "all" || filterRole !== "all";

const resetFilters = useCallback(() => {
  setFilterStatus("all");
  setFilterVestingType("all");
  setFilterSource("all");
  setFilterRole("all");
  setCurrentPage(1);
}, []);

const handleFilterStatusChange = useCallback((val: string) => {
  setFilterStatus(val);
  setCurrentPage(1);
}, []);

const handleFilterVestingTypeChange = useCallback((val: string) => {
  setFilterVestingType(val);
  setCurrentPage(1);
}, []);

const handleFilterSourceChange = useCallback((val: string) => {
  setFilterSource(val);
  setCurrentPage(1);
}, []);

const handleFilterRoleChange = useCallback((val: string) => {
  setFilterRole(val);
  setCurrentPage(1);
}, []);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedAddress = localStorage.getItem("squads_multisig_address");
    const savedEnabled = localStorage.getItem("squads_multisig_enabled");

    if (savedAddress) {
      setFilterSquadsAddress(savedAddress);
    }

    if (savedEnabled !== null) {
      setShowOnlySquads(savedEnabled === "true");
    }
  }, []);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredFilterSquadsAddress = useDeferredValue(filterSquadsAddress);

  const handleSquadsAddressChange = useCallback((val: string) => {
    setFilterSquadsAddress(val);
    setCurrentPage(1);
    if (typeof window !== "undefined") {
      localStorage.setItem("squads_multisig_address", val);
    }
  }, []);

  const handleSearchQueryChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleShowOnlySquadsChange = useCallback((checked: boolean) => {
    setShowOnlySquads(checked);
    setCurrentPage(1);
    if (typeof window !== "undefined") {
      localStorage.setItem("squads_multisig_enabled", String(checked));
    }
  }, []);

  const exportStreamsToCsv = useCallback(() => {
    if (streams.length === 0) return;

    const headers = "id,creator,recipient,mint,totalAmount,withdrawn,startTs,endTs,vestingType,status,cancelable,isCsvCreated,milestones\n";
    const rows = streams.map((s) =>
      `"${s.id}","${s.creator}","${s.recipient}","${s.mint}",${s.totalAmount},${s.withdrawn},${s.startTs},${s.endTs},${s.vestingType},${s.status},${s.cancelable},${s.isCsvCreated},"${s.milestones || ""}"`
    ).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "unified_flow_streams_export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [streams]);

  const filteredStreams = useMemo(() => {
  const query = deferredSearchQuery.trim().toLowerCase();
  const squadsAddress = deferredFilterSquadsAddress.trim().toLowerCase();
  const creatorAddress = connectedWalletAddress?.trim() ?? null;

  // Status: 0 = Active, 1 = Completed, 3 = Cancelled (matches `cancelled`/status===3
  // pattern used elsewhere in the dashboard). Adjust mapping here if the indexer
  // uses different numeric codes.
  const matchesStatus = (stream: any) => {
    if (filterStatus === "all") return true;
    const status = Number(stream.status);
    const isCancelled = stream.cancelled === true || status === 3;
    if (filterStatus === "cancelled") return isCancelled;
    if (filterStatus === "completed") return !isCancelled && status === 1;
    if (filterStatus === "active") return !isCancelled && status !== 1;
    return true;
  };

  const matchesVestingType = (stream: any) => {
    if (filterVestingType === "all") return true;
    return String(stream.vestingType) === filterVestingType;
  };

  const matchesSource = (stream: any) => {
    if (filterSource === "all") return true;
    const isCsv = stream.isCsvCreated === true;
    return filterSource === "csv" ? isCsv : !isCsv;
  };

  const matchesRole = (stream: any) => {
    if (filterRole === "all" || !creatorAddress) return true;
    if (filterRole === "creator") return stream.creator === creatorAddress;
    if (filterRole === "recipient") return stream.recipient === creatorAddress;
    return true;
  };

  return streams.filter((stream) => {
    const matchesSearch =
      query === "" ||
      stream.id.toLowerCase().includes(query) ||
      stream.creator.toLowerCase().includes(query) ||
      stream.recipient.toLowerCase().includes(query) ||
      stream.mint.toLowerCase().includes(query);

    const matchesDropdownFilters =
      matchesStatus(stream) && matchesVestingType(stream) && matchesSource(stream) && matchesRole(stream);

    // If search query is active, bypass wallet/Squads filter — allows share links
    // to work — but dropdown filters still apply on top of the search match.
    if (query !== "") return matchesSearch && matchesDropdownFilters;

    if (showOnlySquads && squadsAddress !== "") {
      const isSquadsAssociated =
        stream.creator === squadsAddress ||
        stream.recipient === squadsAddress;
      return matchesSearch && isSquadsAssociated && matchesDropdownFilters;
    }

    if (creatorAddress) {
      const isWalletRelated =
        stream.creator === creatorAddress ||
        stream.recipient === creatorAddress;
      return matchesSearch && isWalletRelated && matchesDropdownFilters;
    }

    return false;
  });
}, [
  connectedWalletAddress,
  deferredSearchQuery,
  deferredFilterSquadsAddress,
  showOnlySquads,
  streams,
  filterStatus,
  filterVestingType,
  filterSource,
  filterRole,
]);
  const totalPages = useMemo(() => Math.ceil(filteredStreams.length / itemsPerPage), [filteredStreams.length]);
  const safeCurrentPage = Math.min(currentPage, Math.max(totalPages, 1));
  const paginatedStreams = useMemo(() => filteredStreams.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage), [filteredStreams, safeCurrentPage]);

  useEffect(() => {
    onFilteredCountChange?.(filteredStreams.length);
  }, [filteredStreams.length, onFilteredCountChange]);

  return (
    <div className="animate-in fade-in-30 duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Active Streams</h2>
          <p className="text-xs text-zinc-400">Click on any stream to open deep details, timelines, and transactions</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={exportStreamsToCsv}
            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-900/60 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 rounded-xl transition-all text-xs font-semibold"
          >
            <FileOutput className="w-3.5 h-3.5" />
            Export CSV
          </button>

          <button
            onClick={fetchStreams}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-all text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : "text-zinc-400"}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-6 bg-zinc-950/45 border border-zinc-900 rounded-2xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            placeholder="Search by Creator, Recipient, Mint, or PDA ID..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3.5 py-1 rounded-xl shrink-0">
            <input
              type="checkbox"
              id="squads-filter-toggle"
              checked={showOnlySquads}
              onChange={(e) => handleShowOnlySquadsChange(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-800 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="squads-filter-toggle" className="text-xs font-bold text-zinc-350 cursor-pointer select-none flex items-center gap-1.5">
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
            className={`w-full bg-zinc-900 border rounded-xl px-4 py-2 text-xs font-mono transition-all ${
              showOnlySquads
                ? "border-indigo-500 text-zinc-200 focus:outline-none focus:border-indigo-400"
                : "border-zinc-850 text-zinc-650 opacity-45 cursor-not-allowed"
            }`}
          />
        </div>
      </div>
<div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 bg-zinc-950/45 border border-zinc-900 rounded-2xl p-4">
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 w-full">
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
        Status
      </label>
      <select
        value={filterStatus}
        onChange={(e) => handleFilterStatusChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
        Vesting Type
      </label>
      <select
        value={filterVestingType}
        onChange={(e) => handleFilterVestingTypeChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        <option value="all">All Types</option>
        <option value="0">Linear</option>
        <option value="1">Cliff</option>
        <option value="2">Milestone</option>
      </select>
    </div>

    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
        Source
      </label>
      <select
        value={filterSource}
        onChange={(e) => handleFilterSourceChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        <option value="all">All Sources</option>
        <option value="csv">CSV Bulk</option>
        <option value="manual">Manual</option>
      </select>
    </div>

    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
        My Role
      </label>
      <select
        value={filterRole}
        onChange={(e) => handleFilterRoleChange(e.target.value)}
        disabled={!connectedWalletAddress}
        className={`w-full bg-zinc-900 border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer ${
          connectedWalletAddress ? "border-zinc-800 text-zinc-200" : "border-zinc-850 text-zinc-650 opacity-45 cursor-not-allowed"
        }`}
      >
        <option value="all">Any Role</option>
        <option value="creator">Creator</option>
        <option value="recipient">Recipient</option>
      </select>
    </div>
  </div>

  {hasActiveFilters && (
    <button
      onClick={resetFilters}
      className="shrink-0 self-start sm:self-end px-3 py-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-xl transition-all text-xs font-semibold whitespace-nowrap"
    >
      Reset filters
    </button>
  )}
</div>
      {loading && streams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium">Fetching real-time on-chain data...</span>
        </div>
      ) : filteredStreams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 border-2 border-dashed border-zinc-900 rounded-2xl">
          {waitingForIndex ? (
            <>
              <RefreshCw className="w-10 h-10 text-indigo-400 mb-3 animate-spin" />
              <span className="text-xs font-bold text-zinc-300">Waiting for stream to be indexed...</span>
              <span className="text-[10px] text-zinc-500 max-w-xs text-center mt-1">
                The stream was created on-chain and will appear here once the indexer picks it up. Retrying automatically.
              </span>
            </>
          ) : (
            <>
              <Layers className="w-10 h-10 text-zinc-700 mb-3" />
              <span className="text-xs font-bold text-zinc-300">No matching streams indexed</span>
            <span className="text-[10px] text-zinc-500 max-w-xs text-center mt-1">
  {hasActiveFilters
    ? "No streams match the current filters. Try resetting them."
    : connectedWalletAddress
    ? "Only streams created or received by your connected wallet are shown here unless Squads View is enabled."
    : "Connect a wallet to show your created streams, or enable Squads View and paste a Squads multisig address."}
</span>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:gap-5">
            {paginatedStreams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} onOpen={fetchStreamDetails} currentTimeTs={nowTs} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-zinc-900 bg-zinc-900/10 rounded-2xl p-4 text-xs mt-2">
              <span className="text-zinc-400 font-medium">
                Showing <span className="text-zinc-200 font-bold">{(safeCurrentPage - 1) * itemsPerPage + 1}</span> to{" "}
                <span className="text-zinc-200 font-bold">{Math.min(safeCurrentPage * itemsPerPage, filteredStreams.length)}</span> of{" "}
                <span className="text-indigo-400 font-black">{filteredStreams.length}</span> active streams
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage((prev) => Math.max(prev - 1, 1));
                  }}
                  disabled={safeCurrentPage === 1}
                  className="px-3 py-1.5 bg-zinc-950 border border-zinc-850 hover:border-zinc-750 text-zinc-350 hover:text-zinc-50 rounded-xl transition-all disabled:opacity-40 disabled:hover:text-zinc-350 disabled:cursor-not-allowed font-semibold"
                >
                  Previous
                </button>

                <div className="bg-zinc-950 border border-zinc-850 px-3 py-1.5 rounded-xl font-mono font-bold text-zinc-350 text-[10px]">
                  {safeCurrentPage} / {totalPages}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                  }}
                  disabled={safeCurrentPage === totalPages}
                  className="px-3 py-1.5 bg-zinc-950 border border-zinc-850 hover:border-zinc-750 text-zinc-350 hover:text-zinc-50 rounded-xl transition-all disabled:opacity-40 disabled:hover:text-zinc-350 disabled:cursor-not-allowed font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
