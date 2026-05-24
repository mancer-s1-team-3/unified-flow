"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useClusterState, useWalletConnection } from "@solana/react-hooks";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { NotificationBanner } from "@/components/dashboard/notification-banner";
import { StreamDetailsDrawer } from "@/components/dashboard/stream-details-drawer";
import { DashboardStreamsPanel } from "@/components/dashboard/dashboard-streams-panel";
import { ChatbotWidget } from "@/components/dashboard/chatbot-widget";
import type { TabId } from "@/components/dashboard/types";
import { createStreamBatchOnChain, createStreamOnChain } from "@/lib/solana/create-stream";
import { editCliffOnChain } from "@/lib/solana/edit-cliff";
import { editLinearOnChain } from "@/lib/solana/edit-linear";
import { editMilestoneOnChain } from "@/lib/solana/edit-milestone";
import { editStreamBatchOnChain } from "@/lib/solana/edit-stream";
import { withdrawFromStreamOnChain } from "@/lib/solana/withdraw";
import { cancelStreamOnChain } from "@/lib/solana/cancel";
import { unlockMilestoneOnChain } from "@/lib/solana/unlock-milestone";
import { parseTransactionError } from "@/lib/parse-tx-error";
import {
  buildCreateStreamCsvTemplate,
  getClusterLabel,
  getDefaultMint,
  getMintPresets,
} from "@/components/dashboard/token-mints";

function parseTokenAmountToBaseUnits(value: string, decimals: number) {
  const trimmed = String(value ?? "").trim().replace(/,/g, ".");

  if (trimmed === "" || !/^\d+(\.\d+)?$/.test(trimmed)) {
    return BigInt(0);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedFraction = fractionPart.slice(0, decimals).padEnd(decimals, "0");
  const raw = `${wholePart}${normalizedFraction}`.replace(/^0+(?=\d)/, "");

  try {
    return BigInt(raw || "0");
  } catch {
    return BigInt(0);
  }
}

function formatBaseUnitsToTokenAmount(amount: bigint, decimals: number) {
  if (decimals <= 0) return amount.toString();

  const negative = amount < BigInt(0);
  const unsigned = negative ? (amount * BigInt(-1)).toString() : amount.toString();
  const padded = unsigned.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function parseBaseUnits(value: unknown) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  } catch {
    // Fall back to zero for values we cannot interpret as base units.
  }

  return BigInt(0);
}

function buildEvenMilestoneAmounts(amount: string, count: number, decimals: number) {
  if (!Number.isFinite(count) || count <= 0) return [];

  const normalizedCount = Math.floor(count);
  if (normalizedCount <= 0) return [];

  const total = parseTokenAmountToBaseUnits(amount, decimals);
  const divisor = BigInt(normalizedCount);

  if (total < divisor) {
    return Array.from({ length: normalizedCount }, () => "0");
  }

  const base = total / divisor;
  const remainder = total % divisor;

  return Array.from({ length: normalizedCount }, (_, index) =>
    formatBaseUnitsToTokenAmount(base + (BigInt(index) < remainder ? BigInt(1) : BigInt(0)), decimals)
  );
}

function buildEvenMilestoneAmountsFromBaseUnits(totalBaseUnits: bigint, count: number, decimals: number) {
  if (!Number.isFinite(count) || count <= 0) return [];

  const normalizedCount = Math.floor(count);
  if (normalizedCount <= 0) return [];

  const divisor = BigInt(normalizedCount);

  if (totalBaseUnits < divisor) {
    return Array.from({ length: normalizedCount }, () => formatBaseUnitsToTokenAmount(BigInt(0), decimals));
  }

  const base = totalBaseUnits / divisor;
  const remainder = totalBaseUnits % divisor;

  return Array.from({ length: normalizedCount }, (_, index) =>
    formatBaseUnitsToTokenAmount(base + (BigInt(index) < remainder ? BigInt(1) : BigInt(0)), decimals)
  );
}

