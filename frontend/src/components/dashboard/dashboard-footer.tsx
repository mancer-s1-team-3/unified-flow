import Link from "next/link";

export function DashboardFooter() {
  return (
    <footer className="hidden md:flex max-w-7xl mx-auto w-full px-6 py-6 border-t border-zinc-900 flex-col md:flex-row justify-between items-center gap-4 text-xs text-zinc-500 relative z-10">
      <div>&copy; {new Date().getFullYear()} Unified Flow Protocol. Built for Solana Devnet.</div>
      <div className="flex gap-4">
        <Link href="/guide" className="hover:text-cyan-400 transition-colors">
          User Guide
        </Link>
        <span>&middot;</span>
        <Link href="/docs" className="hover:text-indigo-400 transition-colors">
          API Reference
        </Link>
        <span>&middot;</span>
        <Link href="/docs" className="hover:text-indigo-400 transition-colors">
          MCP Server
        </Link>
        <span>&middot;</span>
        <Link href="/docs" className="hover:text-indigo-400 transition-colors">
          CLI & Skills
        </Link>
      </div>
    </footer>
  );
}
