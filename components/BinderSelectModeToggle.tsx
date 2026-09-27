"use client";

import { useBinderSelection } from "@/components/BinderSelection";

export function BinderSelectModeToggle() {
  const { active, toggleActive } = useBinderSelection();

  return (
    <button
      type="button"
      onClick={toggleActive}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 font-body text-xs font-medium transition-colors sm:min-h-0 ${
        active
          ? "border-emerald bg-emerald text-paper-raised"
          : "border-line text-ink-muted hover:text-ink"
      }`}
    >
      {active ? "Done" : "Select"}
    </button>
  );
}
