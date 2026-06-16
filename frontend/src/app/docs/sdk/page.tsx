import React from "react";
import { Coins } from "lucide-react";
import { CodeSnippet } from "@/components/docs/CodeSnippet";
import { SDK_METHODS } from "@/lib/docs-data";

export default function SdkPage() {
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3 mb-4">
          <Coins className="w-8 h-8 text-indigo-400" />
          TypeScript SDK
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Official SDK for creating, managing, editing, and withdrawing vesting streams on Solana.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-semibold text-zinc-100 mb-4">Installation</h3>
        <CodeSnippet code="npm install @unifiedflow/unified-flow-sdk" />
      </div>

      <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-semibold text-zinc-100 mb-4">Initialize Client</h3>
        <CodeSnippet
          code={`const client = new UnifiedFlowClient(
  program,
  wallet,
  connection,
  "confirmed"
);`}
        />
      </div>

      <div className="space-y-6 mt-8">
        <h3 className="text-2xl font-bold text-zinc-100 mb-6">Available Methods</h3>
        
        {SDK_METHODS.map((method) => (
          <div key={method.name} className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
            <h4 className="font-mono text-lg font-bold text-indigo-400 mb-2">
              {method.name}()
            </h4>
            <p className="text-sm text-zinc-400 mb-4">
              {method.desc}
            </p>
            <CodeSnippet code={method.example} />
          </div>
        ))}
      </div>

      <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800 mt-8">
        <h3 className="text-xl font-semibold text-zinc-100 mb-4">Transaction Progress</h3>
        <CodeSnippet
          code={`await client.withdraw(
  streamPDA,
  (status) => {
    console.log(status);
  }
);`}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
            <span className="font-mono text-cyan-400 text-sm">wallet_approval</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
            <span className="font-mono text-amber-400 text-sm">sending</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
            <span className="font-mono text-emerald-400 text-sm">confirming</span>
          </div>
        </div>
      </div>
    </div>
  );
}
