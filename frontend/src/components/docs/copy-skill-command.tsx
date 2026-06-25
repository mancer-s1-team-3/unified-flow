"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const COMMAND =
  "npx skills add https://github.com/mancer-s1-team-3/unified-flow/tree/main/backend";

export function CopySkillCommand() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(COMMAND);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 mb-6">
      <p className="text-sm text-indigo-200 mb-3">
        Install this skill:
      </p>

      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-950/70 px-3 py-2 font-mono text-xs text-white">
          {COMMAND}
        </code>

        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}