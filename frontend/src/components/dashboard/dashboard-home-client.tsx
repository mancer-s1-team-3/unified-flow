"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { NotificationBanner } from "@/components/dashboard/notification-banner";
import { StreamDetailsDrawer } from "@/components/dashboard/stream-details-drawer";
import { DashboardStreamsPanel } from "@/components/dashboard/dashboard-streams-panel";
import type { TabId } from "@/components/dashboard/types";

type Props = {
  initialStreams?: any[];
};

const DashboardActionPanels = dynamic(
  () => import("@/components/dashboard/dashboard-action-panels").then((mod) => mod.DashboardActionPanels),
  { ssr: false, loading: () => null }
);

export default function Home({ initialStreams = [] }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("streams");
  const [streams, setStreams] = useState<any[]>(initialStreams);
  const [loading, setLoading] = useState(initialStreams.length === 0);
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

  const showNotification = useCallback((type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: null, message: "" }), 5000);
  }, []);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Fetch Streams
  const fetchStreams = useCallback(async () => {
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
  }, [showNotification]);

  // CSV Diff & Versioning States & Handlers
  const [csvVersions, setCsvVersions] = useState<any[]>([]);
  const [compareVersionSelected, setCompareVersionSelected] = useState<string>("0"); // "0" means Live DB
  const [csvDiffResult, setCsvDiffResult] = useState<any | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const fetchCsvVersions = useCallback(async () => {
    try {
      const res = await api.get("/csv/versions");
      setCsvVersions(res.data);
    } catch (err) {
      console.error("Failed to fetch CSV versions:", err);
    }
  }, []);

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
  const fetchStreamDetails = useCallback(async (id: string) => {
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
  }, [showNotification]);

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

  const handleMilestoneCountChange = useCallback((val: string) => {
    setCreateForm((prev) => ({ ...prev, milestoneCount: val }));

    const count = parseInt(val, 10);
    if (Number.isNaN(count) || count <= 0) return;

    setMilestoneAmounts((prev) => {
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
  }, []);

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

  // Check if a Stream was created via CSV
  const isStreamCsvCreated = (streamId: string): boolean => {
    const stream = streams.find(s => s.id === streamId);
    return stream ? stream.isCsvCreated : false;
  };

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
          uploader: "System Uploader"
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
          uploader: "System Uploader"
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
      <div className="hidden md:block absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-950/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="hidden md:block absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-950/15 rounded-full blur-[160px] pointer-events-none" />

      <NotificationBanner notification={notification} />

      {/* Main Workspace Dashboard Grid */}
      <div className="max-w-7xl mx-auto w-full px-4 py-4 sm:px-6 sm:py-8 flex-grow flex flex-col md:flex-row gap-4 md:gap-8 relative z-10">
        
        <DashboardSidebar activeTab={activeTab} setActiveTab={setActiveTab} streamsCount={streams.length} />

        {/* WORKSPACE AREA */}
        <section className="flex-grow min-w-0 bg-zinc-900/25 border border-zinc-800/80 rounded-3xl p-4 sm:p-6 md:backdrop-blur-sm md:shadow-2xl shadow-none flex flex-col justify-between relative">
          
          <div className="w-full">

            {activeTab === "streams" && (
              <DashboardStreamsPanel
                streams={streams}
                loading={loading}
                nowTs={Math.floor(Date.now() / 1000)}
                fetchStreams={fetchStreams}
                fetchStreamDetails={fetchStreamDetails}
              />
            )}

            {activeTab !== "streams" && (
              <DashboardActionPanels
                activeTab={activeTab}
                useMultisig={useMultisig}
                setUseMultisig={setUseMultisig}
                createMode={createMode}
                setCreateMode={setCreateMode}
                createForm={createForm}
                setCreateForm={setCreateForm}
                milestoneAmounts={milestoneAmounts}
                setMilestoneAmounts={setMilestoneAmounts}
                csvCreateText={csvCreateText}
                setCsvCreateText={setCsvCreateText}
                csvEditText={csvEditText}
                setCsvEditText={setCsvEditText}
                compareVersionSelected={compareVersionSelected}
                setCompareVersionSelected={setCompareVersionSelected}
                csvVersions={csvVersions}
                csvDiffResult={csvDiffResult}
                setCsvDiffResult={setCsvDiffResult}
                loadingDiff={loadingDiff}
                handleAnalyzeDiff={handleAnalyzeDiff}
                handleAction={handleAction}
                downloadTemplate={downloadTemplate}
                fileInputCreateRef={fileInputCreateRef}
                fileInputEditRef={fileInputEditRef}
                handleCsvUpload={handleCsvUpload}
                withdrawForm={withdrawForm}
                setWithdrawForm={setWithdrawForm}
                cancelForm={cancelForm}
                setCancelForm={setCancelForm}
                unlockForm={unlockForm}
                setUnlockForm={setUnlockForm}
                editMilestoneForm={editMilestoneForm}
                setEditMilestoneForm={setEditMilestoneForm}
                editLinearForm={editLinearForm}
                setEditLinearForm={setEditLinearForm}
                editCliffForm={editCliffForm}
                setEditCliffForm={setEditCliffForm}
                isStreamCsvCreated={isStreamCsvCreated}
                copiedId={copiedId}
                copyToClipboard={copyToClipboard}
                prefillAction={prefillAction}
                setActiveTab={setActiveTab}
              />
            )}

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

          </div>

        </section>

      </div>
    </main>
  );
}
