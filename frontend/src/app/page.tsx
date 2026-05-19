import DashboardHomeClient from "@/components/dashboard/dashboard-home-client";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";

export const metadata = {
  title: "Unified Flow | Solana Token Vesting Dashboard",
  description:
    "Monitor, create, and manage linear, cliff, and milestone vesting streams on Solana with a real-time dashboard, CSV bulk tools, CLI, and MCP support.",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <DashboardHeader />
      <DashboardHomeClient />
      <DashboardFooter />
    </div>
  );
}
