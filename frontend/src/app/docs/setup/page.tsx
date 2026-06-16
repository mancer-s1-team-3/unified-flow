"use client";

import React, { useState } from "react";
import {
  Settings,
  Copy,
  Check,
  Terminal,
  Package,
  Globe,
  Layers,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 text-sm">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
          <span className="text-xs font-mono text-zinc-500">{label}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
        </div>
      )}
      <pre className="p-4 overflow-x-auto leading-relaxed">
        <code className="font-mono text-zinc-300 text-xs">{code}</code>
      </pre>
    </div>
  );
}

function Callout({
  type,
  title,
  children,
}: {
  type: "info" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      wrapper: "bg-indigo-500/5 border-indigo-500/15",
      icon: <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />,
      title: "text-indigo-300",
    },
    warning: {
      wrapper: "bg-amber-500/5 border-amber-500/15",
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
      title: "text-amber-300",
    },
  };
  const s = styles[type];
  return (
    <div className={`rounded-xl border p-4 flex gap-3 ${s.wrapper}`}>
      {s.icon}
      <div>
        <div className={`text-sm font-semibold mb-1 ${s.title}`}>{title}</div>
        <div className="text-sm text-zinc-400 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

type TroubleshootItem = {
  title: string;
  code: string;
};

function TroubleshootAccordion({ items }: { items: TroubleshootItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/20 overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <span>{item.title}</span>
            {open === i ? (
              <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
          </button>
          {open === i && (
            <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
              <CodeBlock code={item.code} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PrereqTable() {
  const rows = [
    { tool: "Rust", version: "1.89.0 (pinned)", cmd: "rustc --version" },
    { tool: "Solana CLI", version: "2.2.1", cmd: "solana --version" },
    { tool: "Anchor CLI", version: "0.32.1", cmd: "anchor --version" },
    { tool: "Node.js", version: ">= 18 LTS", cmd: "node --version" },
    { tool: "Yarn", version: "latest", cmd: "yarn --version" },
    { tool: "PostgreSQL", version: ">= 14", cmd: "psql --version" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            <th className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 px-4 py-2.5">Tool</th>
            <th className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 px-4 py-2.5">Version</th>
            <th className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 px-4 py-2.5">Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.tool} className={i < rows.length - 1 ? "border-b border-zinc-800/60" : ""}>
              <td className="px-4 py-2.5 font-medium text-zinc-200">{r.tool}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-indigo-300">{r.version}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{r.cmd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScriptsTable() {
  const rows = [
    { context: "Root", cmd: "yarn lint", desc: "Lint all TypeScript" },
    { context: "Root", cmd: "anchor build", desc: "Build Anchor program" },
    { context: "Root", cmd: "anchor test", desc: "Run full test suite" },
    { context: "Backend", cmd: "npm run dev", desc: "Start indexer + API (hot-reload)" },
    { context: "Backend", cmd: "npm run mcp", desc: "Start MCP server" },
    { context: "Frontend", cmd: "npm run dev", desc: "Start Next.js dev server" },
    { context: "Frontend", cmd: "npm run build", desc: "Production build" },
    { context: "CLI", cmd: "unifiedflow version", desc: "Print version and program info" },
    { context: "CLI", cmd: "unifiedflow config", desc: "Print protocol config" },
    { context: "CLI", cmd: "unifiedflow view <PDA>", desc: "Inspect a stream on-chain" },
  ];

  const contextColors: Record<string, string> = {
    Root: "text-cyan-400 bg-cyan-500/5",
    Backend: "text-violet-400 bg-violet-500/5",
    Frontend: "text-indigo-400 bg-indigo-500/5",
    CLI: "text-amber-400 bg-amber-500/5",
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            <th className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 px-4 py-2.5">Context</th>
            <th className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 px-4 py-2.5">Command</th>
            <th className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 px-4 py-2.5">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i < rows.length - 1 ? "border-b border-zinc-800/60" : ""}>
              <td className="px-4 py-2.5">
                <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${contextColors[r.context]}`}>
                  {r.context}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{r.cmd}</td>
              <td className="px-4 py-2.5 text-xs text-zinc-500">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Section = {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
};

export default function SetupGuidePage() {
  const sections: Section[] = [
    {
      id: "prereqs",
      icon: <Package className="w-4 h-4 text-cyan-400" />,
      title: "Prerequisites",
      content: (
        <div className="space-y-4">
          <PrereqTable />
          <CodeBlock
            label="Clone & install"
            code={`git clone <repository-url>
cd unified-flow

# Install root JS tooling
yarn install

# Generate a local Solana keypair if needed
solana-keygen new --outfile ~/.config/solana/id.json

# Point to Devnet
solana config set --url https://api.devnet.solana.com`}
          />
        </div>
      ),
    },
    {
      id: "anchor",
      icon: <Terminal className="w-4 h-4 text-violet-400" />,
      title: "Build & Deploy Anchor Program",
      content: (
        <div className="space-y-4">
          <CodeBlock
            label="anchor build & deploy"
            code={`# Build the program
anchor build

# Outputs:
#   target/deploy/unified_flow.so
#   target/idl/unified_flow.json
#   target/types/unified_flow.ts

# Deploy to Devnet
anchor deploy --provider.cluster devnet

# If Program ID changes, sync and rebuild:
anchor keys sync
anchor build

# Verify deployed program:
solana program show 8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa --url devnet`}
          />
          <Callout type="warning" title="One-Time Init Required">
            The <code className="font-mono text-xs text-amber-200 bg-amber-500/10 px-1 rounded">initialize_config</code> instruction must be run exactly once after the first deployment. Streams cannot be created until the config PDA is initialized. Running it twice will fail safely (PDA already initialized).
            <br /><br />
            <code className="font-mono text-xs text-amber-200">unifiedflow init</code> or <code className="font-mono text-xs text-amber-200">await client.initializeConfig()</code>
          </Callout>
        </div>
      ),
    },
    {
      id: "tests",
      icon: <Layers className="w-4 h-4 text-indigo-400" />,
      title: "Run the Test Suite",
      content: (
        <div className="space-y-4">
          <CodeBlock
            label="testing commands"
            code={`# Run all tests (anchor manages local validator)
anchor test

# Faster iteration: run validator separately
solana-test-validator -r
anchor test --skip-local-validator

# Run only bankrun tests
yarn test:bankrun

# Run Mollusk SVM compute unit benchmarks
yarn test:mollusk

# Check coverage
# Note: ~35% function coverage is expected
# due to auto-generated Anchor __idl_* functions
yarn test:coverage`}
          />
          <Callout type="info" title="Expected Coverage">
            Function coverage reports ~35% due to Anchor's auto-generated <code className="font-mono text-xs text-indigo-200 bg-indigo-500/10 px-1 rounded">__idl_*</code> and <code className="font-mono text-xs text-indigo-200 bg-indigo-500/10 px-1 rounded">__metadata_*</code> functions (~25 unreachable functions). Branch coverage on core instructions is 93–100%.
          </Callout>
        </div>
      ),
    },
    {
      id: "backend",
      icon: <Globe className="w-4 h-4 text-emerald-400" />,
      title: "Backend Indexer",
      content: (
        <div className="space-y-4">
          <CodeBlock
            label="backend/.env"
            code={`DATABASE_URL="postgresql://user:password@localhost:5432/unifiedflow"
RPC_HTTP="https://api.devnet.solana.com"
RPC_WS="wss://api.devnet.solana.com"
PROGRAM_ID="8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
PORT=3001`}
          />
          <CodeBlock
            label="setup & start"
            code={`cd backend
npm install
cp .env.example .env   # then configure

# Run Prisma migrations
npx prisma migrate deploy
npx prisma generate

# Start dev server (hot-reload)
npm run dev

# Health check
curl http://localhost:3001/health
# Expected: { "status": "ok", "message": "Backend is running" }`}
          />
        </div>
      ),
    },
    {
      id: "frontend",
      icon: <Globe className="w-4 h-4 text-sky-400" />,
      title: "Frontend Dashboard",
      content: (
        <div className="space-y-4">
          <CodeBlock
            label="frontend/.env.local"
            code={`NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`}
          />
          <CodeBlock
            label="start dev server"
            code={`cd frontend
npm install
npm run dev
# App available at: http://localhost:3000

# Production build
npm run build && npm start`}
          />
        </div>
      ),
    },
    {
      id: "cli",
      icon: <Terminal className="w-4 h-4 text-amber-400" />,
      title: "CLI Tool",
      content: (
        <div className="space-y-4">
          <CodeBlock
            label="install & configure"
            code={`# Install globally from npm
npm install -g @unifiedflow/cli

# Or build from source:
cd cli && npm install && npm run build && npm link

# Configure environment
export WALLET_PATH=~/.config/solana/id.json
export PROGRAM_ID=8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa
export RPC_URL=https://api.devnet.solana.com

# Verify
unifiedflow version`}
          />
        </div>
      ),
    },
    {
      id: "mcp",
      icon: <Package className="w-4 h-4 text-pink-400" />,
      title: "MCP Server (AI Agent Integration)",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Add the following to your Claude Desktop or Cursor <code className="font-mono text-xs text-zinc-300 bg-zinc-800 px-1 rounded">mcp_settings.json</code>:
          </p>
          <CodeBlock
            label="mcp_settings.json"
            code={`{
  "mcpServers": {
    "unified-flow-mcp": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/backend", "run", "mcp"],
      "env": {
        "RPC_HTTP": "https://api.devnet.solana.com",
        "RPC_WS": "wss://api.devnet.solana.com",
        "PROGRAM_ID": "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa",
        "API_BASE_URL": "http://localhost:3001",
        "WALLET_PATH": "~/.config/solana/id.json"
      }
    }
  }
}`}
          />
        </div>
      ),
    },
    {
      id: "scripts",
      icon: <Settings className="w-4 h-4 text-zinc-400" />,
      title: "Useful Scripts Reference",
      content: <ScriptsTable />,
    },
    {
      id: "troubleshoot",
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      title: "Troubleshooting",
      content: (
        <TroubleshootAccordion
          items={[
            {
              title: "anchor build fails: Rust version mismatch",
              code: `rustup show    # Should show active toolchain from rust-toolchain.toml
rustup update  # Update if needed`,
            },
            {
              title: "Program ID mismatch after deploy",
              code: `anchor keys sync
anchor build
anchor deploy --provider.cluster devnet`,
            },
            {
              title: "AccountDiscriminatorMismatch on cancel/withdraw",
              code: `# Usually caused by network endpoint mismatch.
# Ensure CLI and frontend both point to Devnet.
# Check RPC_URL in all .env files.
# Also verify the program was redeployed after a rebuild.`,
            },
            {
              title: "Devnet airdrop rate limited",
              code: `# Use Solana's web faucet:
# https://faucet.solana.com

# Or retry:
solana airdrop 2 --url devnet
solana balance --url devnet`,
            },
            {
              title: "Oracle staleness error on withdraw",
              code: `# The Chainlink SOL/USD feed on Devnet may go stale
# if the network is congested.
# If oracle data is older than 1 hour, withdraw returns StaleOraclePrice.
# Wait for the oracle to refresh (usually within minutes) and retry.`,
            },
            {
              title: "Backend and frontend port conflict",
              code: `# Set backend to port 3001
PORT=3001 npm run dev   # in backend/

# Update frontend .env.local:
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-10 animate-fadeIn">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Architecture</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 mb-4">Setup Guide</h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Canonical setup guide for the Unified Flow monorepo — Anchor program, backend indexer, frontend
          dashboard, CLI, SDK, and test suite.
        </p>
      </div>

      {/* Repo structure */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">
          Repository Structure
        </div>
        <CodeBlock
          label="unified-flow/"
          code={`unified-flow/
├── Anchor.toml                 # Anchor, cluster, wallet, test config
├── Cargo.toml                  # Rust workspace manifest
├── rust-toolchain.toml         # Pinned Rust toolchain (1.89.0)
├── package.json                # JS/TS root tooling
├── programs/
│   └── unified-flow/           # Anchor on-chain program (Rust)
│       └── src/lib.rs          # Main program: all instructions
│           src/oracle.rs       # Chainlink oracle reader
├── tests/                      # anchor-bankrun + Mollusk SVM tests
├── sdk/                        # @unifiedflow/unified-flow-sdk
├── backend/                    # Express + Prisma indexer
│   ├── src/indexer.ts          # On-chain event listener
│   ├── src/routes/             # REST API routes
│   └── prisma/schema.prisma    # PostgreSQL schema
├── frontend/                   # Next.js 14 dashboard
│   └── src/app/                # App Router pages
├── cli/                        # @unifiedflow/cli
│   ├── src/commands/           # Per-command handlers
│   └── src/index.ts            # CLI entry (shebang fixed)
└── .github/workflows/          # CI: build, test, deploy`}
        />
      </div>

      {/* Sections */}
      <div className="space-y-10">
        {sections.map((section, i) => (
          <section key={section.id}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                {section.icon}
              </div>
              <h2 className="text-base font-bold text-zinc-100">
                <span className="text-zinc-600 font-mono mr-2 text-sm">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.title}
              </h2>
            </div>
            {section.content}
          </section>
        ))}
      </div>
    </div>
  );
}