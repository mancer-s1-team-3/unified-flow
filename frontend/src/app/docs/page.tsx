"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Terminal,
  Cpu,
  Globe,
  Copy,
  Check,
  ArrowLeft,
  Info,
  Clock,
  Layers,
  Sparkles,
  Lock,
  Coins,
  Settings,
  XCircle,
  Edit3
} from "lucide-react";

// ============================================================================
// DOCUMENTATION DATA DEFINITIONS
// ============================================================================
const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/streams",
    desc: "Fetch all indexed token vesting and distribution streams, ordered by creation date descending.",
    response: `[
  {
    "id": "cm0a1b2c3d4e5f6g7h8i9j0k",
    "creator": "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
    "recipient": "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "vault": "ATA5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
    "totalAmount": "100000000",
    "withdrawn": "25000000",
    "startTs": "1789045600",
    "cliffTs": "1789045600",
    "endTs": "1791637600",
    "vestingType": 0,
    "status": 1,
    "createdAt": "2026-05-17T05:10:00.000Z"
  }
]`
  },
  {
    method: "GET",
    path: "/streams/:id",
    desc: "Retrieve exhaustive details of a single indexed stream using its indexed record identifier.",
    response: `{
  "id": "cm0a1b2c3d4e5f6g7h8i9j0k",
  "creator": "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
  "recipient": "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "vault": "ATA5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
  "totalAmount": "100000000",
  "withdrawn": "25000000",
  "startTs": "1789045600",
  "cliffTs": "1789045600",
  "endTs": "1791637601",
  "vestingType": 0,
  "status": 1,
  "createdAt": "2026-05-17T05:10:00.000Z"
}`
  }
];

const MCP_TOOLS = [
  {
    name: "get_streams",
    category: "Indexed API",
    desc: "Query the backend API for indexed streams. Supports filtering by creator, recipient, status, vesting type, and limit.",
    params: [
      { name: "creator", type: "string (optional)", desc: "Filter by creator public key" },
      { name: "recipient", type: "string (optional)", desc: "Filter by recipient public key" },
      { name: "status", type: "number (optional)", desc: "1 = Active, 2 = Completed, 3 = Cancelled" },
      { name: "vestingType", type: "number (optional)", desc: "0 = Linear, 1 = Cliff, 2 = Milestone" },
      { name: "limit", type: "number (optional)", desc: "Maximum number of streams to return" }
    ]
  },
  {
    name: "get_stream_details",
    category: "On-Chain",
    desc: "Retrieve real-time on-chain state directly from Solana, resolving all child sequential milestone accounts.",
    params: [
      { name: "streamAddress", type: "string (required)", desc: "The public key of the StreamAccount PDA" }
    ]
  },
  {
    name: "create_stream",
    category: "Transaction",
    desc: "Build, sign and dispatch a new stream on Solana. Handles ATA creation, milestone PDAs derivation & fee setups.",
    params: [
      { name: "recipient", type: "string (required)", desc: "Recipient address" },
      { name: "mint", type: "string (required)", desc: "SPL Token Mint" },
      { name: "amount", type: "string (required)", desc: "Raw amount in base units" },
      { name: "vestingType", type: "number (required)", desc: "0 = Linear, 1 = Cliff, 2 = Milestone" },
      { name: "milestones", type: "array (optional)", desc: "Amounts for Milestone vesting" }
    ]
  },
  {
    name: "withdraw_from_stream",
    category: "Transaction",
    desc: "Withdraw claimable tokens. Dynamically calculates SOL fee via Chainlink price feeds.",
    params: [
      { name: "streamAddress", type: "string (required)", desc: "Stream PDA address" }
    ]
  }
];

// CLI_COMMANDS split into categories
const CLI_READ_COMMANDS = [
  {
    cmd: "unifiedflow view <streamAddress>",
    desc: "Fetch & print real-time on-chain stream & milestone details with ANSI colored tree display.",
    example: "unifiedflow view 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow config",
    desc: "Print global protocol config — fees, admin authority, paused state, and allowed mints."
  },
  {
    cmd: "unifiedflow version",
    desc: "Print CLI version, connected program ID, and active RPC endpoint.",
    example: "unifiedflow version"
  }
];

