"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const DEBOUNCE_MS = 300;

// Filters /transactions by item name. Simpler than the catalog SearchBar
// (no suggestions dropdown) since this only searches the user's own,
// already-small transaction history rather than the full card catalog.
export function TransactionSearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  function navigate(query: string) {
    const trimmed = query.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    params.delete("page");
    params.delete("buyPage");
    params.delete("sellPage");
    startTransition(() => {
      router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(value), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        navigate(value);
      }}
    >
      <label htmlFor="transaction-search" className="sr-only">
        Search transactions by item name
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        fill="none"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M18 18l-4.35-4.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        id="transaction-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Search by item name…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-56 rounded-full border border-line bg-paper-raised pl-9 pr-3 font-body text-sm text-ink outline-none placeholder:text-ink-muted focus:border-emerald"
      />
      <span
        aria-hidden="true"
        className={`absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-line border-t-emerald transition-opacity ${
          isPending ? "animate-spin opacity-100" : "opacity-0"
        }`}
      />
    </form>
  );
}
