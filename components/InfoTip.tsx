"use client";

import { useEffect, useId, useRef, useState } from "react";

// Plain-language "how to read this section" affordance (advice-doc step 4) --
// the collector audience knows the hobby, not necessarily finance jargon.
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="What is this section?"
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-ink-muted transition-colors hover:border-emerald hover:text-emerald-strong"
      >
        ⓘ
      </button>
      {open && (
        <div
          id={id}
          ref={popoverRef}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+8px)] z-20 w-64 -translate-x-1/2 rounded-card border border-line bg-paper-raised p-3 text-left shadow-lg"
        >
          <p className="font-body text-xs leading-relaxed text-ink-muted">{text}</p>
        </div>
      )}
    </span>
  );
}
