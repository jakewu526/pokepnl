"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  function navigate(query: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
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
    debounceRef.current = setTimeout(() => navigate(value), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        navigate(value);
      }}
    >
      <label htmlFor="card-search" className="sr-only">
        Search cards by name
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
        fill="none"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M18 18l-4.35-4.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        id="card-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Search cards by name…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 w-full rounded-full border border-line bg-paper-raised pl-11 pr-11 font-body text-[15px] text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-emerald focus-visible:outline-offset-2"
      />
      <span
        aria-hidden="true"
        className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-line border-t-emerald transition-opacity ${
          isPending ? "opacity-100 animate-spin" : "opacity-0"
        }`}
      />
    </form>
  );
}
