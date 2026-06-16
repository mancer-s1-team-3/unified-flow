import React from "react";
import { Globe } from "lucide-react";
import { CodeSnippet } from "@/components/docs/CodeSnippet";
import { API_ENDPOINTS } from "@/lib/docs-data";

export default function ApiPage() {
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3 mb-4">
          <Globe className="w-8 h-8 text-indigo-400" />
          REST API Integration
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          The backend indexer continuously monitors on-chain events and records all streams in real-time. Integrate your dApp or internal workflows using our lightweight REST JSON endpoints.
        </p>
      </div>

      <div className="space-y-8">
        {API_ENDPOINTS.map((api, idx) => (
          <div key={idx} className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-sm px-3 py-1.5 rounded-lg font-bold">
                {api.method}
              </span>
              <code className="text-zinc-100 font-mono text-lg font-semibold">{api.path}</code>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">{api.desc}</p>

            <div>
              <h4 className="text-xs uppercase tracking-wider font-semibold text-zinc-500 mb-3">Example Response Payload</h4>
              <CodeSnippet code={api.response} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
