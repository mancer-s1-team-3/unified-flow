"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BookOpen, Terminal, Cpu, Globe, Coins, ArrowLeft, Sparkles, Settings, Layers, FileCode, Rocket, Menu, X, Wrench } from "lucide-react";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { DocsSidebarLink } from "@/components/docs/DocsSidebarLink";
import { DocsChatbot } from "@/components/docs/DocsChatbot";
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navSections = [
    {
      title: "Getting Started",
      links: [
        { id: "overview", label: "Overview", icon: <BookOpen className="w-4 h-4" />, href: "/docs/overview" },
      ],
    },
    {
      title: "Instruction Reference",
      links: [
        { id: "instructions", label: "Program Instructions", icon: <FileCode className="w-4 h-4" />, href: "/docs/instructions" },
      ],
    },
    {
      title: "Integration Guide",
      links: [
        { id: "guide", label: "Developer Guide", icon: <Rocket className="w-4 h-4" />, href: "/docs/guide" },
      ],
    },
    {
      title: "Tools & SDKs",
      links: [
        { id: "sdk", label: "TypeScript SDK", icon: <Coins className="w-4 h-4" />, href: "/docs/sdk" },
        { id: "api", label: "REST API", icon: <Globe className="w-4 h-4" />, href: "/docs/api" },
        { id: "mcp", label: "Model Context Protocol", icon: <Cpu className="w-4 h-4" />, href: "/docs/mcp" },
        { id: "cli", label: "CLI & Agent Skills", icon: <Terminal className="w-4 h-4" />, href: "/docs/cli" },
      ],
    },
    {
      title: "Architecture",
      links: [
        { id: "adr", label: "Decision Records", icon: <Wrench className="w-4 h-4" />, href: "/docs/adr" },
        { id: "setup", label: "Setup Guide", icon: <Settings className="w-4 h-4" />, href: "/docs/setup" },
      ],
    },
  ];

  const sidebarContent = (
    <>
      <nav className="space-y-6">
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-3">{section.title}</div>
            <div className="space-y-0.5">
              {section.links.map((link) => (
                <DocsSidebarLink key={link.id} href={link.href} icon={link.icon}>
                  {link.label}
                </DocsSidebarLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Protocol Info Card */}
      <div className="mt-8 p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800 shadow-sm relative overflow-hidden group">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-colors" />
        <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 mb-3">
          <Settings className="w-3.5 h-3.5 text-indigo-400" />
          Protocol Info
        </h3>
        <div className="space-y-2.5">
          {[
            { label: "Network", value: "Devnet", color: "" },
            { label: "Framework", value: "Anchor 0.32.1", color: "" },
            { label: "Chainlink Feed", value: "99B2bT...rR", full: "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR", color: "text-indigo-400" },
            { label: "Program ID", value: "8M5yie...Fa", full: "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa", color: "text-indigo-400" },
            { label: "CLI Package", value: "@unifiedflow/cli", color: "text-emerald-400" },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">{item.label}</span>
              <span className={`font-mono font-semibold truncate max-w-[120px] ${item.color || "text-zinc-300"}`} title={item.full || item.value}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Vesting Types Quick Ref */}
      <div className="mt-4 p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 mb-3">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          Vesting Type IDs
        </h3>
        <div className="space-y-2">
          {[
            { id: "0", label: "Linear", color: "text-cyan-400" },
            { id: "1", label: "Cliff", color: "text-violet-400" },
            { id: "2", label: "Milestone", color: "text-amber-400" },
          ].map((t) => (
            <div key={t.id} className="flex justify-between items-center text-xs">
              <span className={`font-mono font-bold ${t.color}`}>Type {t.id}</span>
              <span className="text-zinc-400">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Autonomous Agents / Skills */}
      <div className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-zinc-900 border border-indigo-500/20 text-zinc-100">
        <h3 className="font-bold text-xs flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          Autonomous Agents
        </h3>
        <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
          Native Model Context Protocol support. AI Agents can execute complex operations securely.
        </p>
        <div className="mt-3">
          <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-300 block mb-1">Skills Route</span>
          <Link
            href="/skills"
            className="inline-flex items-center gap-2 font-mono text-[11px] text-zinc-200 bg-black/40 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-indigo-500/40 hover:text-white transition-colors"
          >
            <BookOpen className="w-3 h-3 text-indigo-400" />
            /skills
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400">
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/" className="flex items-center gap-2 text-zinc-100 hover:text-indigo-400 transition-colors font-bold text-sm">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span className="hidden sm:inline">Unified Flow</span>
              <span className="text-zinc-500 font-normal">Docs</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <DocsSearch />
            <Link href="/" className="text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors items-center gap-1.5 hidden sm:flex">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to App
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1400px] mx-auto w-full flex relative">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-72 h-full bg-zinc-950 border-r border-zinc-800 overflow-y-auto p-6">
              <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
              {sidebarContent}
            </div>
          </div>
        )}

        {/* Desktop Left Sidebar */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-950 hidden lg:block shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto py-6 pl-5 pr-3">
          {sidebarContent}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 py-10 px-5 lg:px-12 max-w-4xl">
          {children}
        </main>
      </div>
            <DocsChatbot />
    </div>
  );
}
