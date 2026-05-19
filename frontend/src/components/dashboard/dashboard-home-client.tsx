"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "@/lib/api";
import {
  Layers,
  RefreshCw,
  Shield,
  FileOutput,
  Search,
  Users,
  Download,
  Upload,
  Lock,
  Terminal,
} from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { NotificationBanner } from "@/components/dashboard/notification-banner";
import { CsvDiffPanel } from "@/components/dashboard/csv-diff-panel";
import { StreamCard } from "@/components/dashboard/stream-card";
import { StreamDetailsDrawer } from "@/components/dashboard/stream-details-drawer";
import type { TabId } from "@/components/dashboard/types";

export default function Home() {
  const wallet = useWallet();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("streams");
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Details Drawer State
  const [selectedStream, setSelectedStream] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Multisig States
  const [useMultisig, setUseMultisig] = useState(false);

  // CSV States
  const [createMode, setCreateMode] = useState<"manual" | "csv">("manual");
  const [csvCreateText, setCsvCreateText] = useState(
    "recipient,amount,mint,type,duration,cliff_duration,cancelable,milestones\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,1500,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,0,7200,0,true,\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,3000,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,1,15000,3600,true,\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,2000,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,2,9000,0,false,500;500;500;500"
  );
  const [csvEditText, setCsvEditText] = useState(
    "id,amount,duration,cliff_duration,cancelable,milestones\nStreamCSV-XXXXX,1800,10800,0,false,"
  );

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSquadsAddress, setFilterSquadsAddress] = useState("");
  const [showOnlySquads, setShowOnlySquads] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, showOnlySquads]);

  const fileInputCreateRef = useRef<HTMLInputElement>(null);
  const fileInputEditRef = useRef<HTMLInputElement>(null);

  // Form States
  const [createForm, setCreateForm] = useState({
    recipient: "",
    amount: "1000",
    mint: "EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr",
    type: "0", // 0: Linear, 1: Cliff, 2: Milestone
    duration: "3600",
    cancelable: true,
    cliffDuration: "600",
    milestoneCount: "4",
  });

  const [milestoneAmounts, setMilestoneAmounts] = useState<string[]>(["250", "250", "250", "250"]);

  useEffect(() => {
    const count = parseInt(createForm.milestoneCount, 10);
    if (!isNaN(count) && count > 0) {
      setMilestoneAmounts(prev => {
        const next = [...prev];
        if (next.length < count) {
          while (next.length < count) {
            next.push("0");
          }
        } else if (next.length > count) {
          next.splice(count);
        }
        return next;
      });
    }
  }, [createForm.milestoneCount]);

  const [withdrawForm, setWithdrawForm] = useState({ streamId: "", amount: "" });
  const [cancelForm, setCancelForm] = useState({ streamId: "" });
  const [unlockForm, setUnlockForm] = useState({ streamId: "", milestoneIndex: "0" });
  const [editMilestoneForm, setEditMilestoneForm] = useState({ streamId: "", index: "0", newAmount: "250" });
  const [editLinearForm, setEditLinearForm] = useState({ streamId: "", newEndTs: "", topupAmount: "" });
  const [editCliffForm, setEditCliffForm] = useState({ streamId: "", newCliffTs: "" });

  // Notifications
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info" | null;
    message: string;
  }>({ type: null, message: "" });

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: null, message: "" }), 5000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch Streams
  const fetchStreams = async () => {
    setLoading(true);
    try {
      const res = await api.get("/streams");
      setStreams(res.data);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Failed to fetch active streams from server.");
    } finally {
      setLoading(false);
    }
  };

  // CSV Diff & Versioning States & Handlers
  const [csvVersions, setCsvVersions] = useState<any[]>([]);
  const [compareVersionSelected, setCompareVersionSelected] = useState<string>("0"); // "0" means Live DB
  const [csvDiffResult, setCsvDiffResult] = useState<any | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const fetchCsvVersions = async () => {
    try {
      const res = await api.get("/csv/versions");
      setCsvVersions(res.data);
    } catch (err) {
      console.error("Failed to fetch CSV versions:", err);
    }
  };

  const handleAnalyzeDiff = async (mode: "create" | "edit") => {
    const csvText = mode === "create" ? csvCreateText : csvEditText;
    if (!csvText || csvText.trim() === "") {
      showNotification("error", "Please provide or upload a CSV file first.");
      return;
    }

    setLoadingDiff(true);
    try {
      const payload: any = {
        csvText,
        mode
      };
      if (compareVersionSelected !== "0") {
        payload.compareVersion = Number(compareVersionSelected);
      }

      const res = await api.post("/csv/diff", payload);
      setCsvDiffResult(res.data);
      showNotification("success", "CSV structural diff computed successfully!");
    } catch (err: any) {
      showNotification("error", err.response?.data?.error || "Failed to calculate CSV diff.");
    } finally {
      setLoadingDiff(false);
    }
  };

  // Fetch Single Stream Details (to load transactions)
  const fetchStreamDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/streams/${id}`);
      setSelectedStream(res.data);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Failed to fetch stream details and transaction history.");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchStreams();
    fetchCsvVersions();
    const interval = setInterval(fetchStreams, 15000);

    // Read URL query parameters to prefill actions
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab") as TabId;
      const streamId = params.get("streamId");
      if (tab) {
        setActiveTab(tab);
      }
      if (streamId) {
        if (tab === "withdraw") setWithdrawForm(prev => ({ ...prev, streamId }));
        if (tab === "cancel") setCancelForm(prev => ({ ...prev, streamId }));
        if (tab === "unlock_milestone") setUnlockForm(prev => ({ ...prev, streamId }));
        if (tab === "edit_milestone") setEditMilestoneForm(prev => ({ ...prev, streamId }));
        if (tab === "edit_linear") setEditLinearForm(prev => ({ ...prev, streamId }));
        if (tab === "edit_cliff") setEditCliffForm(prev => ({ ...prev, streamId }));
      }

      // Load Squads persistence
      const savedSquads = localStorage.getItem("squads_multisig_address");
      if (savedSquads) {
        setFilterSquadsAddress(savedSquads);
      }
    }

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const reloadData = () => {
      fetchStreams();
      fetchCsvVersions();
    };

    const handlePageShow = () => reloadData();
    const handleFocus = () => reloadData();
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        reloadData();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  const handleSquadsAddressChange = (val: string) => {
    setFilterSquadsAddress(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("squads_multisig_address", val);
    }
  };

  // Format Helpers
  const formatDate = (ts: string) => new Date(Number(ts) * 1000).toLocaleString();
  const shorten = (address: string) => address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "";

  // Helper to parse pasted CSV client-side
  const parseCsv = (csvText: string) => {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim());
    return lines.slice(1).map((line, lineIdx) => {
      const values = line.split(",").map(v => v.trim());
      const obj: any = {};
      headers.forEach((header, index) => {
        if (values[index] !== undefined) {
          obj[header] = values[index] === "true" ? true : values[index] === "false" ? false : values[index];
        }
      });

      // Handle Milestone-Based Vesting type 2 allocations
      if (Number(obj.type) === 2) {
        if (obj.milestones) {
          const parts = String(obj.milestones).split(";").map(Number).filter(n => !isNaN(n));
          obj.milestoneCount = parts.length;
          const sum = parts.reduce((a, b) => a + b, 0);
          if (sum !== Number(obj.amount)) {
            showNotification("error", `CSV Row #${lineIdx + 1}: Milestone sum (${sum.toLocaleString()}) does not match total amount (${Number(obj.amount).toLocaleString()})!`);
          }
        } else {
          // Auto-distribute into 4 equal milestones if none provided
          obj.milestoneCount = 4;
          const amt = Number(obj.amount || 0);
          const part = Math.floor(amt / 4);
          obj.milestones = Array(4).fill(part).join(";");
        }
      }
      return obj;
    });
  };

  // CSV File Reader / Selection handlers
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: "create" | "edit") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (mode === "create") {
        setCsvCreateText(text);
        showNotification("success", `CSV Loaded: ${file.name} successfully imported and loaded!`);
      } else {
        setCsvEditText(text);
        showNotification("success", `CSV Loaded: ${file.name} successfully imported and loaded!`);
      }
    };
    reader.readAsText(file);
  };

  // Download template utility
  const downloadTemplate = (mode: "create" | "edit") => {
    const headers = mode === "create"
      ? "recipient,amount,mint,type,duration,cliff_duration,cancelable,milestones\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,1500,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,0,7200,0,true,\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,3000,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,1,15000,3600,true,\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,2000,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,2,9000,0,false,500;500;500;500"
      : "id,amount,duration,cliff_duration,cancelable,milestones\nStreamCSV-XXXXX,1800,10800,0,false,";

    const blob = new Blob([headers], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", mode === "create" ? "create_streams_template.csv" : "edit_streams_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("success", `${mode === "create" ? "Creation" : "Editing"} CSV template downloaded!`);
  };

  // Export active loaded database streams to CSV
  const exportStreamsToCsv = () => {
    if (streams.length === 0) {
      showNotification("info", "No active streams indexed to export.");
      return;
    }

    const headers = "id,creator,recipient,mint,totalAmount,withdrawn,startTs,endTs,vestingType,status,cancelable,isCsvCreated,milestones\n";
    const rows = streams.map(s => 
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
    showNotification("success", "Active streams successfully exported as CSV!");
  };

  // Check if a Stream was created via CSV
  const isStreamCsvCreated = (streamId: string): boolean => {
    const stream = streams.find(s => s.id === streamId);
    return stream ? stream.isCsvCreated : false;
  };

  // Filter logic for search querying and Squads Multisig address
  const filteredStreams = streams.filter(stream => {
    // 1. Address search query filter
    const matchesSearch = searchQuery.trim() === "" ||
      stream.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.mint.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Squads address filter
    if (showOnlySquads && filterSquadsAddress.trim() !== "") {
      const isSquadsAssociated =
        stream.creator.toLowerCase() === filterSquadsAddress.toLowerCase() ||
        stream.recipient.toLowerCase() === filterSquadsAddress.toLowerCase();
      return matchesSearch && isSquadsAssociated;
    }

    // 3. Connected wallet filter
    if (wallet.connected && wallet.publicKey) {
      const walletAddr = wallet.publicKey.toString().toLowerCase();
      const isWalletAssociated =
        stream.creator.toLowerCase() === walletAddr ||
        stream.recipient.toLowerCase() === walletAddr;
      return matchesSearch && isWalletAssociated;
    }

    // If not connected and no active Squads filter is loaded, do not display unrelated streams
    return false;
  });

  // Simulators / Submit Handlers
  const handleAction = async (actionName: string, data: any) => {
    if (useMultisig) {
      showNotification("success", `Squads Multisig proposal created successfully! Redirecting you to Streams page...`);
      setTimeout(() => {
        router.push("/streams");
      }, 2000);
      return;
    }

    // Direct Manual Deploy
    if (actionName === "create_stream") {
      try {
        let payload = { ...data };
        if (data.type === "2") {
          const sum = milestoneAmounts.reduce((acc, curr) => acc + Number(curr || 0), 0);
          if (sum !== Number(data.amount)) {
            showNotification("error", `Total milestone sum (${sum}) must exactly equal total amount (${data.amount})!`);
            return;
          }
          payload = {
            ...payload,
            milestones: milestoneAmounts.map(amt => ({ amount: amt }))
          };
        }
        await api.post("/streams", payload);
        showNotification("success", `Vesting stream deployed and indexed successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Deployment failed.");
      }
      return;
    }

    // Direct CSV Bulk Deploy with Versioning
    if (actionName === "create_stream_csv") {
      try {
        const parsedItems = parseCsv(csvCreateText);
        if (parsedItems.length === 0) {
          showNotification("error", "CSV format invalid. Please provide correct headers.");
          return;
        }

        // 1. Persist file contents in Prisma version history
        await api.post("/csv/upload", {
          content: csvCreateText,
          filename: `bulk_create_v${csvVersions.length + 1}.csv`,
          uploader: wallet.publicKey?.toString() || "System Uploader"
        });

        // 2. Direct deploy
        await api.post("/streams/bulk", { items: parsedItems });
        showNotification("success", `Successfully versioned (v${csvVersions.length + 1}) and deployed ${parsedItems.length} CSV bulk streams!`);
        
        // Reset state
        setCsvDiffResult(null);
        fetchCsvVersions();
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Bulk deployment failed.");
      }
      return;
    }

    // CSV Bulk Edit with Versioning
    if (actionName === "edit_stream_csv") {
      try {
        const parsedItems = parseCsv(csvEditText);
        if (parsedItems.length === 0) {
          showNotification("error", "CSV format invalid. Please provide correct headers.");
          return;
        }

        // 1. Persist edit contents in Prisma version history
        await api.post("/csv/upload", {
          content: csvEditText,
          filename: `bulk_edit_v${csvVersions.length + 1}.csv`,
          uploader: wallet.publicKey?.toString() || "System Uploader"
        });

        // 2. Execute bulk updates
        await api.post("/streams/edit-csv", { items: parsedItems });
        showNotification("success", `Successfully versioned (v${csvVersions.length + 1}) and applied CSV bulk edits!`);
        
        // Reset state
        setCsvDiffResult(null);
        fetchCsvVersions();
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Bulk edit failed.");
      }
      return;
    }

    if (actionName === "edit_linear") {
      try {
        await api.post("/streams/edit-linear", {
          streamId: data.streamId,
          newEndTs: data.newEndTs || undefined,
          topupAmount: data.topupAmount || undefined
        });
        showNotification("success", `Linear stream timeline extended and topped up successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Failed to update linear stream.");
      }
      return;
    }

    if (!wallet.connected) {
      showNotification("info", `Wallet simulated. In real devnet, approve instruction: ${actionName}`);
      return;
    }
    // Simulation success
    showNotification("success", `Transaction submitted: Successfully executed ${actionName}!`);
  };

  // Pre-fill helpers to easily act on a stream
  const prefillAction = (tab: TabId, streamId: string) => {
    setActiveTab(tab);
    if (tab === "withdraw") setWithdrawForm({ streamId, amount: "" });
    if (tab === "cancel") setCancelForm({ streamId });
    if (tab === "unlock_milestone") setUnlockForm({ streamId, milestoneIndex: "0" });
    if (tab === "edit_milestone") setEditMilestoneForm({ streamId, index: "0", newAmount: "250" });
    if (tab === "edit_linear") setEditLinearForm({ streamId, newEndTs: "", topupAmount: "" });
    if (tab === "edit_cliff") setEditCliffForm({ streamId, newCliffTs: "" });
    
    // Close Drawer
    setSelectedStream(null);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans relative overflow-hidden flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Background Decorative Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-950/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-950/15 rounded-full blur-[160px] pointer-events-none" />

      <NotificationBanner notification={notification} />

      {/* Main Workspace Dashboard Grid */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-grow flex flex-col md:flex-row gap-8 relative z-10">
        
        <DashboardSidebar activeTab={activeTab} setActiveTab={setActiveTab} streamsCount={streams.length} />

        {/* WORKSPACE AREA */}
        <section className="flex-grow min-w-0 bg-zinc-900/25 border border-zinc-800/80 rounded-3xl p-6 backdrop-blur-sm shadow-2xl flex flex-col justify-between relative">
          
          <div className="w-full">

            {/* Squads Multisig Global Toggle Card */}
            {activeTab !== "streams" && (
              <div className="bg-zinc-950/65 border border-zinc-900 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Squads Multisig Execution</h4>
                    <p className="text-[10px] text-zinc-500">Enable this option to bundle your action as a Squads multisig proposal instead of executing directly.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-850 px-4 py-2 rounded-xl shrink-0">
                  <input
                    type="checkbox"
                    id="multisig-toggle"
                    checked={useMultisig}
                    onChange={(e) => setUseMultisig(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-800 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <label htmlFor="multisig-toggle" className="text-xs font-bold text-zinc-300 cursor-pointer select-none">
                    Use Squads Multisig
                  </label>
                </div>
              </div>
            )}
            
            {/* TAB: STREAMS LIST */}
            {activeTab === "streams" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Active Streams</h2>
                    <p className="text-xs text-zinc-400">Click on any stream to open deep details, timelines, and transactions</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
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

                {/* 🔍 PREMIUM DUAL SEARCH & FILTER BAR */}
                <div className="grid gap-3 sm:grid-cols-2 mb-6 bg-zinc-950/45 border border-zinc-900 rounded-2xl p-4">
                  {/* Address search query */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by Creator, Recipient, Mint, or PDA ID..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {/* Persistent Squads Filter Switch */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3.5 py-1 rounded-xl shrink-0">
                      <input
                        type="checkbox"
                        id="squads-filter-toggle"
                        checked={showOnlySquads}
                        onChange={(e) => setShowOnlySquads(e.target.checked)}
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

                {loading && streams.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                    <span className="text-xs font-medium">Fetching real-time on-chain data...</span>
                  </div>
                ) : filteredStreams.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-400 border-2 border-dashed border-zinc-900 rounded-2xl">
                    <Layers className="w-10 h-10 text-zinc-700 mb-3" />
                    {!wallet.connected && !(showOnlySquads && filterSquadsAddress.trim() !== "") ? (
                      <>
                        <span className="text-xs font-bold text-zinc-300">Wallet Disconnected</span>
                        <span className="text-[10px] text-zinc-500 max-w-xs text-center mt-1">Connect your Solana wallet in the header or activate the Squads Multisig filter to view active streams.</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-zinc-300">No matching streams indexed</span>
                        <span className="text-[10px] text-zinc-500 max-w-xs text-center mt-1">Adjust your search query or verify that the correct Squads Multisig address has been inputted.</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <div className="grid gap-5">
                      {(() => {
                        const paginatedStreams = filteredStreams.slice(
                          (currentPage - 1) * itemsPerPage,
                          currentPage * itemsPerPage
                        );
                          return paginatedStreams.map((stream) => (
                            <StreamCard key={stream.id} stream={stream} onOpen={fetchStreamDetails} />
                          ));
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
                              Previous
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
                              Next
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )} 
              </div>
            )}

            {/* TAB: CREATE STREAM */}
            {activeTab === "create_streams" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Create Stream</h2>
                    <p className="text-xs text-zinc-400">Deploy a manual stream or deploy multiple streams via CSV</p>
                  </div>
                  
                  {/* Switch Manual vs CSV */}
                  <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-xl">
                    <button
                      onClick={() => setCreateMode("manual")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        createMode === "manual" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Manual Form
                    </button>
                    <button
                      onClick={() => setCreateMode("csv")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        createMode === "csv" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      CSV Bulk Import
                    </button>
                  </div>
                </div>

                {createMode === "manual" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Recipient Pubkey</label>
                      <input 
                        type="text" 
                        value={createForm.recipient}
                        onChange={(e) => setCreateForm({...createForm, recipient: e.target.value})}
                        placeholder="e.g. AoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Total Amount</label>
                      <input 
                        type="number" 
                        value={createForm.amount}
                        onChange={(e) => setCreateForm({...createForm, amount: e.target.value})}
                        placeholder="Total tokens"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Token Mint</label>
                      <input 
                        type="text" 
                        value={createForm.mint}
                        onChange={(e) => setCreateForm({...createForm, mint: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Vesting Schedule Type</label>
                      <select
                        value={createForm.type}
                        onChange={(e) => setCreateForm({...createForm, type: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium"
                      >
                        <option value="0">Linear Vesting</option>
                        <option value="1">Cliff Vesting</option>
                        <option value="2">Milestone-Based Vesting</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Duration (Seconds)</label>
                      <input 
                        type="number" 
                        value={createForm.duration}
                        onChange={(e) => setCreateForm({...createForm, duration: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {createForm.type === "1" && (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Cliff Duration (Seconds)</label>
                        <input 
                          type="number" 
                          value={createForm.cliffDuration}
                          onChange={(e) => setCreateForm({...createForm, cliffDuration: e.target.value})}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    )}

                    {createForm.type === "2" && (
                      <div className="col-span-2 grid gap-4 bg-zinc-900/30 border border-zinc-900 p-4 rounded-xl">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Count</label>
                          <input 
                            type="number" 
                            value={createForm.milestoneCount}
                            onChange={(e) => setCreateForm({...createForm, milestoneCount: e.target.value})}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        
                        <div className="border-t border-zinc-900/60 pt-3">
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Milestone Amount Allocations</label>
                          <div className="grid grid-cols-2 gap-3">
                            {milestoneAmounts.map((amt, idx) => (
                              <div key={idx} className="flex flex-col gap-1">
                                <span className="text-[10px] text-zinc-400 font-mono font-bold">Milestone #{idx} Amount</span>
                                <input
                                  type="number"
                                  value={amt}
                                  onChange={(e) => {
                                    const next = [...milestoneAmounts];
                                    next[idx] = e.target.value;
                                    setMilestoneAmounts(next);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                                  placeholder="0"
                                />
                              </div>
                            ))}
                          </div>
                          
                          {(() => {
                            const sum = milestoneAmounts.reduce((acc, curr) => acc + Number(curr || 0), 0);
                            const total = Number(createForm.amount || 0);
                            const isMatched = sum === total;
                            return (
                              <div className={`mt-3 text-[10px] font-semibold font-mono ${isMatched ? "text-emerald-500" : "text-amber-500"}`}>
                                {isMatched ? (
                                  <span>✔ Allocations sum ({sum.toLocaleString()}) matches total amount ({total.toLocaleString()})!</span>
                                ) : (
                                  <span>⚠ Sum ({sum.toLocaleString()}) does not match total amount ({total.toLocaleString()}). Diff: {(total - sum).toLocaleString()}</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 h-full mt-6">
                      <input
                        type="checkbox"
                        id="cancelable"
                        checked={createForm.cancelable}
                        onChange={(e) => setCreateForm({...createForm, cancelable: e.target.checked})}
                        className="w-4 h-4 rounded border-zinc-800 text-indigo-600 bg-zinc-950 focus:ring-0 focus:ring-offset-0"
                      />
                      <label htmlFor="cancelable" className="text-xs font-semibold text-zinc-350 cursor-pointer select-none">
                        Stream is Cancelable by Creator
                      </label>
                    </div>

                    <button
                      onClick={() => handleAction("create_stream", createForm)}
                      className="col-span-2 w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                      Simulate / Deploy Stream
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {/* CSV Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => downloadTemplate("create")}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-350 transition-all"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-400" />
                          Template
                        </button>

                        <button
                          onClick={() => fileInputCreateRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-900/60 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-450 rounded-xl text-xs font-semibold transition-all"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Upload CSV
                        </button>

                        <input
                          type="file"
                          accept=".csv"
                          ref={fileInputCreateRef}
                          onChange={(e) => handleCsvUpload(e, "create")}
                          className="hidden"
                        />
                      </div>

                      {/* Diff and Versioning Baselines */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Baseline:</span>
                          <select
                            value={compareVersionSelected}
                            onChange={(e) => setCompareVersionSelected(e.target.value)}
                            className="bg-zinc-900 border border-zinc-805 rounded-xl px-2.5 py-1.5 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-indigo-500"
                          >
                            <option value="0">Live Active DB</option>
                            {csvVersions.map((v) => (
                              <option key={v.id} value={v.version}>
                                Version {v.version} ({v.filename})
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={() => handleAnalyzeDiff("create")}
                          disabled={loadingDiff}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 border border-indigo-700 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-40"
                        >
                          {loadingDiff ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-white" />
                          ) : (
                            <Layers className="w-3 h-3" />
                          )}
                          Analyze Diff
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">CSV Payload Preview / Editor</label>
                      <textarea
                        rows={6}
                        value={csvCreateText}
                        onChange={(e) => setCsvCreateText(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <CsvDiffPanel csvDiffResult={csvDiffResult} compareVersionSelected={compareVersionSelected} onClose={() => setCsvDiffResult(null)} />

                    <button
                      onClick={() => handleAction("create_stream_csv", null)}
                      className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                      Approve & Apply CSV Revision (Creates v{csvVersions.length + 1})
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB: BULK EDIT CSV */}
            {activeTab === "edit_csv" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight text-emerald-400">Bulk Edit CSV</h2>
                  <p className="text-xs text-zinc-400">Modify multiple CSV-created streams simultaneously via CSV updates</p>
                </div>

                <div className="grid gap-4">
                  {/* CSV Edit Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => downloadTemplate("edit")}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-305 transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-450" />
                        Template
                      </button>

                      <button
                        onClick={() => fileInputEditRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-900/60 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 rounded-xl text-xs font-semibold transition-all"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload CSV
                      </button>

                      <input
                        type="file"
                        accept=".csv"
                        ref={fileInputEditRef}
                        onChange={(e) => handleCsvUpload(e, "edit")}
                        className="hidden"
                      />
                    </div>

                    {/* Diff baseline select and action */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Baseline:</span>
                        <select
                          value={compareVersionSelected}
                          onChange={(e) => setCompareVersionSelected(e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-[10px] text-zinc-300 font-extrabold focus:outline-none focus:border-indigo-500"
                        >
                          <option value="0">Live Active DB</option>
                          {csvVersions.map((v) => (
                            <option key={v.id} value={v.version}>
                              Version {v.version} ({v.filename})
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => handleAnalyzeDiff("edit")}
                        disabled={loadingDiff}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-700 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-40"
                      >
                        {loadingDiff ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-white" />
                        ) : (
                          <Layers className="w-3 h-3" />
                        )}
                        Analyze Diff
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">CSV Edit Payload Preview / Editor</label>
                    <textarea
                      rows={6}
                      value={csvEditText}
                      onChange={(e) => setCsvEditText(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <CsvDiffPanel csvDiffResult={csvDiffResult} compareVersionSelected={compareVersionSelected} onClose={() => setCsvDiffResult(null)} />

                  <button
                    onClick={() => handleAction("edit_stream_csv", null)}
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20"
                  >
                    Approve & Apply CSV Revision (Creates v{csvVersions.length + 1})
                  </button>
                </div>
              </div>
            )}

            {/* TAB: WITHDRAW CLAIM */}
            {activeTab === "withdraw" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight">Withdraw Claim</h2>
                  <p className="text-xs text-zinc-400">Withdraw matured/unlocked tokens from an active vesting stream</p>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                    <input 
                      type="text" 
                      value={withdrawForm.streamId}
                      onChange={(e) => setWithdrawForm({...withdrawForm, streamId: e.target.value})}
                      placeholder="e.g. CRVof8J8vfph1zWnh5vJgrDpMQHGWkdPEr4A6rXTZPTk"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Amount to Claim</label>
                    <input 
                      type="number" 
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm({...withdrawForm, amount: e.target.value})}
                      placeholder="Claim all available tokens if blank"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <button
                  onClick={() => handleAction("withdraw", withdrawForm)}
                  className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
                >
                  Claim Claimable Tokens
                </button>
              </div>
            )}

            {/* TAB: CANCEL STREAM */}
            {activeTab === "cancel" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight">Cancel Stream</h2>
                  <p className="text-xs text-zinc-400">Cancel vesting and refund remaining locked tokens back to creator</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                  <input 
                    type="text" 
                    value={cancelForm.streamId}
                    onChange={(e) => setCancelForm({...cancelForm, streamId: e.target.value})}
                    placeholder="e.g. CRVof8J8vfph1zWnh5vJgrDpMQHGWkdPEr4A6rXTZPTk"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <button
                  onClick={() => handleAction("cancel", cancelForm)}
                  className="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-red-500/20"
                >
                  Cancel and Refund
                </button>
              </div>
            )}

            {/* TAB: UNLOCK MILESTONE */}
            {activeTab === "unlock_milestone" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight">Unlock Milestone</h2>
                  <p className="text-xs text-zinc-400">Release milestone allocations sequentially based on milestones attained</p>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                    <input 
                      type="text" 
                      value={unlockForm.streamId}
                      onChange={(e) => setUnlockForm({...unlockForm, streamId: e.target.value})}
                      placeholder="e.g. CRVof8J8vfph1zWnh5vJgrDpMQHGWkdPEr4A6rXTZPTk"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Index</label>
                    <input 
                      type="number" 
                      value={unlockForm.milestoneIndex}
                      onChange={(e) => setUnlockForm({...unlockForm, milestoneIndex: e.target.value})}
                      placeholder="0"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <button
                  onClick={() => handleAction("unlock_milestone", unlockForm)}
                  className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
                >
                  Unlock Milestone
                </button>
              </div>
            )}

            {/* TAB: EDIT MILESTONE */}
            {activeTab === "edit_milestone" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight">Edit Milestone Structure</h2>
                  <p className="text-xs text-zinc-400">Modify milestone details or adjust allocated milestone target amounts</p>
                </div>

                {isStreamCsvCreated(editMilestoneForm.streamId) ? (
                  <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
                    <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
                      <p className="text-xs text-red-400/80 mt-1 leading-relaxed">
                        This stream was created via **CSV Import**. To comply with consistency requirements, CSV-created streams **must** be edited exclusively using the **Bulk Edit CSV** console.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                      <input 
                        type="text" 
                        value={editMilestoneForm.streamId}
                        onChange={(e) => setEditMilestoneForm({...editMilestoneForm, streamId: e.target.value})}
                        placeholder="e.g. CRVof8J8vfph1zWnh5vJgrDpMQHGWkdPEr4A6rXTZPTk"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Index</label>
                      <input 
                        type="number" 
                        value={editMilestoneForm.index}
                        onChange={(e) => setEditMilestoneForm({...editMilestoneForm, index: e.target.value})}
                        placeholder="0"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Allocation Amount</label>
                      <input 
                        type="number" 
                        value={editMilestoneForm.newAmount}
                        onChange={(e) => setEditMilestoneForm({...editMilestoneForm, newAmount: e.target.value})}
                        placeholder="New token count"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  disabled={isStreamCsvCreated(editMilestoneForm.streamId)}
                  onClick={() => handleAction("edit_milestone", editMilestoneForm)}
                  className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${
                    isStreamCsvCreated(editMilestoneForm.streamId)
                      ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50"
                      : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
                  }`}
                >
                  Apply Milestone Edits
                </button>
              </div>
            )}

            {/* TAB: EDIT LINEAR */}
            {activeTab === "edit_linear" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight">Edit Linear Timeline</h2>
                  <p className="text-xs text-zinc-400">Modify linear timelines or extend stream end thresholds</p>
                </div>

                {isStreamCsvCreated(editLinearForm.streamId) ? (
                  <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
                    <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
                      <p className="text-xs text-red-400/80 mt-1 leading-relaxed">
                        This stream was created via **CSV Import**. To comply with consistency requirements, CSV-created streams **must** be edited exclusively using the **Bulk Edit CSV** console.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                      <input 
                        type="text" 
                        value={editLinearForm.streamId}
                        onChange={(e) => setEditLinearForm({...editLinearForm, streamId: e.target.value})}
                        placeholder="e.g. CRVof8J8vfph1zWnh5vJgrDpMQHGWkdPEr4A6rXTZPTk"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New End Timestamp (Seconds)</label>
                      <input 
                        type="number" 
                        value={editLinearForm.newEndTs}
                        onChange={(e) => setEditLinearForm({...editLinearForm, newEndTs: e.target.value})}
                        placeholder="e.g. 1779010000"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Top-up Amount (Tokens to Add)</label>
                      <input 
                        type="number" 
                        value={editLinearForm.topupAmount}
                        onChange={(e) => setEditLinearForm({...editLinearForm, topupAmount: e.target.value})}
                        placeholder="e.g. 500"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                <button
                  disabled={isStreamCsvCreated(editLinearForm.streamId)}
                  onClick={() => handleAction("edit_linear", editLinearForm)}
                  className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${
                    isStreamCsvCreated(editLinearForm.streamId)
                      ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50"
                      : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
                  }`}
                >
                  Update End Timeline & Top-up Stream
                </button>
              </div>
            )}

            {/* TAB: EDIT CLIFF */}
            {activeTab === "edit_cliff" && (
              <div className="animate-in fade-in-30 duration-200">
                <div className="border-b border-zinc-900 pb-4 mb-6">
                  <h2 className="text-2xl font-extrabold tracking-tight">Edit Cliff Conditions</h2>
                  <p className="text-xs text-zinc-400">Modify cliff release durations or shift lockup parameters</p>
                </div>

                {isStreamCsvCreated(editCliffForm.streamId) ? (
                  <div className="bg-red-950/45 border border-red-500/30 rounded-2xl p-5 text-red-300 flex items-start gap-4 mb-6">
                    <Lock className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-extrabold">Manual Edit Locked!</h4>
                      <p className="text-xs text-red-400/80 mt-1 leading-relaxed">
                        This stream was created via **CSV Import**. To comply with consistency requirements, CSV-created streams **must** be edited exclusively using the **Bulk Edit CSV** console.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stream ID (PDA Address)</label>
                      <input 
                        type="text" 
                        value={editCliffForm.streamId}
                        onChange={(e) => setEditCliffForm({...editCliffForm, streamId: e.target.value})}
                        placeholder="e.g. CRVof8J8vfph1zWnh5vJgrDpMQHGWkdPEr4A6rXTZPTk"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Cliff Unlock Timestamp (Seconds)</label>
                      <input 
                        type="number" 
                        value={editCliffForm.newCliffTs}
                        onChange={(e) => setEditCliffForm({...editCliffForm, newCliffTs: e.target.value})}
                        placeholder="e.g. 1779005000"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                <button
                  disabled={isStreamCsvCreated(editCliffForm.streamId)}
                  onClick={() => handleAction("edit_cliff", editCliffForm)}
                  className={`w-full mt-6 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg ${
                    isStreamCsvCreated(editCliffForm.streamId)
                      ? "bg-zinc-850 border border-zinc-800 text-zinc-550 cursor-not-allowed opacity-50"
                      : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20"
                  }`}
                >
                  Adjust Cliff Timestamp
                </button>
              </div>
            )}

          </div>

          {/* DYNAMIC CLI / AGENT EQUIVALENT BOX */}
          <div className="mt-12 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 font-mono text-[11px] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 flex gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            
            <div className="flex items-center gap-2 text-indigo-400 font-bold mb-2">
              <Terminal className="w-4 h-4 shrink-0" />
              <span>Equivalent CLI / Agent Skill Call</span>
            </div>
            
            <div className="text-zinc-400 select-all overflow-x-auto whitespace-nowrap scrollbar-none py-1">
              {activeTab === "streams" && (
                <span>$ mancer-flow list-streams --endpoint devnet</span>
              )}
              {activeTab === "create_streams" && (
                <span>
                  {createMode === "manual" ? (
                    `$ mancer-flow create-stream --recipient ${createForm.recipient || "<address>"} --amount ${createForm.amount} --type ${createForm.type === "0" ? "linear" : createForm.type === "1" ? "milestone" : "cliff"} --duration ${createForm.duration}`
                  ) : (
                    `$ mancer-flow create-bulk --csv ./vesting_list.csv --endpoint devnet`
                  )}
                </span>
              )}
              {activeTab === "edit_csv" && (
                <span>$ mancer-flow edit-bulk --csv ./vesting_edits.csv --endpoint devnet</span>
              )}
              {activeTab === "withdraw" && (
                <span>
                  $ mancer-flow claim-tokens --stream {withdrawForm.streamId || "<stream_pda>"} {withdrawForm.amount ? `--amount ${withdrawForm.amount}` : ""}
                </span>
              )}
              {activeTab === "cancel" && (
                <span>
                  $ mancer-flow cancel-stream --stream {cancelForm.streamId || "<stream_pda>"}
                </span>
              )}
              {activeTab === "unlock_milestone" && (
                <span>
                  $ mancer-flow unlock-milestone --stream {unlockForm.streamId || "<stream_pda>"} --index {unlockForm.milestoneIndex}
                </span>
              )}
              {activeTab === "edit_milestone" && (
                <span>
                  $ mancer-flow edit-milestone --stream {editMilestoneForm.streamId || "<stream_pda>"} --index {editMilestoneForm.index} --amount {editMilestoneForm.newAmount}
                </span>
              )}
              {activeTab === "edit_linear" && (
                <span>
                  $ mancer-flow edit-linear --stream {editLinearForm.streamId || "<stream_pda>"} {editLinearForm.newEndTs ? `--end-ts ${editLinearForm.newEndTs}` : ""} {editLinearForm.topupAmount ? `--topup ${editLinearForm.topupAmount}` : ""}
                </span>
              )}
              {activeTab === "edit_cliff" && (
                <span>
                  $ mancer-flow edit-cliff --stream {editCliffForm.streamId || "<stream_pda>"} --cliff-ts {editCliffForm.newCliffTs || "<timestamp>"}
                </span>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SLIDE-OVER PREMIUM DRAWER PANEL FOR STREAM DETAILS & TRANSACTION LOGS */}
          {/* ========================================================================= */}
          <StreamDetailsDrawer
            selectedStream={selectedStream}
            loadingDetails={loadingDetails}
            copiedId={copiedId}
            copyToClipboard={copyToClipboard}
            prefillAction={prefillAction}
            setActiveTab={setActiveTab}
            setCsvEditText={setCsvEditText}
            setSelectedStream={setSelectedStream}
          />

        </section>

      </div>
    </main>
  );
}
