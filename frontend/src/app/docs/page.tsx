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
  Coins
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
    desc: "Retrieve exhaustive details of a single indexed stream using its database record identifier.",
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
    category: "DB Query",
    desc: "Query the backend PostgreSQL database for streams. Supports paging & filtering by creator, recipient, status, type.",
    params: [
      { name: "creator", type: "string (optional)", desc: "Filter by creator public key" },
      { name: "recipient", type: "string (optional)", desc: "Filter by recipient public key" },
      { name: "status", type: "number (optional)", desc: "1 = Active, 2 = Completed, 3 = Cancelled" },
      { name: "vestingType", type: "number (optional)", desc: "0 = Linear, 1 = Cliff, 2 = Milestone" }
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

const CLI_COMMANDS = [
  {
    cmd: "npm run cli config",
    desc: "Print global smart contract configurations, allowed mint addresses, and admin authorities."
  },
  {
    cmd: "npm run cli view <streamAddress>",
    desc: "Check live on-chain status of a stream with a beautiful ANSI colored tree display of milestone states."
  },
  {
    cmd: "npm run cli create <recipient> <mint> <amount> 0 <durationSecs>",
    desc: "Create an active Linear stream releasing tokens second-by-second."
  },
  {
    cmd: "npm run cli create <recipient> <mint> <amount> 2 <milestoneAmounts...>",
    desc: "Create a milestone vesting stream (e.g. amounts: '300,300,400' for a total of 1000)."
  },
  {
    cmd: "npm run cli withdraw <streamAddress>",
    desc: "Submit a claim transaction as the stream recipient using live Chainlink feeds."
  },
  {
    cmd: "npm run cli unlock <streamAddress>",
    desc: "Creator unlocks the next sequential milestone, converting locked funds to claimable tokens."
  }
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
      <pre>{code}</pre>
    </div>
  );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function DocsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "api" | "mcp" | "cli">("overview");

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
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all ${
              activeTab === "overview"
                ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-900/10"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950"
            }`}
          >
            <BookOpen className="w-4.5 h-4.5" />
            Vesting Models
          </button>
          
          <button
            onClick={() => setActiveTab("api")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all ${
              activeTab === "api"
                ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-900/10"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950"
            }`}
          >
            <Globe className="w-4.5 h-4.5" />
            REST API
          </button>

          <button
            onClick={() => setActiveTab("mcp")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all ${
              activeTab === "mcp"
                ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-900/10"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950"
            }`}
          >
            <Cpu className="w-4.5 h-4.5" />
            Model Context Protocol
          </button>

          <button
            onClick={() => setActiveTab("cli")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all ${
              activeTab === "cli"
                ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-900/10"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950"
            }`}
          >
            <Terminal className="w-4.5 h-4.5" />
            CLI & Agent Skills
          </button>
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
                    <BookOpen className="w-5.5 h-5.5 text-indigo-400" />
                    Vesting & Streaming Types
                  </h2>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Our smart contract handles three distinct vesting models, ensuring maximum adaptability for employee grants, developer vesting schedules, and milestone-based project distributions.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* CARD 1 */}
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
                    <span className="mt-4 inline-flex text-2xs uppercase tracking-wider font-semibold text-cyan-400 bg-cyan-500/5 px-2 py-0.5 rounded">Type 0</span>
                  </div>

                  {/* CARD 2 */}
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
                    <span className="mt-4 inline-flex text-2xs uppercase tracking-wider font-semibold text-violet-400 bg-violet-500/5 px-2 py-0.5 rounded">Type 1</span>
                  </div>

                  {/* CARD 3 */}
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
                    <span className="mt-4 inline-flex text-2xs uppercase tracking-wider font-semibold text-amber-400 bg-amber-500/5 px-2 py-0.5 rounded">Type 2</span>
                  </div>

                </div>

                <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex gap-4">
                  <Info className="w-6 h-6 text-indigo-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-300">Dynamic Rebalancing Capabilty</h4>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                      For Milestone Vesting streams, our protocol allows creators to resize allocations of un-unlocked milestones. The smart contract automatically transfers tokens to or from the stream vault as needed to match the new totals!
                    </p>
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
                    <Globe className="w-5.5 h-5.5 text-indigo-400" />
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
                    <Cpu className="w-5.5 h-5.5 text-indigo-400" />
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
        "DATABASE_URL": "<YOUR_DATABASE_URL>",
        "WALLET_PATH": "<YOUR_WALLET_PATH>"
      }
    }
  }
}`} />
                  <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                    Replace the placeholders with your local values. Keep secrets in your local environment or `.env` file, not in docs.
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
                    <Terminal className="w-5.5 h-5.5 text-indigo-400" />
                    CLI & AI Agent Skills
                  </h2>
                  <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
                    Trigger operations directly in your terminal using the built-in Node CLI wrapper, or verify the agent skill constraints required for AI automated vesting management.
                  </p>
                </div>

                {/* CLI CHEAT SHEET */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-zinc-100">CLI Command Reference Cheat Sheet</h3>
                  <div className="space-y-3">
                    {CLI_COMMANDS.map((cmd, idx) => (
                      <div key={idx} className="p-5 rounded-2xl bg-zinc-900/20 border border-zinc-800">
                        <p className="text-xs font-medium text-zinc-300">{cmd.desc}</p>
                        <CodeSnippet code={cmd.cmd} />
                      </div>
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
                      <span className="font-semibold text-zinc-300">Milestones Balance Validation:</span> Sum of milestone allocations **must exactly sum** to the stream total amount.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Sequential Milestones Approvals:</span> Milestone index <code className="text-amber-300 font-mono">i</code> must be unlocked before index <code className="text-amber-300 font-mono">i+1</code> can be processed.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Oracle Staleness Limit:</span> Devnet oracle feed read will block claims if data updates are older than 1 hour.
                    </li>
                  </ul>
                </div>
              </section>
            )}

          </main>

          {/* SIDEBAR AD CARD */}
          <aside className="space-y-6">
            
            {/* PROTOCOL STATS CARD */}
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-colors" />
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 mb-4">
                <Coins className="w-4 h-4 text-indigo-400" />
                Vesting Decimals
              </h3>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Solana Network</span>
                  <span className="font-mono text-zinc-300 font-semibold">Devnet</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Chainlink SOL/USD Feed</span>
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
              </div>
            </div>

            {/* LAUNCH DOCUMENT CARD */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-zinc-900 border border-indigo-500/20 text-zinc-100">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
                Autonomous Agents
              </h3>
              <p className="mt-2 text-2xs text-zinc-400 leading-relaxed">
                Our code has native supports for Model Context Protocol. AI Agents can instantly connect and execute complex operations for you securely.
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
