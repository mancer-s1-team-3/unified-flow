"use client";

import { useEffect, useCallback } from "react";
import {
  ArrowRight,
  ArrowLeft,
  X,
  Wallet,
  PlusCircle,
  Layers,
  ArrowDownRight,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useOnboarding, ONBOARDING_STEPS } from "./onboarding-store";

const STEP_ICONS = [Wallet, PlusCircle, Layers, ArrowDownRight, FileSpreadsheet];

export function OnboardingWizard() {
  const {
    isActive,
    isComplete,
    currentStepIndex,
    nextStep,
    prevStep,
    skipOnboarding,
    startOnboarding,
  } = useOnboarding();

  // Auto-start for first-time users on mount
  useEffect(() => {
    if (!isComplete && !isActive) {
      const timer = setTimeout(() => startOnboarding(), 800);
      return () => clearTimeout(timer);
    }
  }, [isComplete, isActive, startOnboarding]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;
      if (e.key === "Escape") skipOnboarding();
      if (e.key === "ArrowRight") nextStep();
      if (e.key === "ArrowLeft") prevStep();
    },
    [isActive, nextStep, prevStep, skipOnboarding]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isActive || isComplete) return null;

  const step = ONBOARDING_STEPS[currentStepIndex];
  const StepIcon = STEP_ICONS[currentStepIndex];
  const isLast = currentStepIndex === ONBOARDING_STEPS.length - 1;
  const isFirst = currentStepIndex === 0;
  const progress = ((currentStepIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[200] w-[calc(100vw-2rem)] sm:w-96 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-950/98 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 w-full bg-zinc-900">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
              Getting Started
            </span>
          </div>
          <button
            onClick={skipOnboarding}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all"
            aria-label="Skip onboarding"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 pb-4 pt-2">
          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {ONBOARDING_STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`w-2 h-2 rounded-full transition-all ${
                    i < currentStepIndex
                      ? "bg-emerald-500"
                      : i === currentStepIndex
                      ? "bg-indigo-500 ring-2 ring-indigo-500/30"
                      : "bg-zinc-800"
                  }`}
                />
                {i < ONBOARDING_STEPS.length - 1 && (
                  <div
                    className={`w-4 h-0.5 ${
                      i < currentStepIndex ? "bg-emerald-500/40" : "bg-zinc-800/60"
                    }`}
                  />
                )}
              </div>
            ))}
            <span className="ml-auto text-[10px] font-mono text-zinc-600">
              {currentStepIndex + 1}/{ONBOARDING_STEPS.length}
            </span>
          </div>

          {/* Step content */}
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <StepIcon className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-zinc-100 leading-tight">
                {step.title}
              </h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
                {step.description}
              </p>
            </div>
          </div>

          {/* Tip box */}
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="text-[10px] text-indigo-300/80 font-medium">
                {step.highlight}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={prevStep}
              disabled={isFirst}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                isFirst
                  ? "text-zinc-700 cursor-not-allowed"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800"
              }`}
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={skipOnboarding}
                className="px-3 py-2 rounded-lg text-[11px] font-medium text-zinc-600 hover:text-zinc-400 transition-all"
              >
                Skip
              </button>

              <button
                onClick={nextStep}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-500/20"
              >
                {isLast ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
