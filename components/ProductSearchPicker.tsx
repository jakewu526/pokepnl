"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CardSuggestion } from "@/lib/cards";
import { SEALED_TYPE_LABELS, type SealedProductSuggestion } from "@/lib/sealed-types";

const SUGGEST_DEBOUNCE_MS = 150;

export type ProductSuggestion = (CardSuggestion & { kind: "card" }) | (SealedProductSuggestion & { kind: "sealed" });
type SearchScope = "all" | "cards" | "sealed";

const SCOPE_OPTIONS: { key: SearchScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cards", label: "Cards" },
  { key: "sealed", label: "Sealed" },
];

export function isCardSuggestion(s: ProductSuggestion): s is CardSuggestion & { kind: "card" } {
  return s.kind === "card";
}

function formatNumber(number: string, setTotal: number | null): string {
  if (!setTotal) return number;
  const padded = number.padStart(String(setTotal).length, "0");
  return `${padded}/${setTotal}`;
}

// Combined card+sealed search-and-select block, extracted from
// AddProductModal so it can also drive the manual-trade "what did you get in
// return" step without duplicating the debounce/fetch logic. Callers own
// what happens after a pick (`onSelect`) and any state beyond the search
// itself -- this component only manages the query/scope/suggestions.
export function ProductSearchPicker({
  onSelect,
  autoFocus = true,
}: {
  onSelect: (item: ProductSuggestion) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      if (!trimmed) {
        setSuggestions([]);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const wantCards = scope !== "sealed";
      const wantSealed = scope !== "cards";
      Promise.all([
        wantCards
          ? fetch(`/api/card-suggestions?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
              .then((res) => (res.ok ? res.json() : { suggestions: [] }))
              .then((data: { suggestions?: CardSuggestion[] }) =>
                (data.suggestions ?? []).map((s) => ({ ...s, kind: "card" as const }))
              )
          : Promise.resolve([]),
        wantSealed
          ? fetch(`/api/sealed-suggestions?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
              .then((res) => (res.ok ? res.json() : { suggestions: [] }))
              .then((data: { suggestions?: SealedProductSuggestion[] }) =>
                (data.suggestions ?? []).map((s) => ({ ...s, kind: "sealed" as const }))
              )
          : Promise.resolve([]),
      ])
        .then(([cards, sealed]) => setSuggestions([...cards, ...sealed]))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSuggestions([]);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, scope]);

  return (
    <div className="relative">
      <div
        role="group"
        aria-label="Search scope"
        className="mb-3 flex items-center gap-1 rounded-full border border-line bg-paper-raised p-1"
      >
        {SCOPE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setScope(opt.key)}
            aria-pressed={scope === opt.key}
            className={`flex-1 rounded-full px-3 py-1.5 font-body text-sm font-medium transition ${
              scope === opt.key ? "bg-emerald text-paper-raised" : "text-ink-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label htmlFor="product-search-picker" className="sr-only">
        Search for a card or sealed product
      </label>
      <input
        id="product-search-picker"
        type="search"
        inputMode="search"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Search by name, set, or number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full rounded-full border border-line bg-paper-raised px-4 font-body text-sm text-ink placeholder:text-ink-muted outline-none focus:border-emerald"
      />

      {suggestions.length > 0 && (
        <ul className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-line bg-paper-raised py-1.5">
          {suggestions.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-emerald/5"
              >
                <div className="relative h-10 w-[29px] shrink-0 overflow-hidden rounded-[4px] bg-line/40">
                  {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="29px" className="object-contain" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-[14px] font-medium text-ink">{item.name}</p>
                  {isCardSuggestion(item) ? (
                    <p className="truncate font-body text-[12px] text-ink-muted">
                      {item.setName} · <span className="font-data">{formatNumber(item.number, item.setTotal)}</span>
                      {item.rarity && <> · {item.rarity}</>}
                    </p>
                  ) : (
                    <p className="truncate font-body text-[12px] text-ink-muted">
                      {item.setName && <>{item.setName} · </>}
                      {SEALED_TYPE_LABELS[item.type]}
                      {item.language !== "EN" && <> · {item.language}</>}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim() && suggestions.length === 0 && <p className="mt-3 font-body text-sm text-ink-muted">No matches found.</p>}
    </div>
  );
}
