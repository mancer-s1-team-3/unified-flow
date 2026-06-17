import React from "react";
import { Terminal, Globe, Edit3, Info } from "lucide-react";
import { CodeSnippet } from "@/components/docs/CodeSnippet";
import { CLI_READ_COMMANDS, CLI_WRITE_COMMANDS } from "@/lib/docs-data";

const CliCard = ({ cmd, desc, example }: { cmd: string; desc: string; example?: string }) => (
  <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
    <p className="text-sm font-medium text-zinc-300 leading-relaxed mb-4">{desc}</p>
    <CodeSnippet code={cmd} />
    {example && (
      <div className="mt-4 border-t border-zinc-800/50 pt-4">
        <span className="text-xs uppercase tracking-wider font-semibold text-zinc-500 mb-2 block">Example</span>
        <CodeSnippet code={example} />
      </div>
    )}
  </div>
);

export default function CliPage() {
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3 mb-4">
          <Terminal className="w-8 h-8 text-indigo-400" />
          CLI & AI Agent Skills
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Trigger operations directly in your terminal using the <code className="text-indigo-300 font-mono text-base">@unifiedflow/cli</code> package. Install globally via npm and configure your wallet and RPC via environment variables.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <span className="text-xs uppercase tracking-wider font-semibold text-zinc-500 block mb-3">Installation</span>
        <code className="font-mono text-sm text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">npm install -g @unifiedflow/cli</code>
        
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <span className="text-xs uppercase tracking-wider font-semibold text-zinc-500 block mb-3">
            Environment Variables (.env)
          </span>
          <pre className="font-mono text-sm text-zinc-300 whitespace-pre-wrap break-all bg-zinc-950 p-4 rounded-xl border border-zinc-800">
{`WALLET_PATH=~/.config/solana/id.json
PROGRAM_ID=8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa
RPC_URL=https://api.devnet.solana.com`}
          </pre>
        </div>
      </div>

      <div className="space-y-6 mt-10">
        <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-2 mb-6">
          <Globe className="w-6 h-6 text-cyan-400" />
          Read Commands
        </h3>
        <div className="space-y-4">
          {CLI_READ_COMMANDS.map((cmd, idx) => (
            <CliCard key={idx} {...cmd} />
          ))}
        </div>
      </div>

      <div className="space-y-6 mt-10">
        <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-2 mb-6">
          <Edit3 className="w-6 h-6 text-amber-400" />
          Write / Transaction Commands
        </h3>
        <div className="space-y-4">
          {CLI_WRITE_COMMANDS.map((cmd, idx) => (
            <CliCard key={idx} {...cmd} />
          ))}
        </div>
      </div>

      <div className="p-8 rounded-2xl bg-zinc-900/20 border border-zinc-800 space-y-4 mt-10">
        <h3 className="text-xl font-bold text-zinc-100 flex items-center gap-2 mb-4">
          <Info className="w-6 h-6 text-amber-400" />
          Crucial Protocol Verification Rules
        </h3>
        <ul className="text-sm text-zinc-400 space-y-3 list-disc list-inside leading-relaxed">
          <li>
            <span className="font-semibold text-zinc-200">Milestones Balance Validation:</span> Sum of milestone allocations must exactly equal the stream total amount.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">Sequential Milestones Approvals:</span> Milestone index <code className="text-amber-300 font-mono">i</code> must be unlocked before index <code className="text-amber-300 font-mono">i+1</code> can be processed.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">Oracle Staleness Limit:</span> Devnet oracle feed read will block claims if data updates are older than 1 hour.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">Cancel Authorization:</span> Only the stream creator can cancel. Unvested tokens are returned — withdrawn amounts are non-refundable.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">Init Once:</span> The <code className="text-amber-300 font-mono">init</code> command initializes the global config PDA and should only be run once by the protocol admin.
          </li>
        </ul>
      </div>
    </div>
  );
}
