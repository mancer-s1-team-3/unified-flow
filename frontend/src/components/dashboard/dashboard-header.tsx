import Link from "next/link";
import { BookOpen } from "lucide-react";
import { DashboardHeaderWallet } from "@/components/dashboard/dashboard-header-wallet";
import { BrandMark } from "@/components/brand/brand-mark";

export function DashboardHeader() {
  return (
    <header className="max-w-7xl mx-auto w-full px-6 py-5 border-b border-zinc-900/80 flex justify-between items-center relative z-20 backdrop-blur-md bg-zinc-950/40">
      <div className="flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <span className="font-extrabold text-xl tracking-wider bg-gradient-to-r from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Unified Flow
          </span>
          <div className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase">Protocol Dashboard</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/docs"
          className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 font-medium transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 px-3.5 py-2 rounded-xl"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Developer Docs
        </Link>
        <DashboardHeaderWallet />
      </div>
    </header>
  );
}
