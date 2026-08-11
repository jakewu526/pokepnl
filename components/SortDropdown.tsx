"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CardSort } from "@/lib/cards";

const OPTIONS: { key: CardSort; label: string }[] = [
  { key: "default", label: "Alphabetical" },
  { key: "age-desc", label: "Age: Newest first" },
  { key: "age-asc", label: "Age: Oldest first" },
  { key: "price-asc", label: "Price: Low to high" },
  { key: "price-desc", label: "Price: High to low" },
];

export function SortDropdown({ sort }: { sort: CardSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(next: CardSort) {
    setOpen(false);
    if (next === sort) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "default") {
      params.delete("sort");
    } else {
      params.set("sort", next);
    }
    params.delete("page");
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  const activeLabel = OPTIONS.find((o) => o.key === sort)?.label ?? "Default";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-body text-xs font-medium text-ink-muted transition-colors hover:text-ink"
      >
        Sort: {activeLabel}
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-card border border-line bg-paper-raised shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={option.key === sort}
              onClick={() => select(option.key)}
              className={`flex w-full items-center px-3 py-2 text-left font-body text-sm transition-colors ${
                option.key === sort
                  ? "text-emerald-strong font-medium"
                  : "text-ink hover:bg-line/40"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