function buildMilestoneAmountsFromStream(stream: any) {
  const count = Number(stream?.milestoneCount || 0);
  if (!Number.isFinite(count) || count <= 0) {
    return [] as string[];
  }

  const decimals = typeof stream?.mintDecimals === "number" ? stream.mintDecimals : 0;
  const totalBaseUnits = parseBaseUnits(stream?.totalAmount);

  const rawMilestones = String(stream?.milestones || "").trim();
  if (rawMilestones !== "") {
    const parsed = rawMilestones
      .split(";")
      .map((value: string) => value.trim())
      .filter(Boolean);

    if (parsed.length > 0) {
      while (parsed.length < count) {
        parsed.push("0");
      }

      const trimmed = parsed.slice(0, count);
      const parsedSum = trimmed.reduce((sum, amount) => sum + parseTokenAmountToBaseUnits(amount, decimals), BigInt(0));

      if (parsedSum === totalBaseUnits) {
        return trimmed;
      }
    }
  }

  return buildEvenMilestoneAmountsFromBaseUnits(totalBaseUnits, count, decimals);
}

type Props = {
  initialStreams?: any[];
};

const DashboardActionPanels = dynamic(
  () => import("@/components/dashboard/dashboard-action-panels").then((mod) => mod.DashboardActionPanels),
  { ssr: false, loading: () => null }
);

type TxPhase = "wallet_approval" | "sending" | "confirming";

