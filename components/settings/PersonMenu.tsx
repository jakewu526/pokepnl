"use client";

import { useState } from "react";

// The "•••" on each friend / request row. Report and Block live behind it
// rather than as inline buttons so a row stays one line at phone width.
// A transparent full-screen layer under the menu closes it on any outside
// tap, the same way the dialogs close on a backdrop click.
export function PersonMenu({
  displayName,
  disabled,
  onReport,
  onBlock,
}: {
  displayName: string;
  disabled?: boolean;
  onReport: () => void;
  onBlock: () => void;
}) {
  const [open, setOpen] = useState(false);

  function pick(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={`More options for ${displayName}`}
        aria-expanded={open}
        className="-my-1 flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} role="presentation" />
          <div
            role="menu"
            className="absolute right-0 top-10 z-50 flex w-36 flex-col overflow-hidden rounded-card border border-line bg-paper py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onReport)}
              className="min-h-10 px-3 text-left font-body text-sm text-ink transition-colors hover:bg-paper-raised"
            >
              Report
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onBlock)}
              className="min-h-10 px-3 text-left font-body text-sm text-amber transition-colors hover:bg-paper-raised"
            >
              Block
            </button>
          </div>
        </>
      )}
    </div>
  );
}
