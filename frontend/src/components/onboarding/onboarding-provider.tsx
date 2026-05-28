"use client";

import { type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { OnboardingWizard } from "./onboarding-wizard";
import { useOnboarding } from "./onboarding-store";

export function OnboardingProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <OnboardingWizard />
    </>
  );
}

/**
 * Small banner shown on the dashboard for users who have completed onboarding
 * but might want to restart the tour. Renders nothing once dismissed.
 */
export function OnboardingCompletedBanner() {
  const { isComplete, startOnboarding, resetOnboarding } = useOnboarding();

  if (!isComplete) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
        <p className="text-xs text-zinc-400 truncate">
          <span className="text-zinc-200 font-semibold">Welcome aboard!</span>{" "}
          You&apos;re ready to start creating vesting streams.
        </p>
      </div>
      <button
        onClick={() => {
          resetOnboarding();
          setTimeout(() => startOnboarding(), 100);
        }}
        className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all"
      >
        Replay Tour
      </button>
    </div>
  );
}
