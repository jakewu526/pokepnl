"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CardSuggestion } from "@/lib/cards";

const SUGGEST_DEBOUNCE_MS = 150;

function formatNumber(number: string, setTotal: number | null): string {
  if (!setTotal) return number;
  const padded = number.padStart(String(setTotal).length, "0");
  return `${padded}/${setTotal}`;
}

export function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isFirstRender = useRef(true);

  const dropdownOpen = focused && suggestions.length > 0;

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

  function selectSuggestion(card: CardSuggestion) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    abortRef.current?.abort();
    setSuggestions([]);
    setActiveIndex(-1);
    setFocused(false);
    router.push(`/cards/${card.id}`);
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

  useEffect(() => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    const trimmed = value.trim();
    suggestDebounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      if (!trimmed) {
        setSuggestions([]);
        setActiveIndex(-1);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/card-suggestions?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((data: { suggestions?: CardSuggestion[] }) => {
          setSuggestions(data.suggestions ?? []);
          setActiveIndex(-1);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSuggestions([]);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [value]);

  const activeId =
    activeIndex >= 0 && activeIndex < suggestions.length
      ? `card-suggestion-${suggestions[activeIndex].id}`
      : undefined;

  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setSuggestions([]);
        setActiveIndex(-1);
        navigate(value);
      }}
    >
      <label htmlFor="card-search" className="sr-only">
        Search cards by name, number, set, or type
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
        placeholder="Search by name, number, set, or type…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setActiveIndex(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!dropdownOpen) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
          } else if (e.key === "Escape") {
            setSuggestions([]);
            setActiveIndex(-1);
          }
        }}
        role="combobox"
        aria-expanded={dropdownOpen}
        aria-controls="card-suggestion-list"
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        className="h-12 w-full rounded-full border border-line bg-paper-raised pl-11 pr-11 font-body text-[15px] text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-emerald focus-visible:outline-offset-2"
      />
      <span
        aria-hidden="true"
        className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-line border-t-emerald transition-opacity ${
          isPending ? "opacity-100 animate-spin" : "opacity-0"
        }`}
      />

      {dropdownOpen && (
        <ul
          id="card-suggestion-list"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-96 overflow-y-auto rounded-2xl border border-line bg-paper-raised py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {suggestions.map((card, index) => (
            <li key={card.id} role="option" id={`card-suggestion-${card.id}`} aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(card)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                  index === activeIndex ? "bg-emerald/10" : "hover:bg-emerald/5"
                }`}
              >
                <div className="relative h-10 w-[29px] shrink-0 overflow-hidden rounded-[4px] bg-line/40">
                  {card.imageUrl && (
                    <Image src={card.imageUrl} alt="" fill sizes="29px" className="object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-[14px] font-medium text-ink">{card.name}</p>
                  <p className="truncate font-body text-[12px] text-ink-muted">
                    {card.setName} ·{" "}
                    <span className="font-data">{formatNumber(card.number, card.setTotal)}</span>
                    {card.rarity && <> · {card.rarity}</>}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
