"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { BookOpen, GraduationCap, Menu, X } from "lucide-react";
import { DashboardHeaderWallet } from "@/components/dashboard/dashboard-header-wallet";
import { NetworkSwitcher } from "@/components/wallet/network-switcher";
import { BrandMark } from "@/components/brand/brand-mark";
import { NotificationCenter } from "@/components/dashboard/notification-center";

export function DashboardHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-zinc-900/80 backdrop-blur-md bg-zinc-950/80">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-3 sm:py-5 flex justify-between items-center relative">

        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3">
          <BrandMark size={36} />
          <div>
            <span className="font-extrabold text-base sm:text-xl tracking-wider bg-gradient-to-r from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Unified Flow
            </span>
            <div className="hidden sm:block text-[10px] text-zinc-500 font-semibold tracking-widest uppercase">
              Protocol Dashboard
            </div>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/guide"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-cyan-400 font-medium transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 px-3.5 py-2 rounded-xl"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            User Guide
          </Link>
          <Link
            href="/docs"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 font-medium transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 px-3.5 py-2 rounded-xl"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Developer Docs
          </Link>
          <NotificationCenter />
          <NetworkSwitcher />
          <DashboardHeaderWallet />
        </div>

        {/* Mobile: notification + burger */}
        <div className="flex md:hidden items-center gap-2" ref={menuRef}>
          <NotificationCenter />

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-all"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-4 h-4 text-zinc-300" /> : <Menu className="w-4 h-4 text-zinc-300" />}
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 space-y-1">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 px-2 pb-1">Network</div>
                <NetworkSwitcher dropdownAlign="left" />

                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 px-2 pt-2 pb-1">Wallet</div>
                <DashboardHeaderWallet />

                <div className="border-t border-zinc-800/60 pt-2 mt-1 space-y-1">
                  <Link
                    href="/guide"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-xs text-zinc-400 hover:text-cyan-400 font-medium transition-colors px-2 py-2 rounded-xl hover:bg-zinc-800/60"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    User Guide
                  </Link>
                  <Link
                    href="/docs"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-xs text-zinc-400 hover:text-indigo-400 font-medium transition-colors px-2 py-2 rounded-xl hover:bg-zinc-800/60"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Developer Docs
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
