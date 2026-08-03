"use client";

import { useBinderSelection } from "@/components/BinderSelection";

export function BinderSelectModeToggle() {
  const { active, toggleActive } = useBinderSelection();

  return (
    <button
      type="button"
      onClick={toggleActive}
      className={`rounded-full border px-3 py-1.5 font-body text-xs font-medium transition-colors ${
        active
          ? "border-emerald bg-emerald text-paper-raised"
          : "border-line text-ink-muted hover:text-ink"
      }`}
    >
      {active ? "Done" : "Select"}
    </button>
  );
}
