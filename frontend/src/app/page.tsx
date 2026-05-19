import DashboardHomeClient from "@/components/dashboard/dashboard-home-client";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <DashboardHeader />
      <DashboardHomeClient />
      <DashboardFooter />
    </div>
  );
}
