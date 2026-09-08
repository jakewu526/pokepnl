"use client";

// Generic "{N} selected" confirm bar, modeled on BinderBatchAddBar's shape
// but kept local to whichever modal renders it (manual trade, propose
// trade, sell) instead of reading a shared context -- these pickers are
// each scoped to one open modal, not the whole page.
export function MultiSelectBar({
  count,
  actionLabel,
  onAction,
  onClear,
  disabled,
}: {
  count: number;
  actionLabel: string;
  onAction: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-full border border-line bg-paper-raised px-4 py-2">
      <span className="font-body text-sm font-medium text-ink">{count} selected</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onClear} className="font-body text-xs font-medium text-ink-muted hover:text-ink">
          Clear
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onAction}
          className="rounded-full bg-emerald px-4 py-1.5 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