const CLI_WRITE_COMMANDS = [
  {
    cmd: "unifiedflow init",
    desc: "Initialize the global protocol config PDA state. Run once by the admin before any streams can be created."
  },
  {
    cmd: "unifiedflow create <recipient> <mint> <amount> 0 <durationSecs>",
    desc: "Create a Linear vesting stream (type 0). Tokens unlock continuously second-by-second over the given duration.",
    example: "unifiedflow create <recipient> <mint> 1000000000 0 31536000"
  },
  {
    cmd: "unifiedflow create <recipient> <mint> <amount> 1 <durationSecs>",
    desc: "Create a Cliff vesting stream (type 1). Tokens are fully locked until the cliff timestamp, then released at once.",
    example: "unifiedflow create <recipient> <mint> 1000000000 1 15552000"
  },
  {
    cmd: "unifiedflow create <recipient> <mint> <amount> 2 <milestone1,milestone2,...>",
    desc: "Create a Milestone vesting stream (type 2). Pass comma-separated amounts — they must sum exactly to the total amount.",
    example: "unifiedflow create <recipient> <mint> 1000000000 2 250000000,250000000,250000000,250000000"
  },
  {
    cmd: "unifiedflow create-batch <csvPath>",
    desc: "Create multiple streams in one command from a CSV file. Supports all three vesting types. CSV columns: recipient, mint, amount, type, duration, cliffDuration, milestones (semicolon-separated for type 2).",
    example: "unifiedflow create-batch ./streams.csv"
  },
  {
    cmd: "unifiedflow withdraw <streamAddress>",
    desc: "Withdraw claimable vested tokens as the stream recipient. SOL fee is calculated dynamically via Chainlink oracle.",
    example: "unifiedflow withdraw 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow cancel <streamAddress>",
    desc: "Cancel an active stream as the creator. Unvested tokens are returned to the creator's wallet.",
    example: "unifiedflow cancel 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow unlock <streamAddress>",
    desc: "Unlock the next sequential milestone in a Milestone stream. Must be called in order — index i before i+1.",
    example: "unifiedflow unlock 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  {
    cmd: "unifiedflow edit-milestone <streamAddress> <milestoneIndex> <newAmount>",
    desc: "Modify a locked milestone allocation. The contract auto-adjusts vault token balance to match the updated total.",
    example: "unifiedflow edit-milestone 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 2 300000000"
  },
  {
    cmd: "unifiedflow edit-linear <streamAddress> <newDurationSecs> [topupAmount]",
    desc: "Extend a linear stream's end time and/or top up its total allocation. newDurationSecs is measured from the original startTs. topupAmount is optional — omit if only extending duration.",
    example: "unifiedflow edit-linear 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 63072000 500000000"
  },
  {
    cmd: "unifiedflow edit-cliff <streamAddress> <newCliffDurationSecs>",
    desc: "Edit the cliff of an existing stream. Accepts duration in seconds from the stream's original startTs — the contract derives the absolute cliff timestamp internally.",
    example: "unifiedflow edit-cliff 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 7776000"
  },
  {
    cmd: "unifiedflow edit-batch <csvPath>",
    desc: "Bulk edit multiple streams from a CSV file. Routes each row to the correct edit instruction based on vesting type. CSV columns: id (stream address), duration, amount (linear), cliffDuration (cliff), milestones (milestone, semicolon-separated).",
    example: "unifiedflow edit-batch ./edits.csv"
  },
];

const SDK_METHODS = [
  {
    name: "createStream",
    desc: "Create a new vesting stream.",
    example: `await client.createStream(
  recipient,
  mint,
  amount,
  startTs,
  cliffTs,
  endTs,
  0,
  [],
  nonce
);`,
  },
  {
    name: "withdraw",
    desc: "Withdraw vested tokens.",
    example: `await client.withdraw(streamPDA);`,
  },
  {
    name: "cancel",
    desc: "Cancel active stream.",
    example: `await client.cancel(streamPDA);`,
  },
  {
    name: "unlockMilestone",
    desc: "Unlock milestone.",
    example: `await client.unlockMilestone(streamPDA, 0);`,
  },
  {
    name: "editMilestone",
    desc: "Update milestone allocation.",
    example: `await client.editMilestone(
  streamPDA,
  mint,
  milestoneIndex,
  newAmount
);`,
  },
  {
    name: "editCliff",
    desc: "Update cliff timestamp.",
    example: `await client.editCliff(
  streamPDA,
  newCliffTs
);`,
  },
  {
    name: "editLinear",
    desc: "Extend stream and/or topup.",
    example: `await client.editLinear(
  streamPDA,
  mint,
  newEndTs,
  topupAmount
);`,
  },
];

