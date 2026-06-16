"use client";
import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export const CodeSnippet = ({ code }: { code: string }) => {
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