export default function Home({ initialStreams = [] }: Props) {
  const router = useRouter();
  const { wallet, connected } = useWalletConnection();
  const { endpoint } = useClusterState();
  const mintPresets = useMemo(() => getMintPresets(endpoint), [endpoint]);
  const clusterLabel = useMemo(() => getClusterLabel(endpoint), [endpoint]);
  const defaultMint = useMemo(() => getDefaultMint(endpoint), [endpoint]);
  const [activeTab, setActiveTab] = useState<TabId>("streams");
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const [streams, setStreams] = useState<any[]>(initialStreams);
  const [filteredStreamsCount, setFilteredStreamsCount] = useState(initialStreams.length);
  const [loading, setLoading] = useState(initialStreams.length === 0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Details Drawer State
  const [selectedStream, setSelectedStream] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Multisig States
  const [useMultisig, setUseMultisig] = useState(false);

  // CSV States
  const [createMode, setCreateMode] = useState<"manual" | "csv">("manual");
  const [csvCreateText, setCsvCreateText] = useState(() => buildCreateStreamCsvTemplate(endpoint));
  const [csvEditText, setCsvEditText] = useState(
    "id,amount,duration,cliff_duration,milestones\nStreamCSV-XXXXX,1800,10800,0,"
  );

  const fileInputCreateRef = useRef<HTMLInputElement>(null);
  const fileInputEditRef = useRef<HTMLInputElement>(null);

  // Form States
  const [createForm, setCreateForm] = useState({
    recipient: "",
    amount: "1000",
    mint: defaultMint,
    type: "0", // 0: Linear, 1: Cliff, 2: Milestone
    duration: "3600",
    endDate: "",
    cliffDuration: "600",
    cliffDate: "",
    milestoneCount: "4",
  });

  const [milestoneAmounts, setMilestoneAmounts] = useState<string[]>(["250", "250", "250", "250"]);

  const [withdrawForm, setWithdrawForm] = useState({ streamId: "" });
  const [cancelForm, setCancelForm] = useState({ streamId: "" });
  const [unlockForm, setUnlockForm] = useState({ streamId: "" });
  const [editMilestoneForm, setEditMilestoneForm] = useState({
    streamId: "",
    amounts: ["250", "250", "250", "250"],
    totalAmount: "",
    mintDecimals: null as number | null,
  });
  const [editLinearForm, setEditLinearForm] = useState({ streamId: "", newEndDuration: "", topupAmount: "" });
  const [editCliffForm, setEditCliffForm] = useState({ streamId: "", newCliffDuration: "" });

  // Notifications
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info" | null;
    message: string;
  }>({ type: null, message: "" });
  const connectedWalletAddress = connected && wallet?.account.address ? String(wallet.account.address) : null;

  const showNotification = useCallback((type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: null, message: "" }), 5000);
  }, []);
  const showParsedTxError = useCallback((err: unknown, fallback: string) => {
    const parsed = parseTransactionError(err);
    showNotification("error", `${parsed.title}: ${parsed.detail || fallback}`);
  }, [showNotification]);

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
  const [activeTxAction, setActiveTxAction] = useState<string | null>(null);
  const [activeTxPhase, setActiveTxPhase] = useState<TxPhase | null>(null);

  const fetchCsvVersions = useCallback(async () => {
    try {
      const params = connectedWalletAddress ? { uploader: connectedWalletAddress } : undefined;
      const res = await api.get("/csv/versions", { params });
      setCsvVersions(res.data);
    } catch (err) {
      console.error("Failed to fetch CSV versions:", err);
    }
  }, [connectedWalletAddress]);

  const handleDeleteCsvVersion = useCallback(async () => {
    if (!connectedWalletAddress) {
      showNotification("error", "Connect the creator wallet before deleting a CSV version.");
      return;
    }

    if (compareVersionSelected === "0") {
      showNotification("error", "Select a historical CSV version first.");
      return;
    }

    const versionToDelete = Number(compareVersionSelected);
    if (!Number.isFinite(versionToDelete) || versionToDelete <= 0) {
      showNotification("error", "Invalid CSV version selected.");
      return;
    }

    const confirmed = window.confirm(`Delete CSV version ${versionToDelete}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await api.delete("/csv/version", {
        data: {
          version: versionToDelete,
          uploader: connectedWalletAddress,
        },
      });

      showNotification("success", `CSV version ${versionToDelete} deleted.`);
      setCompareVersionSelected("0");
      setCsvDiffResult(null);
      fetchCsvVersions();
    } catch (err: any) {
      showNotification("error", err.response?.data?.error || err?.message || "Failed to delete CSV version.");
    }
  }, [compareVersionSelected, connectedWalletAddress, fetchCsvVersions, showNotification]);

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
        mode,
        uploader: connectedWalletAddress || undefined,
      };
      if (compareVersionSelected !== "0") {
        payload.compareVersion = Number(compareVersionSelected);
      }

      const res = await api.post("/csv/diff", payload);
      setCsvDiffResult({ ...res.data, mode });
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
    setCompareVersionSelected("0");
    fetchCsvVersions();
  }, [connectedWalletAddress, fetchCsvVersions]);

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
        if (tab === "edit_milestone") setEditMilestoneForm(prev => ({ ...prev, streamId, amounts: prev.amounts }));
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

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab !== "edit_milestone") return;
    if (!editMilestoneForm.streamId || editMilestoneForm.totalAmount) return;

    const stream = streams.find((item) => String(item?.id || "") === editMilestoneForm.streamId);
    if (!stream) return;

    setEditMilestoneForm((prev) => ({
      ...prev,
      amounts: buildMilestoneAmountsFromStream(stream),
      totalAmount: String(stream?.totalAmount ?? ""),
      mintDecimals: typeof stream?.mintDecimals === "number" ? stream.mintDecimals : null,
    }));
  }, [activeTab, editMilestoneForm.streamId, editMilestoneForm.totalAmount, streams]);

  const handleMilestoneCountChange = useCallback((val: string) => {
    setCreateForm((prev) => ({ ...prev, milestoneCount: val }));

    const count = parseInt(val, 10);
    if (Number.isNaN(count) || count <= 0) return;

    const decimals = mintPresets.find((preset) => preset.mint === createForm.mint)?.decimals ?? 0;
    setMilestoneAmounts(buildEvenMilestoneAmounts(createForm.amount, count, decimals));
  }, [createForm.amount, createForm.mint, mintPresets]);

  // Format Helpers
  const formatDate = (ts: string) => new Date(Number(ts) * 1000).toLocaleString();
  const shorten = (address: string) => address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "";

  // Helper to parse pasted CSV client-side
  const parseCsv = (csvText: string) => {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());

    return lines.slice(1).map((line) => {
      const values = line.split(",").map((value) => value.trim());
      const obj: any = {};

      headers.forEach((header, index) => {
        if (values[index] === undefined) return;

        const rawValue = values[index];
        const parsedValue = rawValue === "true" ? true : rawValue === "false" ? false : rawValue;

        if (header === "cliff_duration" || header === "cliffduration") {
          obj.cliffDuration = parsedValue;
          return;
        }

        if (header === "milestone_count" || header === "milestonecount") {
          obj.milestoneCount = parsedValue;
          return;
        }

        if (header === "milestones") {
          obj.milestones = values
            .slice(index)
            .map((value) => value.trim())
            .filter(Boolean)
            .join(";");
          return;
        }

        obj[header] = parsedValue;
      });

      return obj;
    });
  };

  const buildCsvCreateInput = (item: any, index: number) => {
    const milestones = String(item.milestones || "")
      .split(";")
      .map((value: string) => value.trim())
      .filter(Boolean);

    if (Number(item.type) === 2 && milestones.length === 0) {
      throw new Error(`CSV Row #${index + 1}: milestone streams require a semicolon-separated milestones column.`);
    }

    return {
      recipient: String(item.recipient || "").trim(),
      amount: String(item.amount ?? "").trim(),
      mint: String(item.mint || defaultMint).trim(),
      type: String(item.type ?? 0).trim(),
      duration: String(item.duration ?? 0).trim(),
      cliffDuration: String(item.cliffDuration ?? 0).trim(),
      milestoneCount: String(item.milestoneCount ?? milestones.length).trim(),
      milestoneAmounts: milestones,
      nonce: Date.now() + index,
    };
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
      ? buildCreateStreamCsvTemplate(endpoint)
      : [
          "id,type,amount,duration,cliff_duration,milestones",
          "LinearStreamId,0,250,10800,,",
          "CliffStreamId,1,,,3600,",
          "MilestoneStreamId,2,,,,400;300;300",
        ].join("\n");

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
    const setTxStatus = (phase: TxPhase) => {
      setActiveTxAction(actionName);
      setActiveTxPhase(phase);
    };
    const clearTxStatus = () => {
      setActiveTxAction(null);
      setActiveTxPhase(null);
    };

    if (useMultisig && !["create_stream", "withdraw", "create_stream_csv"].includes(actionName)) {
      showNotification("success", `Squads Multisig proposal created successfully! Redirecting you to Streams page...`);
      setTimeout(() => {
        router.push("/streams");
      }, 2000);
      return;
    }

    // Direct Manual Deploy
    if (actionName === "create_stream") {
      if (!wallet) {
        showNotification("error", "Connect a Solana wallet before creating a stream.");
        return;
      }

      try {
        const result = await createStreamOnChain({
          wallet,
          endpoint,
          input: {
            recipient: data.recipient,
            amount: data.amount,
            mint: data.mint,
            type: data.type,
            duration: data.duration,
            cliffDuration: data.cliffDuration,
            milestoneCount: data.milestoneCount,
            milestoneAmounts,
          },
          onStatus: setTxStatus,
        });

        showNotification("success", `Stream created on-chain. Signature: ${result.signature.slice(0, 8)}...`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showParsedTxError(err, "Deployment failed.");
      } finally {
        clearTxStatus();
      }
      return;
    }

    if (actionName === "withdraw") {
      if (!wallet) {
        showNotification("error", "Connect the recipient wallet before claiming tokens.");
        return;
      }

      try {
        const result = await withdrawFromStreamOnChain({
          wallet,
          endpoint,
          input: {
            streamAddress: data.streamId,
            amount: data.amount,
          },
          onStatus: setTxStatus,
        });

        showNotification("success", `Tokens withdrawn on-chain. Signature: ${result.signature.slice(0, 8)}...`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showParsedTxError(err, "Withdraw failed.");
      } finally {
        clearTxStatus();
      }
      return;
    }

    if (actionName === "cancel") {
      if (!wallet) {
        showNotification("error", "Connect the creator wallet before cancelling a stream.");
        return;
      }

      try {
        const result = await cancelStreamOnChain({
          wallet,
          endpoint,
          input: {
            streamAddress: data.streamId,
          },
          onStatus: setTxStatus,
        });

        setStreams((prev) =>
          prev.map((stream) =>
            stream.id === data.streamId
              ? { ...stream, status: 3, cancelled: true }
              : stream
          )
        );
        setSelectedStream((prev: any) =>
          prev && prev.id === data.streamId
            ? { ...prev, status: 3, cancelled: true }
            : prev
        );

        showNotification("success", `Stream cancelled on-chain. Signature: ${result.signature.slice(0, 8)}...`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showParsedTxError(err, "Cancel failed.");
      } finally {
        clearTxStatus();
      }
      return;
    }

    if (actionName === "unlock_milestone") {
      if (!wallet) {
        showNotification("error", "Connect the creator wallet before unlocking a milestone.");
        return;
      }

      try {
        const result = await unlockMilestoneOnChain({
          wallet,
          endpoint,
          input: {
            streamAddress: data.streamId,
          },
          onStatus: setTxStatus,
        });

        showNotification(
          "success",
          `Milestone #${result.unlockedMilestoneIndex} unlocked on-chain. Signature: ${result.signature.slice(0, 8)}...`
        );
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showParsedTxError(err, "Unlock milestone failed.");
      } finally {
        clearTxStatus();
      }
      return;
    }

    // CSV bulk deploy with versioning
    if (actionName === "create_stream_csv") {
      if (!wallet) {
        showNotification("error", "Connect a Solana wallet before bulk creating streams.");
        return;
      }

      try {
        const parsedItems = parseCsv(csvCreateText);
        if (parsedItems.length === 0) {
          showNotification("error", "CSV format invalid. Please provide correct headers.");
          return;
        }

        const normalizedItems = parsedItems.map((item, index) => {
          if (!item.recipient) {
            throw new Error(`CSV Row #${index + 1}: recipient is required.`);
          }

          if (item.amount === undefined || item.amount === null || String(item.amount).trim() === "") {
            throw new Error(`CSV Row #${index + 1}: amount is required.`);
          }

          if (item.type === undefined || item.type === null || String(item.type).trim() === "") {
            throw new Error(`CSV Row #${index + 1}: type is required.`);
          }

          if (item.duration === undefined || item.duration === null || String(item.duration).trim() === "") {
            throw new Error(`CSV Row #${index + 1}: duration is required.`);
          }

          return buildCsvCreateInput(item, index);
        });

        const batchResult = await createStreamBatchOnChain({
          wallet,
          endpoint,
          inputs: normalizedItems,
          maxStreamsPerBatch: 2,
          onStatus: setTxStatus,
        });

        if (batchResult.streamAddresses.length === 0) {
          throw new Error("No streams were created on-chain, so the CSV version was not saved.");
        }

        // 1. Persist file contents in Prisma version history only after the on-chain deploy succeeds.
        await api.post("/csv/upload", {
          content: csvCreateText,
          filename: `bulk_create_v${csvVersions.length + 1}.csv`,
          uploader: connectedWalletAddress || "Anonymous"
        });

        if (batchResult.streamAddresses.length > 0) {
          await api.post("/streams/mark-origin", {
            ids: batchResult.streamAddresses,
            isCsvCreated: true,
          });
        }

        showNotification("success", `Successfully versioned (v${csvVersions.length + 1}) and deployed ${batchResult.streamAddresses.length} CSV bulk streams on-chain in ${batchResult.batches.length} versioned transaction(s)!`);
        
        // Reset state
        setCsvDiffResult(null);
        fetchCsvVersions();
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err.response?.data?.error || err?.message || "Bulk deployment failed.");
      } finally {
        clearTxStatus();
      }
      return;
    }

    // CSV Bulk Edit with Versioning
    if (actionName === "edit_stream_csv") {
      try {
        if (!wallet) {
          showNotification("error", "Connect the creator wallet before bulk editing streams.");
          return;
        }

        const parsedItems = parseCsv(csvEditText);
        if (parsedItems.length === 0) {
          showNotification("error", "CSV format invalid. Please provide correct headers.");
          return;
        }

        const batchEditResult = await editStreamBatchOnChain({
          wallet,
          endpoint,
          inputs: parsedItems.map((item: any) => ({
            id: String(item.id || ""),
            amount: item.amount,
            duration: item.duration,
            cliffDuration: item.cliffDuration,
            milestones: item.milestones,
          })),
        });
        if (batchEditResult.signatures.length === 0) {
          throw new Error("No editable rows found. Provide duration, cliff_duration, or milestones columns for CSV-created streams.");
        }

        // 1. Persist edit contents in Prisma version history only after the update succeeds.
        await api.post("/csv/upload", {
          content: csvEditText,
          filename: `bulk_edit_v${csvVersions.length + 1}.csv`,
          uploader: connectedWalletAddress || "Anonymous"
        });
        showNotification("success", `Successfully versioned (v${csvVersions.length + 1}) and applied ${batchEditResult.streamAddresses.length} on-chain CSV bulk edits in ${batchEditResult.signatures.length} transaction(s)!`);
        
        // Reset state
        setCsvDiffResult(null);
        fetchCsvVersions();
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showParsedTxError(err, "Bulk edit failed.");
      }
      return;
    }

    if (actionName === "edit_linear") {
      try {
        if (!wallet) {
          showNotification("error", "Connect the creator wallet before editing a linear stream.");
          return;
        }

        await editLinearOnChain({
          wallet,
          endpoint,
          input: {
            streamAddress: data.streamId,
            newEndDuration: data.newEndDuration,
            topupAmount: data.topupAmount,
          },
        });
        showNotification("success", `Linear stream timeline extended and topped up successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err?.message || "Failed to update linear stream.");
      }
      return;
    }

    if (actionName === "edit_milestone") {
      try {
        if (!wallet) {
          showNotification("error", "Connect the creator wallet before editing a milestone.");
          return;
        }

        const amounts = Array.isArray(data.amounts) ? data.amounts : [];
        if (amounts.length === 0) {
          throw new Error("Milestone amounts are required.");
        }

        const stream = streams.find((item) => String(item?.id || "") === String(data.streamId || ""));
        if (stream) {
          const mintDecimals = typeof stream.mintDecimals === "number" ? stream.mintDecimals : 0;
          const currentTotalAmount = parseBaseUnits(stream.totalAmount);
          const editedTotalAmount = amounts.reduce(
            (sum: bigint, amount: any) => sum + parseTokenAmountToBaseUnits(String(amount ?? "0"), mintDecimals),
            BigInt(0)
          );

          if (editedTotalAmount !== currentTotalAmount) {
            throw new Error(
              `Milestone allocations must sum to ${formatBaseUnitsToTokenAmount(currentTotalAmount, mintDecimals)}.`
            );
          }
        }

        for (let index = 0; index < amounts.length; index += 1) {
          await editMilestoneOnChain({
            wallet,
            endpoint,
            input: {
              streamAddress: data.streamId,
              milestoneIndex: index,
              newAmount: amounts[index],
            },
          });
        }

        showNotification("success", `Milestone allocations updated successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err?.message || "Failed to update milestone allocation.");
      }
      return;
    }

    if (actionName === "edit_cliff") {
      try {
        if (!wallet) {
          showNotification("error", "Connect the creator wallet before editing a cliff stream.");
          return;
        }

        await editCliffOnChain({
          wallet,
          endpoint,
          input: {
            streamAddress: data.streamId,
            newCliffDuration: data.newCliffDuration,
          },
        });
        showNotification("success", `Cliff timestamp updated successfully!`);
        fetchStreams();
        setActiveTab("streams");
      } catch (err: any) {
        showNotification("error", err?.message || "Failed to update cliff timestamp.");
      }
      return;
    }

    // Simulation success
    showNotification("success", `Transaction submitted: Successfully executed ${actionName}!`);
  };

  // Pre-fill helpers to easily act on a stream
  const prefillAction = (tab: TabId, streamOrId: any) => {
    const streamId = typeof streamOrId === "string" ? streamOrId : String(streamOrId?.id || "");
    const stream = typeof streamOrId === "string"
      ? streams.find((item) => String(item?.id || "") === streamId)
      : streamOrId;
    setActiveTab(tab);
    if (tab === "withdraw") setWithdrawForm({ streamId });
    if (tab === "cancel") setCancelForm({ streamId });
    if (tab === "unlock_milestone") setUnlockForm({ streamId });
    if (tab === "edit_milestone") {
      setEditMilestoneForm(
        stream
          ? {
              streamId,
              amounts: buildMilestoneAmountsFromStream(stream),
              totalAmount: String(stream?.totalAmount ?? ""),
              mintDecimals: typeof stream?.mintDecimals === "number" ? stream.mintDecimals : null,
            }
          : { streamId, amounts: ["250", "250", "250", "250"], totalAmount: "", mintDecimals: null }
      );
    }
    if (tab === "edit_linear") {
      const duration = stream && stream.endTs && stream.startTs ? String(Number(stream.endTs) - Number(stream.startTs)) : "";
      setEditLinearForm({ streamId, newEndDuration: duration, topupAmount: "" });
    }
    if (tab === "edit_cliff") {
      const duration = stream && stream.cliffTs && stream.startTs ? String(Number(stream.cliffTs) - Number(stream.startTs)) : "";
      setEditCliffForm({ streamId, newCliffDuration: duration });
    }
    
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
        
        <DashboardSidebar activeTab={activeTab} setActiveTab={setActiveTab} streamsCount={filteredStreamsCount} />

        {/* WORKSPACE AREA */}
        <section className="flex-grow min-w-0 max-w-full bg-zinc-900/25 border border-zinc-800/80 rounded-3xl p-4 sm:p-6 md:backdrop-blur-sm md:shadow-2xl shadow-none flex flex-col justify-between relative overflow-x-hidden">
          
          <div className="w-full">

            {activeTab === "streams" && (
              <DashboardStreamsPanel
                streams={streams}
                loading={loading}
                nowTs={nowTs}
              fetchStreams={fetchStreams}
              fetchStreamDetails={fetchStreamDetails}
              connectedWalletAddress={connectedWalletAddress}
              onFilteredCountChange={setFilteredStreamsCount}
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
                onMilestoneCountChange={handleMilestoneCountChange}
                clusterLabel={clusterLabel}
                mintPresets={mintPresets}
                milestoneAmounts={milestoneAmounts}
                setMilestoneAmounts={setMilestoneAmounts}
                csvCreateText={csvCreateText}
                setCsvCreateText={setCsvCreateText}
                csvEditText={csvEditText}
                setCsvEditText={setCsvEditText}
                compareVersionSelected={compareVersionSelected}
                setCompareVersionSelected={setCompareVersionSelected}
                csvVersions={csvVersions}
                handleDeleteCsvVersion={handleDeleteCsvVersion}
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
                activeTxAction={activeTxAction}
                activeTxPhase={activeTxPhase}
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
              connectedWalletAddress={connectedWalletAddress}
              currentTimeTs={nowTs}
            />

          </div>

        </section>

      </div>

      {/* Chatbot Assistant */}
      <ChatbotWidget />

    </main>
  );
}
