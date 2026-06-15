"use client";
import React, { useState, useEffect } from "react";
import { Search, Command, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { API_ENDPOINTS, MCP_TOOLS, CLI_READ_COMMANDS, CLI_WRITE_COMMANDS, SDK_METHODS } from "@/lib/docs-data";

export function DocsSearch(): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Handle Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Aggregate data
  const allItems = [
    ...API_ENDPOINTS.map(api => ({
      title: `${api.method} ${api.path}`,
      desc: api.desc,
      category: "REST API",
      url: "/docs/api"
    })),
    ...MCP_TOOLS.map(mcp => ({
      title: mcp.name,
      desc: mcp.desc,
      category: "MCP Tools",
      url: "/docs/mcp"
    })),
    ...CLI_READ_COMMANDS.map(cli => ({
      title: cli.cmd,
      desc: cli.desc,
      category: "CLI Commands",
      url: "/docs/cli"
    })),
    ...CLI_WRITE_COMMANDS.map(cli => ({
      title: cli.cmd,
      desc: cli.desc,
      category: "CLI Commands",
      url: "/docs/cli"
    })),
    ...SDK_METHODS.map(sdk => ({
      title: `${sdk.name}()`,
      desc: sdk.desc,
      category: "TypeScript SDK",
      url: "/docs/sdk"
    }))
  ];

  const results = query.trim() === "" 
    ? allItems 
    : allItems.filter(item => 
      item.title.toLowerCase().includes(query.toLowerCase()) || 
      item.desc.toLowerCase().includes(query.toLowerCase())
    );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 transition-colors text-sm text-zinc-400 hover:text-zinc-200"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Search docs...</span>
        <kbd className="hidden sm:flex items-center gap-1 font-sans text-xs bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
          <Command className="w-3 h-3" />K
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 sm:pt-32">
          <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden mx-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center border-b border-zinc-800 px-4 py-3">
              <Search className="w-5 h-5 text-zinc-500 mr-3" />
              <input
                autoFocus
                type="text"
                placeholder="Search documentation..."
                className="flex-1 bg-transparent text-zinc-100 placeholder:text-zinc-500 outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">No results found for "{query}"</div>
              ) : (
                <div className="space-y-1">
                  {results.map((item, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-800/50 transition-colors group flex items-start justify-between"
                      onClick={() => {
                        router.push(item.url);
                        setIsOpen(false);
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-200 group-hover:text-indigo-400 transition-colors">{item.title}</div>
                        <div className="text-xs text-zinc-500 mt-1 line-clamp-1">{item.desc}</div>
                      </div>
                      <span className="text-2xs font-medium text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded whitespace-nowrap ml-4">
                        {item.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