// ============================================================================
// INTERACTIVE CODE SNIPPET WRAPPER
// ============================================================================
const CodeSnippet = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative mt-2 rounded-xl bg-zinc-900 border border-zinc-800 p-4 font-mono text-xs text-zinc-300 overflow-x-auto shadow-inner group">
      <button
        onClick={handleCopy}
        className="absolute right-3 top-3 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors opacity-0 group-hover:opacity-100 duration-200"
        title="Copy code"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      </button>
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
    </div>
  );
};

// ============================================================================
// CLI COMMAND CARD
// ============================================================================
const CliCard = ({ cmd, desc, example }: { cmd: string; desc: string; example?: string }) => (
  <div className="p-5 rounded-2xl bg-zinc-900/20 border border-zinc-800">
    <p className="text-xs font-medium text-zinc-300 leading-relaxed">{desc}</p>
    <CodeSnippet code={cmd} />
    {example && (
      <div className="mt-3">
        <span className="text-3xs uppercase tracking-wider font-semibold text-zinc-600">Example</span>
        <CodeSnippet code={example} />
      </div>
    )}
  </div>
);

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function DocsPage() {
  const router = useRouter();
const [activeTab, setActiveTab] = useState<
  "overview" | "sdk" | "api" | "mcp" | "cli"
>("overview");
  useEffect(() => {
    const resetView = () => {
      setActiveTab("overview");
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    resetView();

    const handlePageShow = () => resetView();
    window.addEventListener("pageshow", handlePageShow);

    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">

      {/* 🚀 GLOWING HEADER BACKGROUND */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-indigo-950/20 via-transparent to-transparent pointer-events-none blur-[120px]" />

      {/* 🌌 MAIN WRAPPER */}
      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">

        {/* BACK TO APP */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-indigo-400 font-medium text-sm transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to App Dashboard
          </button>
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          <Link
            href="/guide"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-cyan-300 hover:border-zinc-700 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            User Guide
          </Link>
          <Link
            href="/skills"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-indigo-300 hover:border-zinc-700 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            AI Skills
          </Link>
        </div>

        {/* HERO TITLE */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 shadow-sm animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            Developer Center V1.0
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Unified Protocol Documentation
          </h1>
          <p className="mt-3 text-lg text-zinc-400 max-w-2xl font-light leading-relaxed">
            Integrate, automate, and orchestrate Solana Token Vesting Streams using our APIs, Model Context Protocol, and CLI tools.
          </p>
        </header>

        {/* 📑 TABS NAVIGATION */}
        <nav className="flex flex-wrap gap-2.5 border-b border-zinc-800 pb-5 mb-10">
          {[
            { id: "overview", label: "Vesting Models", icon: <BookOpen className="w-4 h-4" /> },
            {
  id: "sdk",
  label: "TypeScript SDK",
  icon: <Coins className="w-4 h-4" />,
},
            { id: "api", label: "REST API", icon: <Globe className="w-4 h-4" /> },
            { id: "mcp", label: "Model Context Protocol", icon: <Cpu className="w-4 h-4" /> },
            { id: "cli", label: "CLI & Agent Skills", icon: <Terminal className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-900/10"
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* 📦 CONTENT CONTAINER */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* MAIN COLUMN */}
          <main className="lg:col-span-3 min-h-[500px]">

            {/* ================================================================
                TAB 1: PROTOCOL OVERVIEW
                ================================================================ */}
            {activeTab === "overview" && (
              <section className="space-y-8 animate-fadeIn">
                <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md">
                  <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-100">
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                    Vesting & Streaming Types
                  </h2>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Our smart contract handles three distinct vesting models, ensuring maximum adaptability for employee grants, developer vesting schedules, and milestone-based project distributions.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* CARD 1 — Linear */}
                  <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
                        <Clock className="w-5 h-5 text-cyan-400" />
                      </div>
                      <h3 className="text-base font-semibold text-zinc-100">Linear Vesting</h3>
                      <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                        Tokens unlock continuously on a second-by-second basis starting from <code className="text-cyan-300">startTs</code> up to <code className="text-cyan-300">endTs</code>. Highly recommended for standard team vesting.
                      </p>
                    </div>
                    <div className="mt-4 space-y-1">
                      <span className="inline-flex text-2xs uppercase tracking-wider font-semibold text-cyan-400 bg-cyan-500/5 px-2 py-0.5 rounded">Type 0</span>
                      <p className="text-3xs text-zinc-600 font-mono">args: &lt;durationSecs&gt;</p>
                    </div>
                  </div>

                  {/* CARD 2 — Cliff */}
                  <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                        <Lock className="w-5 h-5 text-violet-400" />
                      </div>
                      <h3 className="text-base font-semibold text-zinc-100">Cliff Vesting</h3>
                      <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                        Tokens remain fully locked in the program vault until <code className="text-violet-300">cliffTs</code> is met. On the cliff date, 100% of the funds are unlocked at once.
                      </p>
                    </div>
                    <div className="mt-4 space-y-1">
                      <span className="inline-flex text-2xs uppercase tracking-wider font-semibold text-violet-400 bg-violet-500/5 px-2 py-0.5 rounded">Type 1</span>
                      <p className="text-3xs text-zinc-600 font-mono">args: &lt;durationSecs&gt;</p>
                    </div>
                  </div>

                  {/* CARD 3 — Milestone */}
                  <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                        <Layers className="w-5 h-5 text-amber-400" />
                      </div>
                      <h3 className="text-base font-semibold text-zinc-100">Milestone Vesting</h3>
                      <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                        Tokens are allocated into distinct milestone buckets. Stream creators approve/unlock each sequential milestone on-chain to release funds to the recipient.
                      </p>
                    </div>
                    <div className="mt-4 space-y-1">
                      <span className="inline-flex text-2xs uppercase tracking-wider font-semibold text-amber-400 bg-amber-500/5 px-2 py-0.5 rounded">Type 2</span>
                      <p className="text-3xs text-zinc-600 font-mono">args: &lt;m1,m2,m3,...&gt;</p>
                    </div>
                  </div>

                </div>

                <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex gap-4">
                  <Info className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-300">Dynamic Rebalancing Capability</h4>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                      For Milestone Vesting streams, our protocol allows creators to resize allocations of un-unlocked milestones via <code className="text-indigo-300">edit-milestone</code>. The smart contract automatically transfers tokens to or from the stream vault as needed to match the new totals. Cliff timestamps can also be adjusted post-creation using <code className="text-indigo-300">edit-cliff</code>.
                    </p>
                  </div>
                </div>
              </section>
            )}
{activeTab === "sdk" && (
  <section className="space-y-8 animate-fadeIn">

    <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Coins className="w-5 h-5 text-indigo-400" />
        TypeScript SDK
      </h2>

      <p className="mt-3 text-sm text-zinc-400">
        Official SDK for creating, managing, editing,
        and withdrawing vesting streams on Solana.
      </p>
    </div>

    <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
      <h3 className="font-semibold mb-3">
        Installation
      </h3>

      <CodeSnippet
        code={`npm install @unifiedflow/unified-flow-sdk`}
      />
    </div>

    <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
      <h3 className="font-semibold mb-3">
        Initialize Client
      </h3>

      <CodeSnippet
        code={`const client = new UnifiedFlowClient(
  program,
  wallet,
  connection,
  "confirmed"
);`}
      />
    </div>

    <div className="space-y-4">
      <h3 className="font-semibold">
        Available Methods
      </h3>

      {SDK_METHODS.map((method) => (
        <div
          key={method.name}
          className="p-5 rounded-2xl bg-zinc-900/20 border border-zinc-800"
        >
          <h4 className="font-mono text-indigo-400">
            {method.name}()
          </h4>

          <p className="mt-2 text-xs text-zinc-400">
            {method.desc}
          </p>

          <CodeSnippet code={method.example} />
        </div>
      ))}
    </div>

    <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
      <h3 className="font-semibold mb-3">
        Transaction Progress
      </h3>

      <CodeSnippet
        code={`await client.withdraw(
  streamPDA,
  (status) => {
    console.log(status);
  }
);`}
      />

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
          <span className="font-mono text-cyan-400 text-xs">
            wallet_approval
          </span>
        </div>

        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
          <span className="font-mono text-amber-400 text-xs">
            sending
          </span>
        </div>

        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
          <span className="font-mono text-emerald-400 text-xs">
            confirming
          </span>
        </div>
      </div>
    </div>

  </section>
)}
            {/* ================================================================
                TAB 2: REST API
                ================================================================ */}
            {activeTab === "api" && (
              <section className="space-y-8 animate-fadeIn">
                <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
                  <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-100">
                    <Globe className="w-5 h-5 text-indigo-400" />
                    REST API Integration
                  </h2>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    The backend indexer continuously monitors on-chain events and records all streams in real-time. Integrate your dApp or internal workflows using our lightweight REST JSON endpoints.
                  </p>
                </div>

                <div className="space-y-6">
                  {API_ENDPOINTS.map((api, idx) => (
                    <div key={idx} className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs px-2.5 py-1 rounded-lg font-bold">
                          {api.method}
                        </span>
                        <code className="text-zinc-100 font-mono text-sm font-semibold">{api.path}</code>
                      </div>
                      <p className="mt-3 text-zinc-400 text-xs">{api.desc}</p>

                      <div className="mt-4">
                        <h4 className="text-2xs uppercase tracking-wider font-semibold text-zinc-500 mb-2">Example Response Payload</h4>
                        <CodeSnippet code={api.response} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ================================================================
                TAB 3: MODEL CONTEXT PROTOCOL
                ================================================================ */}
            {activeTab === "mcp" && (
              <section className="space-y-8 animate-fadeIn">
                <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
                  <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-100">
                    <Cpu className="w-5 h-5 text-indigo-400" />
                    Model Context Protocol (MCP) Server
                  </h2>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Give your LLM agent full access to perform read/write operations on the Solana program. Using the Model Context Protocol, the AI is granted tool interfaces for every contract operation.
                  </p>
                </div>

                {/* HOW TO CONFIGURE */}
                <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Integrating with Claude Desktop or Cursor
                  </h3>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                    Add the following JSON configurations into your local MCP settings file to hook up the AI assistant instantly:
                  </p>
                  <CodeSnippet code={`{
  "mcpServers": {
    "solana-distribution-mcp": {
      "command": "npm",
      "args": [
        "--prefix",
        "<ABSOLUTE_PATH_TO_BACKEND>",
        "run",
        "mcp"
      ],
      "env": {
        "RPC_HTTP": "<YOUR_RPC_HTTP>",
        "RPC_WS": "<YOUR_RPC_WS>",
        "PROGRAM_ID": "<YOUR_PROGRAM_ID>",
        "API_BASE_URL": "<YOUR_API_BASE_URL>",
        "WALLET_PATH": "<YOUR_WALLET_PATH>"
      }
    }
  }
}`} />
                  <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                    Replace the placeholders with your local values. The MCP server reads indexed data from the backend API, so it does not need direct database access.
                  </p>
                </div>

                {/* EXPOSED MCP TOOLS */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-zinc-100">Exposed MCP Tool Capabilities</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {MCP_TOOLS.map((tool, idx) => (
                      <div key={idx} className="p-5 rounded-2xl bg-zinc-900/25 border border-zinc-800 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <code className="text-zinc-100 font-mono text-xs font-bold text-indigo-400">{tool.name}</code>
                            <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                              {tool.category}
                            </span>
                          </div>
                          <p className="text-2xs text-zinc-400 leading-relaxed">{tool.desc}</p>
                        </div>
                        <div className="mt-4 border-t border-zinc-800/80 pt-3">
                          <h5 className="text-3xs uppercase tracking-wider font-semibold text-zinc-500 mb-1.5">Parameters</h5>
                          <div className="space-y-1">
                            {tool.params.map((p, pIdx) => (
                              <div key={pIdx} className="text-3xs text-zinc-400 flex justify-between">
                                <span className="font-mono text-zinc-300">{p.name}</span>
                                <span className="text-zinc-500 font-mono italic">{p.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ================================================================
                TAB 4: CLI & AGENT SKILLS
                ================================================================ */}
            {activeTab === "cli" && (
              <section className="space-y-8 animate-fadeIn">
                <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
                  <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-100">
                    <Terminal className="w-5 h-5 text-indigo-400" />
                    CLI & AI Agent Skills
                  </h2>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Trigger operations directly in your terminal using the <code className="text-indigo-300">@unifiedflow/cli</code> package. Install globally via npm and configure your wallet and RPC via environment variables.
                  </p>
                  <div className="mt-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="text-3xs uppercase tracking-wider font-semibold text-zinc-500 block mb-2">Installation</span>
                    <code className="font-mono text-xs text-emerald-400">npm install -g @unifiedflow/cli</code>
                  </div>
                  <div className="mt-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="text-3xs uppercase tracking-wider font-semibold text-zinc-500 block mb-2">Environment Variables (.env)</span>
                    <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap">{`WALLET_PATH=~/.config/solana/id.json   # Path to keypair file
PROGRAM_ID=8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa
RPC_URL=https://api.devnet.solana.com`}</pre>
                  </div>
                </div>

                {/* READ COMMANDS */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    Read Commands
                  </h3>
                  <div className="space-y-3">
                    {CLI_READ_COMMANDS.map((cmd, idx) => (
                      <CliCard key={idx} {...cmd} />
                    ))}
                  </div>
                </div>

                {/* WRITE COMMANDS */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-400" />
                    Write / Transaction Commands
                  </h3>
                  <div className="space-y-3">
                    {CLI_WRITE_COMMANDS.map((cmd, idx) => (
                      <CliCard key={idx} {...cmd} />
                    ))}
                  </div>
                </div>

                {/* SAFETY AND AGENT RULES */}
                <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800 space-y-3">
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-400" />
                    Crucial Protocol Verification Rules
                  </h3>
                  <ul className="text-xs text-zinc-400 space-y-2 list-disc list-inside leading-relaxed">
                    <li>
                      <span className="font-semibold text-zinc-300">Milestones Balance Validation:</span> Sum of milestone allocations must exactly equal the stream total amount.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Sequential Milestones Approvals:</span> Milestone index <code className="text-amber-300 font-mono">i</code> must be unlocked before index <code className="text-amber-300 font-mono">i+1</code> can be processed.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Oracle Staleness Limit:</span> Devnet oracle feed read will block claims if data updates are older than 1 hour.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Cancel Authorization:</span> Only the stream creator can cancel. Unvested tokens are returned — withdrawn amounts are non-refundable.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Init Once:</span> The <code className="text-amber-300 font-mono">init</code> command initializes the global config PDA and should only be run once by the protocol admin.
                    </li>
                  </ul>
                </div>
              </section>
            )}

          </main>

          {/* SIDEBAR */}
          <aside className="space-y-6">

            {/* PROTOCOL INFO CARD */}
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-colors" />
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 mb-4">
                <Settings className="w-4 h-4 text-indigo-400" />
                Protocol Info
              </h3>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Network</span>
                  <span className="font-mono text-zinc-300 font-semibold">Devnet</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Chainlink Feed</span>
                  <span className="font-mono text-zinc-300 text-indigo-400 truncate max-w-[120px]" title="99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR">
                    99B2bT...rR
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Program ID</span>
                  <span className="font-mono text-zinc-300 text-indigo-400 truncate max-w-[120px]" title="8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa">
                    8M5yie...Fa
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">CLI Package</span>
                  <span className="font-mono text-zinc-300 text-emerald-400">@unifiedflow/cli</span>
                </div>
              </div>
            </div>

            {/* VESTING TYPES QUICK REF */}
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 mb-4">
                <Layers className="w-4 h-4 text-amber-400" />
                Vesting Type IDs
              </h3>
              <div className="space-y-2">
                {[
                  { id: "0", label: "Linear", color: "text-cyan-400" },
                  { id: "1", label: "Cliff", color: "text-violet-400" },
                  { id: "2", label: "Milestone", color: "text-amber-400" },
                ].map(t => (
                  <div key={t.id} className="flex justify-between items-center text-xs">
                    <span className={`font-mono font-bold ${t.color}`}>Type {t.id}</span>
                    <span className="text-zinc-400">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AUTONOMOUS AGENTS CARD */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-zinc-900 border border-indigo-500/20 text-zinc-100">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Autonomous Agents
              </h3>
              <p className="mt-2 text-2xs text-zinc-400 leading-relaxed">
                Our code has native support for Model Context Protocol. AI Agents can instantly connect and execute complex operations for you securely.
              </p>
              <div className="mt-4">
                <span className="text-3xs uppercase tracking-wider font-semibold text-indigo-300 block mb-1">Skills Route</span>
                <Link
                  href="/skills"
                  className="inline-flex items-center gap-2 font-mono text-3xs text-zinc-200 bg-black/40 px-2 py-1.5 rounded border border-zinc-800 hover:border-indigo-500/40 hover:text-white transition-colors"
                >
                  <BookOpen className="w-3 h-3 text-indigo-400" />
                  /skills
                </Link>
              </div>
            </div>

          </aside>

        </div>

      </div>
    </div>
  );
}

