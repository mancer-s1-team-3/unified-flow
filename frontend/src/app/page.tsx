"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { 
  Sparkles, PlusCircle, Layers, ArrowDownRight, XCircle, 
  Settings, RefreshCw, BookOpen, Clock, Unlock, ChevronRight, 
  Terminal, Shield, CheckCircle2, AlertCircle, Copy, Check, X,
  ArrowUpRight, Info, History, Calendar, FileText, Lock,
  Download, Upload, FileOutput, Search, Users
} from "lucide-react";

type TabId = 
  | "create_streams" 
  | "streams" 
  | "withdraw" 
  | "cancel" 
  | "edit_milestone" 
  | "edit_linear" 
  | "edit_cliff" 
  | "unlock_milestone"
  | "edit_csv";

export default function Home() {
  const wallet = useWallet();
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
    "recipient,amount,mint,type,duration,cancelable\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,1500,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,0,7200,true\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,2500,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,1,9000,false"
  );
  const [csvEditText, setCsvEditText] = useState(
    "id,amount,duration,cancelable\nStreamCSV-XXXXX,1800,10800,false"
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
    type: "0", // 0: Linear, 1: Milestone, 2: Cliff
    duration: "3600",
    cancelable: true,
    cliffDuration: "600",
    milestoneCount: "4",
  });

  const [withdrawForm, setWithdrawForm] = useState({ streamId: "", amount: "" });
  const [cancelForm, setCancelForm] = useState({ streamId: "" });
  const [unlockForm, setUnlockForm] = useState({ streamId: "", milestoneIndex: "0" });
  const [editMilestoneForm, setEditMilestoneForm] = useState({ streamId: "", index: "0", newAmount: "250" });
  const [editLinearForm, setEditLinearForm] = useState({ streamId: "", newEndTs: "" });
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
    return lines.slice(1).map(line => {
      const values = line.split(",").map(v => v.trim());
      const obj: any = {};
      headers.forEach((header, index) => {
        if (values[index] !== undefined) {
          obj[header] = values[index] === "true" ? true : values[index] === "false" ? false : values[index];
        }
      });
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
      ? "recipient,amount,mint,type,duration,cancelable\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,1500,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,0,7200,true\nAoFGFuBasrNZ7bs9XddzyvMvYhZPGJHpWKGLG2CU62EY,2500,EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr,1,9000,false"
      : "id,amount,duration,cancelable\nStreamCSV-XXXXX,1800,10800,false";

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

    const headers = "id,creator,recipient,mint,totalAmount,withdrawn,startTs,endTs,vestingType,status,cancelable,isCsvCreated\n";
    const rows = streams.map(s => 
      `"${s.id}","${s.creator}","${s.recipient}","${s.mint}",${s.totalAmount},${s.withdrawn},${s.startTs},${s.endTs},${s.vestingType},${s.status},${s.cancelable},${s.isCsvCreated}`
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

    return matchesSearch;
  });

  // Simulators / Submit Handlers
  const handleAction = async (actionName: string, data: any) => {
    if (useMultisig) {
      showNotification("success", `Squads Multisig proposal created successfully! Redirecting you to Streams page...`);
      setTimeout(() => {
        window.location.href = "/streams";
      }, 2000);
      return;
    }

    // Direct Manual Deploy
    if (actionName === "create_stream") {
      try {
        await api.post("/streams", data);
        showNotification("success", `Vesting stream deployed and indexed successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Deployment failed.");
      }
      return;
    }

    // Direct CSV Bulk Deploy
    if (actionName === "create_stream_csv") {
      try {
        const parsedItems = parseCsv(csvCreateText);
        if (parsedItems.length === 0) {
          showNotification("error", "CSV format invalid. Please provide correct headers.");
          return;
        }
        await api.post("/streams/bulk", { items: parsedItems });
        showNotification("success", `Successfully deployed & indexed ${parsedItems.length} CSV bulk streams!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Bulk deployment failed.");
      }
      return;
    }

    // CSV Bulk Edit
    if (actionName === "edit_stream_csv") {
      try {
        const parsedItems = parseCsv(csvEditText);
        if (parsedItems.length === 0) {
          showNotification("error", "CSV format invalid. Please provide correct headers.");
          return;
        }
        await api.post("/streams/edit-csv", { items: parsedItems });
        showNotification("success", `CSV bulk edits applied successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || "Bulk edit failed.");
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
    if (tab === "edit_linear") setEditLinearForm({ streamId, newEndTs: "" });
    if (tab === "edit_cliff") setEditCliffForm({ streamId, newCliffTs: "" });
    
    // Close Drawer
    setSelectedStream(null);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans relative overflow-hidden flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Background Decorative Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-950/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-950/15 rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-7xl mx-auto w-full px-6 py-5 border-b border-zinc-900/80 flex justify-between items-center relative z-20 backdrop-blur-md bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5.5 h-5.5 text-zinc-50" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-wider bg-gradient-to-r from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Unified Flow
            </span>
            <div className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase">Protocol Dashboard</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Link
            href="/docs"
            className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 font-medium transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 px-3.5 py-2 rounded-xl"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Developer Docs
          </Link>
          <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-700 !transition-all !rounded-xl !h-10 !text-xs !font-bold !px-5 shadow-lg shadow-indigo-500/10 hover:scale-[1.02]" />
        </div>
      </header>

      {/* Global Notification Banner */}
      {notification.type && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-lg shadow-xl ${
            notification.type === "success" 
              ? "bg-emerald-950/45 border-emerald-500/30 text-emerald-300"
              : notification.type === "error"
              ? "bg-red-950/45 border-red-500/30 text-red-300"
              : "bg-indigo-950/45 border-indigo-500/30 text-indigo-300"
          }`}>
            {notification.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {notification.type === "error" && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
            {notification.type === "info" && <Shield className="w-5 h-5 text-indigo-400 shrink-0" />}
            <span className="text-xs font-semibold">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Dashboard Grid */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-grow flex flex-col md:flex-row gap-8 relative z-10">
        
        {/* SIDEBAR TABS BAR */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2">
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 mb-2">Vesting Operations</div>
          
          <button
            onClick={() => setActiveTab("streams")}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
              activeTab === "streams" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4" />
              <span className="text-xs">Active Streams</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800/80 font-mono text-zinc-400">
              {streams.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("create_streams")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "create_streams" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span className="text-xs">Create Stream</span>
          </button>

          <button
            onClick={() => setActiveTab("withdraw")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "withdraw" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            <span className="text-xs">Withdraw Claim</span>
          </button>

          <button
            onClick={() => setActiveTab("cancel")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "cancel" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span className="text-xs">Cancel Stream</span>
          </button>

          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 mt-6 mb-2">Structure Editors</div>

          <button
            onClick={() => setActiveTab("unlock_milestone")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "unlock_milestone" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Unlock className="w-4 h-4" />
            <span className="text-xs">Unlock Milestone</span>
          </button>

          <button
            onClick={() => setActiveTab("edit_csv")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "edit_csv" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">Bulk Edit CSV</span>
          </button>

          <button
            onClick={() => setActiveTab("edit_milestone")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "edit_milestone" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs">Edit Milestone Struct</span>
          </button>

          <button
            onClick={() => setActiveTab("edit_linear")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "edit_linear" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-xs">Edit Linear Timeline</span>
          </button>

          <button
            onClick={() => setActiveTab("edit_cliff")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === "edit_cliff" 
                ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-bold"
                : "hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span className="text-xs">Edit Cliff Conditions</span>
          </button>
        </aside>

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
                    <span className="text-xs font-bold text-zinc-300">No matching streams indexed</span>
                    <span className="text-[10px] text-zinc-500 max-w-xs text-center mt-1">Adjust your search query or verify that the correct Squads Multisig address has been inputted.</span>
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

                          let vested = 0;
                          let progress = 0;

                          if (stream.vestingType === 1) {
                            // Milestone-based: progress is discrete based on unlocked amount
                            vested = unlocked;
                            progress = Math.min((unlocked / total) * 100, 100);
                          } else if (stream.vestingType === 2) {
                            // Cliff-based: 0 before cliff timestamp, 100% after
                            if (now < cliff) {
                              vested = 0;
                              progress = 0;
                            } else {
                              vested = total;
                              progress = 100;
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
                          const isEnded = now >= end;

                          return (
                            <div 
                              key={stream.id}
                              onClick={() => fetchStreamDetails(stream.id)}
                              className="bg-zinc-950/65 border border-zinc-900 hover:border-indigo-500/50 hover:bg-zinc-950/90 rounded-2xl p-5 transition-all shadow-md group relative overflow-hidden cursor-pointer"
                            >
                              {/* Hover Accent Glow */}
                              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />

                              {/* Top Status and Copy Actions */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Stream PDA</span>
                                  <div className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded font-mono text-[10px] border border-zinc-850">
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
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                                    : isNotStarted
                                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                                }`}>
                                  {isCompleted ? "Completed" : isEnded ? "Ended" : isNotStarted ? "Scheduled" : "Streaming"}
                                </span>
                              </div>

                              {/* Progress Bar */}
                              <div className="mb-4">
                                <div className="flex justify-between items-center text-xs mb-1.5">
                                  <span className="font-semibold text-zinc-400">Vesting Completion</span>
                                  <span className="font-mono text-zinc-200 font-bold">{progress.toFixed(2)}%</span>
                                </div>
                                <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/40">
                                  <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>

                              {/* Data Matrix */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-zinc-900/35 border border-zinc-900/60 rounded-xl p-3.5 text-xs">
                                <div>
                                  <div className="text-zinc-500 font-medium">Total Amount</div>
                                  <div className="font-bold text-zinc-200">{total.toLocaleString()} tokens</div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 font-medium">Claimable</div>
                                  <div className="font-bold text-indigo-400">{claimable.toLocaleString()} tokens</div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 font-medium">Withdrawn</div>
                                  <div className="font-bold text-zinc-200">{withdrawn.toLocaleString()} tokens</div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 font-medium">Type</div>
                                  <div className="font-semibold text-zinc-300 uppercase tracking-wider text-[10px]">
                                    {stream.vestingType === 0 ? "Linear" : stream.vestingType === 1 ? "Milestone" : "Cliff"}
                                  </div>
                                </div>
                              </div>

                              {/* Click Indicator */}
                              <div className="mt-4 flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                                <span>Start: {formatDate(stream.startTs)}</span>
                                <span className="text-indigo-400 flex items-center gap-0.5 font-bold group-hover:translate-x-0.5 transition-transform">
                                  View Detailed Timeline <ChevronRight className="w-3.5 h-3.5" />
                                </span>
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
                        <option value="1">Milestone-Based Vesting</option>
                        <option value="2">Cliff Vesting</option>
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
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Count</label>
                        <input 
                          type="number" 
                          value={createForm.milestoneCount}
                          onChange={(e) => setCreateForm({...createForm, milestoneCount: e.target.value})}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    )}

                    {createForm.type === "2" && (
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
                    <div className="flex flex-wrap items-center gap-3 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
                      
                      <button
                        onClick={() => downloadTemplate("create")}
                        className="flex items-center gap-1.5 px-3.5 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-300 transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-400" />
                        Download Template
                      </button>

                      <button
                        onClick={() => fileInputCreateRef.current?.click()}
                        className="flex items-center gap-1.5 px-3.5 py-2 border border-indigo-900/60 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-400 rounded-xl text-xs font-semibold transition-all"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload CSV File
                      </button>

                      <input
                        type="file"
                        accept=".csv"
                        ref={fileInputCreateRef}
                        onChange={(e) => handleCsvUpload(e, "create")}
                        className="hidden"
                      />
                      
                      <span className="text-[10px] text-zinc-500 font-medium">CSV Columns: recipient, amount, mint, type, duration, cancelable</span>
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

                    <button
                      onClick={() => handleAction("create_stream_csv", null)}
                      className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                      Deploy CSV Bulk Streams
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
                  <div className="flex flex-wrap items-center gap-3 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
                    
                    <button
                      onClick={() => downloadTemplate("edit")}
                      className="flex items-center gap-1.5 px-3.5 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl text-xs font-semibold text-zinc-300 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      Download Template
                    </button>

                    <button
                      onClick={() => fileInputEditRef.current?.click()}
                      className="flex items-center gap-1.5 px-3.5 py-2 border border-emerald-900/60 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 rounded-xl text-xs font-semibold transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload CSV File
                    </button>

                    <input
                      type="file"
                      accept=".csv"
                      ref={fileInputEditRef}
                      onChange={(e) => handleCsvUpload(e, "edit")}
                      className="hidden"
                    />

                    <span className="text-[10px] text-zinc-500 font-medium">CSV Columns: id, amount, duration, cancelable</span>
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

                  <button
                    onClick={() => handleAction("edit_stream_csv", null)}
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20"
                  >
                    Apply CSV Bulk Edits
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
                  Update End Timeline
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
                  $ mancer-flow edit-linear --stream {editLinearForm.streamId || "<stream_pda>"} --end-ts {editLinearForm.newEndTs || "<timestamp>"}
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
          {selectedStream && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md rounded-3xl z-40 flex justify-end animate-in fade-in duration-200">
              
              {/* Drawer Container */}
              <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full rounded-r-3xl flex flex-col justify-between p-6 shadow-2xl relative animate-in slide-in-from-right duration-350">
                
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
                          {selectedStream.vestingType === 1 ? "Milestone Unlock Progress" : "Claim Completeness Index"}
                        </div>
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-xl font-black font-mono bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                            {(() => {
                              const total = Number(selectedStream.totalAmount);
                              const withdrawn = Number(selectedStream.withdrawn);
                              const unlocked = Number(selectedStream.unlockedAmount || 0);
                              const value = selectedStream.vestingType === 1 ? unlocked : withdrawn;
                              return ((value / total) * 100).toFixed(1);
                            })()}%
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {selectedStream.vestingType === 1 ? (
                              `${Number(selectedStream.unlockedAmount || 0).toLocaleString()} / ${Number(selectedStream.totalAmount).toLocaleString()} Unlocked`
                            ) : (
                              `${Number(selectedStream.withdrawn).toLocaleString()} / ${Number(selectedStream.totalAmount).toLocaleString()} Claimed`
                            )}
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
                                return selectedStream.vestingType === 1 ? unlocked : withdrawn;
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
                              onClick={() => copyToClipboard(selectedStream.id, "drawer_id")}
                              className="text-zinc-500 hover:text-zinc-300 shrink-0"
                            >
                              {copiedId === "drawer_id" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3">
                          <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Vesting Mode</span>
                            <span className="font-semibold text-zinc-300">
                              {selectedStream.vestingType === 0 ? "Linear Stream" : selectedStream.vestingType === 1 ? "Milestone-Based" : "Cliff Lockup"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Creation Origin</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block ${
                              selectedStream.isCsvCreated
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                                : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25"
                            }`}>
                              {selectedStream.isCsvCreated ? "CSV Bulk" : "Manual"}
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

                        {selectedStream.vestingType === 1 && (
                          <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/60 pt-3">
                            <div>
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Unlocked Amount</span>
                              <span className="font-semibold text-emerald-400 font-mono">
                                {Number(selectedStream.unlockedAmount || 0).toLocaleString()} tokens
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Claimable Remaining</span>
                              <span className="font-semibold text-indigo-400 font-mono">
                                {Math.max(Number(selectedStream.unlockedAmount || 0) - Number(selectedStream.withdrawn), 0).toLocaleString()} tokens
                              </span>
                            </div>
                          </div>
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

                {/* Instant Quick Action Prefillers Footer */}
                {!loadingDetails && (
                  <div className="border-t border-zinc-900 pt-4 flex flex-col gap-2">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Instant Action Shortcuts</div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                      <button
                        onClick={() => prefillAction("withdraw", selectedStream.id)}
                        className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-zinc-50 py-2.5 rounded-xl transition-all"
                      >
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        Claim Tokens
                      </button>

                      {selectedStream.cancelable && (
                        <button
                          onClick={() => prefillAction("cancel", selectedStream.id)}
                          className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-red-400 hover:text-red-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel Stream
                        </button>
                      )}

                      {selectedStream.isCsvCreated ? (
                        <button
                          onClick={() => {
                            setActiveTab("edit_csv");
                            setCsvEditText(`id,amount,duration,cancelable\n${selectedStream.id},${selectedStream.totalAmount},3600,${selectedStream.cancelable}`);
                            setSelectedStream(null);
                          }}
                          className="col-span-2 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Edit via CSV Console
                        </button>
                      ) : (
                        <>
                          {selectedStream.vestingType === 1 && (
                            <button
                              onClick={() => prefillAction("unlock_milestone", selectedStream.id)}
                              className="col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 border border-zinc-800 hover:border-zinc-700 py-2.5 rounded-xl transition-all"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              Unlock Milestone Target
                            </button>
                          )}

                          <button
                            onClick={() => {
                              const tab = selectedStream.vestingType === 0 ? "edit_linear" : selectedStream.vestingType === 1 ? "edit_milestone" : "edit_cliff";
                              prefillAction(tab, selectedStream.id);
                            }}
                            className="col-span-2 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-850 hover:border-zinc-750 py-2.5 rounded-xl transition-all"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Modify Vesting Structure
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

        </section>

      </div>

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