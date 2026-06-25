import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import DashboardHomeClient from "@/components/dashboard/dashboard-home-client";
import { OnboardingProvider } from "@/components/onboarding";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata = {
  title: "Unified Flow | Solana Token Vesting Dashboard",
  description:
    "Monitor, create, and manage linear, cliff, and milestone vesting streams on Solana with a real-time dashboard, CSV bulk tools, CLI, and MCP support.",
  alternates: {
    canonical: siteUrl,
  },
};

async function getInitialStreams() {
  const apiBase = process.env.NEXT_PUBLIC_API;

  if (!apiBase) {
    return [];
  }

  try {
    const res = await fetch(`${apiBase}/streams`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    return await res.json();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const initialStreams = await getInitialStreams();

  return (
    <OnboardingProvider>
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <h1 className="sr-only">Unified Flow — Solana Token Vesting Dashboard</h1>
      <DashboardHeader />
      <DashboardHomeClient initialStreams={initialStreams} />
      <DashboardFooter />
    </div>
    </OnboardingProvider>
  );
}
