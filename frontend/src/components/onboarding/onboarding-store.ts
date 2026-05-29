"use client";

import { create } from "zustand";

const STORAGE_KEY = "uf-onboarding-complete";

export type OnboardingStep =
  | "connect_wallet"
  | "create_stream"
  | "view_stream"
  | "withdraw_cancel"
  | "export_csv";

const STEP_ORDER: OnboardingStep[] = [
  "connect_wallet",
  "create_stream",
  "view_stream",
  "withdraw_cancel",
  "export_csv",
];

export interface OnboardingStepMeta {
  id: OnboardingStep;
  number: number;
  title: string;
  description: string;
  highlight: string;
  action: string;
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    id: "connect_wallet",
    number: 1,
    title: "Connect Your Wallet",
    description:
      "Start by connecting a Solana wallet (Phantom, Solflare, etc.). This is required to create and manage vesting streams.",
    highlight: "Connect your Solana wallet to get started",
    action: "Connect Wallet",
  },
  {
    id: "create_stream",
    number: 2,
    title: "Create a Stream",
    description:
      'Navigate to "Create Stream" in the sidebar, download the CSV template, then upload your file or edit allocations directly in the editor. Choose the vesting type that fits your distribution: (0) Linear (tokens unlock gradually over time), (1) Cliff (tokens unlock on a specific date), or (2) Milestone (tokens unlock when milestones are completed).',
    highlight: "Create your first token vesting stream with CSV",
    action: "Go to Create Stream",
  },

  {
    id: "view_stream",
    number: 3,
    title: "View Your Active Stream",
    description:
      "Switch to the Streams tab to see your newly created stream. Click on it to view details like vesting progress, recipient, and schedule.",
    highlight: "Check your stream details and vesting progress",
    action: "Go to Streams",
  },
  {
    id: "withdraw_cancel",
    number: 4,
    title: "Try Withdraw or Cancel",
    description:
      "Test the core actions: use Withdraw to claim vested tokens, or Cancel to stop a stream and refund remaining tokens to the creator.",
    highlight: "Experience the withdraw and cancel flows",
    action: "Try Withdraw",
  },
  {
    id: "export_csv",
    number: 5,
    title: "Export CSV & Review",
    description:
      "Use the Bulk Edit CSV feature to export your stream data. Review the full workflow you just completed — you're ready to go!",
    highlight: "Export data and review what you learned",
    action: "Go to Bulk Edit CSV",
  },
];

interface OnboardingState {
  isComplete: boolean;
  isActive: boolean;
  currentStepIndex: number;
  dismissed: boolean;

  startOnboarding: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  getTargetTab: () => string | null;
}

function loadComplete(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveComplete(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  isComplete: loadComplete(),
  isActive: false,
  currentStepIndex: 0,
  dismissed: false,

  startOnboarding: () =>
    set({ isActive: true, currentStepIndex: 0, dismissed: false }),

  nextStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex >= STEP_ORDER.length - 1) {
      get().completeOnboarding();
    } else {
      set({ currentStepIndex: currentStepIndex + 1 });
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      set({ currentStepIndex: currentStepIndex - 1 });
    }
  },

  skipOnboarding: () => {
    saveComplete(true);
    set({ isComplete: true, isActive: false, dismissed: true });
  },

  completeOnboarding: () => {
    saveComplete(true);
    set({ isComplete: true, isActive: false });
  },

  resetOnboarding: () => {
    saveComplete(false);
    set({
      isComplete: false,
      isActive: false,
      currentStepIndex: 0,
      dismissed: false,
    });
  },

  getTargetTab: () => {
    const { currentStepIndex, isActive } = get();
    if (!isActive) return null;
    const step = STEP_ORDER[currentStepIndex];
    switch (step) {
      case "connect_wallet":
        return null;
      case "create_stream":
        return "create_streams";
      case "view_stream":
        return "streams";
      case "withdraw_cancel":
        return "withdraw";
      case "export_csv":
        return "edit_csv";
      default:
        return null;
    }
  },
}));
