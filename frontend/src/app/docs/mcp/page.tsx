import React from "react";
import { Cpu, Sparkles } from "lucide-react";
import { CodeSnippet } from "@/components/docs/CodeSnippet";
import { MCP_TOOLS } from "@/lib/docs-data";

export default function McpPage() {
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3 mb-4">
          <Cpu className="w-8 h-8 text-indigo-400" />
          Model Context Protocol (MCP)
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Give your LLM agent full access to perform read/write operations on the Solana program. Using the Model Context Protocol, the AI is granted tool interfaces for every contract operation.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-semibold text-zinc-100 flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          Integrating with Claude Desktop or Cursor
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
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
        <p className="mt-4 text-sm text-zinc-500 leading-relaxed">
          Replace the placeholders with your local values. The MCP server reads indexed data from the backend API, so it does not need direct database access.
        </p>
      </div>

      <div className="space-y-6 mt-8">
        <h3 className="text-2xl font-bold text-zinc-100 mb-6">Exposed MCP Tool Capabilities</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {MCP_TOOLS.map((tool, idx) => (
            <div key={idx} className="p-6 rounded-2xl bg-zinc-900/25 border border-zinc-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <code className="text-indigo-400 font-mono text-base font-bold">{tool.name}</code>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                    {tool.category}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{tool.desc}</p>
              </div>
              <div className="mt-6 border-t border-zinc-800/80 pt-4">
                <h5 className="text-xs uppercase tracking-wider font-semibold text-zinc-500 mb-3">Parameters</h5>
                <div className="space-y-2">
                  {tool.params.map((p, pIdx) => (
                    <div key={pIdx} className="text-sm text-zinc-400 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-zinc-800/50 pb-2 last:border-0 last:pb-0">
                      <span className="font-mono text-zinc-300">{p.name}</span>
                      <span className="text-zinc-500 font-mono italic text-xs">{p.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
