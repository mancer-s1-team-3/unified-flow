"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, Droplets, ExternalLink, GraduationCap, Menu, X } from "lucide-react";
import { DashboardHeaderWallet } from "@/components/dashboard/dashboard-header-wallet";
import { NetworkSwitcher } from "@/components/wallet/network-switcher";
import { useNetwork } from "@/components/wallet/network-context";
import { BrandMark } from "@/components/brand/brand-mark";
import { NotificationCenter } from "@/components/dashboard/notification-center";

function SolanaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 397.7 311.7" className={className} aria-hidden>
      <defs>
        <linearGradient id="solana-grad" x1="360.9" y1="-37.5" x2="141.2" y2="383.3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00ffa3" />
          <stop offset="1" stopColor="#dc1fff" />
        </linearGradient>
      </defs>
      <path
        fill="url(#solana-grad)"
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
      />
      <path
        fill="url(#solana-grad)"
        d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
      />
      <path
        fill="url(#solana-grad)"
        d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
      />
    </svg>
  );
}

function UsdcLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        fill="#fff"
        d="M20.5 18.5c0-2.4-1.4-3.2-4.3-3.5-2-.3-2.4-.8-2.4-1.7s.7-1.5 2-1.5c1.2 0 1.9.4 2.2 1.4.1.2.3.4.5.4h1c.3 0 .5-.2.5-.5v-.1c-.3-1.3-1.3-2.3-2.6-2.5V9c0-.3-.2-.5-.6-.6h-1c-.3 0-.5.2-.6.6v1.4c-2 .3-3.3 1.6-3.3 3.3 0 2.3 1.4 3.1 4.3 3.4 1.9.3 2.5.7 2.5 1.8s-1 1.8-2.3 1.8c-1.8 0-2.4-.8-2.6-1.8-.1-.3-.3-.4-.5-.4h-1c-.3 0-.5.2-.5.5v.1c.3 1.5 1.3 2.5 3.4 2.8V23c0 .3.2.5.6.6h1c.3 0 .5-.2.6-.6v-1.4c2-.3 3.4-1.7 3.4-3.6z"
      />
      <path
        fill="#fff"
        d="M13 25.5c-5.2-1.9-7.9-7.7-6-12.9 1-2.8 3.2-4.9 6-6 .3-.1.4-.3.4-.6v-.9c0-.3-.1-.5-.4-.5-.1 0-.2 0-.3.1-6.3 2-9.8 8.7-7.8 15 1.2 3.7 4 6.5 7.8 7.7.3.2.6 0 .6-.3v-.9c0-.2-.2-.4-.4-.5zM19.3 4.6c-.3-.2-.6 0-.6.3v.9c0 .3.2.5.4.6 5.2 1.9 7.9 7.7 6 12.9-1 2.8-3.2 4.9-6 6-.3.1-.4.3-.4.6v.9c0 .3.1.5.4.5.1 0 .2 0 .3-.1 6.3-2 9.8-8.7 7.8-15-1.2-3.8-4.1-6.6-7.9-7.8z"
      />
    </svg>
  );
}

const FAUCET_LINKS = [
  { label: "Solana Faucet", href: "https://faucet.solana.com/", Logo: SolanaLogo },
  { label: "USDC Faucet", href: "https://faucet.circle.com/", Logo: UsdcLogo },
] as const;

export function DashboardHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faucetOpen, setFaucetOpen] = useState(false);
  const [mobileFaucetOpen, setMobileFaucetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const faucetRef = useRef<HTMLDivElement>(null);
  const { cluster } = useNetwork();
  const showFaucet = cluster === "devnet";

  useEffect(() => {
    if (!menuOpen) {
      setMobileFaucetOpen(false);
      return;
    }
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

  useEffect(() => {
    if (!faucetOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (faucetRef.current && e.target instanceof Node && !faucetRef.current.contains(e.target)) {
        setFaucetOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [faucetOpen]);

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

          {/* Faucet dropdown — devnet only */}
          {showFaucet && (
          <div className="relative" ref={faucetRef}>
            <button
              type="button"
              onClick={() => setFaucetOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 font-medium transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 px-3.5 py-2 rounded-xl"
            >
              <Droplets className="w-3.5 h-3.5" />
              Faucet
            </button>
            {faucetOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 p-2 space-y-1">
                {FAUCET_LINKS.map((faucet) => (
                  <a
                    key={faucet.href}
                    href={faucet.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setFaucetOpen(false)}
                    className="flex items-center gap-2 text-xs text-zinc-400 hover:text-emerald-400 font-medium transition-colors px-2.5 py-2 rounded-xl hover:bg-zinc-800/60"
                  >
                    <faucet.Logo className="w-4 h-4 shrink-0" />
                    {faucet.label}
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                ))}
              </div>
            )}
          </div>
          )}

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

                {showFaucet && (
                <div className="border-t border-zinc-800/60 pt-2 mt-1 space-y-1">
                  <button
                    type="button"
                    onClick={() => setMobileFaucetOpen((v) => !v)}
                    aria-expanded={mobileFaucetOpen}
                    className="w-full flex items-center gap-2 text-xs text-zinc-400 hover:text-emerald-400 font-medium transition-colors px-2 py-2 rounded-xl hover:bg-zinc-800/60"
                  >
                    <Droplets className="w-3.5 h-3.5" />
                    Faucet
                    <ChevronDown
                      className={`w-3.5 h-3.5 ml-auto transition-transform ${mobileFaucetOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {mobileFaucetOpen && (
                    <div className="pl-3 ml-2 border-l border-zinc-800/60 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      {FAUCET_LINKS.map((faucet) => (
                        <a
                          key={faucet.href}
                          href={faucet.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-emerald-400 font-medium transition-colors px-2 py-2 rounded-xl hover:bg-zinc-800/60"
                        >
                          <faucet.Logo className="w-4 h-4 shrink-0" />
                          {faucet.label}
                          <ExternalLink className="w-3 h-3 ml-auto text-zinc-600" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
