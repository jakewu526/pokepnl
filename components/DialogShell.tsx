"use client";

import Image from "next/image";
import { useEffect, type ReactNode } from "react";

// Shared fixed-inset dialog chrome for every modal in the app -- previously
// SellOrDeleteButton.tsx defined its own module-scoped `DialogShell` and
// PositionActivityModal/DayActivityModal each hand-copied the same
// `fixed inset-0 ...` markup with a "Close" text pill instead of an icon
// button. One shared shell means the close affordance (now an X button,
// part of the mobile batch) only has to change in one place.
//
// No `open` prop -- callers decide whether to render this at all (most
// already gate with `if (!x) return null` before reaching here), so there's
// nothing extra to plumb through for the callers that don't need it.
export function DialogShell({
  onClose,
  title,
  titleClassName = "text-xl",
  subtitle,
  imageUrl,
  maxWidthClassName = "max-w-sm",
  scrollable = false,
  children,
}: {
  onClose: () => void;
  title: string;
  titleClassName?: string;
  /** Small line under the title -- only SellOrDeleteButton's dialogs (title
      "Sell"/"Delete", subtitle the actual item name) use this. */
  subtitle?: string;
  /** Thumbnail beside the title -- only SellOrDeleteButton's dialogs use this;
      omit entirely (not just null) to skip the thumbnail box. */
  imageUrl?: string | null;
  maxWidthClassName?: string;
  scrollable?: boolean;
  children: ReactNode;
}) {
  // Each caller used to duplicate this same Escape-to-close listener --
  // moving it here means a new dialog (ItemInfoModal) gets it for free, and
  // there's exactly one place left that decides what closes a dialog.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${maxWidthClassName} rounded-card border border-line bg-paper p-5 shadow-lg sm:p-6 ${
          scrollable ? "max-h-[85vh] overflow-y-auto" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {imageUrl !== undefined && (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-line/40">
                {imageUrl && <Image src={imageUrl} alt={title} fill sizes="48px" className="object-contain" />}
              </div>
            )}
            <div className="min-w-0">
              <h2 className={`truncate font-display font-semibold tracking-tight text-ink ${titleClassName}`}>
                {title}
              </h2>
              {subtitle && <p className="truncate font-body text-xs text-ink-muted">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
