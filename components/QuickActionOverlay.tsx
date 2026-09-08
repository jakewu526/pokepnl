"use client";

import { useEffect, useState } from "react";
import { ManualTradeModal } from "@/components/trade/ManualTradeModal";
import { ProposeTradeModal } from "@/components/trade/ProposeTradeModal";
import { SellModal } from "@/components/trade/SellModal";

type Step = "root" | "trade-choice";

function CircleButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-full bg-emerald text-paper-raised shadow-lg transition-transform active:scale-95"
    >
      <span className="font-body text-base font-semibold">{label}</span>
    </button>
  );
}

// Full-screen dim opened by the green button (MobileTabBar's center action).
// Root step offers Trade/Sell; Trade reveals the two trade paths; Sell opens
// SellModal directly. Every DialogShell-based child modal (ManualTradeModal/
// ProposeTradeModal/SellModal) already has its own X that bubbles up to this
// component's onClose (full exit) -- the exit button below only needs to
// cover this component's own bare root/trade-choice screens, which have no
// close affordance of their own otherwise.
export function QuickActionOverlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("root");
  const [manualOpen, setManualOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (manualOpen) {
    return (
      <ManualTradeModal
        onClose={() => {
          setManualOpen(false);
          onClose();
        }}
      />
    );
  }
  if (proposeOpen) {
    return (
      <ProposeTradeModal
        onClose={() => {
          setProposeOpen(false);
          onClose();
        }}
      />
    );
  }
  if (sellOpen) {
    return (
      <SellModal
        onClose={() => {
          setSellOpen(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/70" onClick={onClose} role="presentation">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-4 top-24 z-[70] flex size-9 items-center justify-center rounded-full border border-paper-raised/40 text-paper-raised transition-colors hover:bg-paper-raised/10"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="flex h-full items-center justify-center px-6" onClick={(e) => e.stopPropagation()}>
        {step === "root" ? (
          <div className="flex items-center gap-8">
            <CircleButton label="Trade" onClick={() => setStep("trade-choice")} />
            <CircleButton label="Sell" onClick={() => setSellOpen(true)} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => setStep("root")}
              className="self-start font-body text-xs font-medium text-paper-raised/80 hover:text-paper-raised"
            >
              ← Back
            </button>
            <div className="flex items-center gap-8">
              <CircleButton label="With a friend" onClick={() => setProposeOpen(true)} />
              <CircleButton label="Manual log" onClick={() => setManualOpen(true)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
