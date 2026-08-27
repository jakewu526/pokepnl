"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { addToCollection, addSealedToCollection } from "@/app/actions/collection";
import { CONDITIONS, CONDITION_LABELS, type Condition } from "@/lib/condition";
import {
  SEALED_CONDITIONS,
  SEALED_CONDITION_LABELS,
  SEALED_CONDITION_OTHER_MAX_LENGTH,
  type SealedCondition,
} from "@/lib/sealed-condition";
import { MARKETPLACES, MARKETPLACE_LABELS, MARKETPLACE_OTHER_MAX_LENGTH, type Marketplace } from "@/lib/marketplace";
import type { CardSuggestion } from "@/lib/cards";
import { SEALED_TYPE_LABELS, type SealedProductSuggestion } from "@/lib/sealed-types";

const SUGGEST_DEBOUNCE_MS = 150;

type Suggestion = (CardSuggestion & { kind: "card" }) | (SealedProductSuggestion & { kind: "sealed" });
type SearchScope = "all" | "cards" | "sealed";

const SCOPE_OPTIONS: { key: SearchScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cards", label: "Cards" },
  { key: "sealed", label: "Sealed" },
];

function isCardSuggestion(s: Suggestion): s is CardSuggestion & { kind: "card" } {
  return s.kind === "card";
}

function formatNumber(number: string, setTotal: number | null): string {
  if (!setTotal) return number;
  const padded = number.padStart(String(setTotal).length, "0");
  return `${padded}/${setTotal}`;
}

// Combined card+sealed search (unlike the single-mode SearchBar used on
// /cards and /sealed) since this modal isn't scoped to one catalog page --
// fires both suggestion endpoints in parallel and merges the results.
export function AddProductModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [pending, startTransition] = useTransition();

  const [cost, setCost] = useState("");
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [cardCondition, setCardCondition] = useState<Condition>("NM");
  const [sealedCondition, setSealedCondition] = useState<SealedCondition>("MINT");
  const [otherDescription, setOtherDescription] = useState("");
  const [marketplace, setMarketplace] = useState<Marketplace>("POKEMON_CENTER");
  const [otherMarketplace, setOtherMarketplace] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const endpoint = isCardSuggestion(selected)
      ? `/api/product-price?cardId=${encodeURIComponent(selected.id)}`
      : `/api/product-price?sealedProductId=${encodeURIComponent(selected.id)}`;
    fetch(endpoint, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { price: null }))
      .then((data: { price?: number | null }) => setMarketPrice(data.price ?? null))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMarketPrice(null);
      });
    return () => controller.abort();
  }, [selected]);

  function reset() {
    setQuery("");
    setScope("all");
    setSuggestions([]);
    setSelected(null);
    setCost("");
    setMarketPrice(null);
    setQuantity("1");
    setCardCondition("NM");
    setSealedCondition("MINT");
    setOtherDescription("");
    setMarketplace("POKEMON_CENTER");
    setOtherMarketplace("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  function selectItem(item: Suggestion | null) {
    setSelected(item);
    setCost("");
    setMarketPrice(null);
  }

  function handleAdd() {
    if (!selected) return;
    const parsed = parseFloat(cost);
    const costPerUnit = Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    const parsedQty = parseInt(quantity, 10);
    const qty = Number.isFinite(parsedQty) && parsedQty >= 1 ? parsedQty : 1;
    const marketplaceValue =
      marketplace === "OTHER"
        ? otherMarketplace.trim().slice(0, MARKETPLACE_OTHER_MAX_LENGTH) || "Other"
        : MARKETPLACE_LABELS[marketplace];

    startTransition(async () => {
      if (isCardSuggestion(selected)) {
        await addToCollection(selected.id, cardCondition, costPerUnit, qty, marketplaceValue);
      } else {
        const conditionValue =
          sealedCondition === "OTHER"
            ? otherDescription.trim().slice(0, SEALED_CONDITION_OTHER_MAX_LENGTH) || "Other"
            : SEALED_CONDITION_LABELS[sealedCondition];
        await addSealedToCollection(selected.id, conditionValue, costPerUnit, qty, marketplaceValue);
      }
      close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90"
      >
        Add Product
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
          role="presentation"
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-card border border-line bg-paper p-5 shadow-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Add Product</h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-full border border-line px-2.5 py-1 font-body text-xs font-medium text-ink-muted transition-colors hover:bg-paper-raised"
              >
                Close
              </button>
            </div>

            {!selected ? (
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

                <label htmlFor="add-product-search" className="sr-only">
                  Search for a card or sealed product
                </label>
                <input
                  id="add-product-search"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  autoFocus
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
                          onClick={() => selectItem(item)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-emerald/5"
                        >
                          <div className="relative h-10 w-[29px] shrink-0 overflow-hidden rounded-[4px] bg-line/40">
                            {item.imageUrl && (
                              <Image src={item.imageUrl} alt="" fill sizes="29px" className="object-contain" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-body text-[14px] font-medium text-ink">{item.name}</p>
                            {isCardSuggestion(item) ? (
                              <p className="truncate font-body text-[12px] text-ink-muted">
                                {item.setName} ·{" "}
                                <span className="font-data">{formatNumber(item.number, item.setTotal)}</span>
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

                {query.trim() && suggestions.length === 0 && (
                  <p className="mt-3 font-body text-sm text-ink-muted">No matches found.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-card border border-line bg-paper-raised p-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-line/40">
                    {selected.imageUrl && (
                      <Image src={selected.imageUrl} alt="" fill sizes="48px" className="object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm font-medium text-ink">{selected.name}</p>
                    <p className="truncate font-body text-xs text-ink-muted">
                      {isCardSuggestion(selected)
                        ? selected.setName
                        : selected.setName ?? SEALED_TYPE_LABELS[selected.type]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectItem(null)}
                    className="shrink-0 font-body text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    Change
                  </button>
                </div>

                <label htmlFor="add-product-cost" className="font-body text-xs font-medium text-ink-muted">
                  Cost paid
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-ink-muted">
                      $
                    </span>
                    <input
                      id="add-product-cost"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      autoFocus
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      className="h-10 w-full rounded-full border border-line bg-paper-raised pl-6 pr-3 font-data text-sm text-ink outline-none focus:border-emerald"
                    />
                  </div>
                  {marketPrice != null && (
                    <button
                      type="button"
                      onClick={() => setCost(marketPrice.toFixed(2))}
                      className="shrink-0 rounded-full border border-line px-3 py-2 font-body text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      Market
                    </button>
                  )}
                </div>

                <label htmlFor="add-product-condition" className="font-body text-xs font-medium text-ink-muted">
                  Condition
                </label>
                {isCardSuggestion(selected) ? (
                  <select
                    id="add-product-condition"
                    value={cardCondition}
                    onChange={(e) => setCardCondition(e.target.value as Condition)}
                    className="h-10 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
                  >
                    {CONDITIONS.map((code) => (
                      <option key={code} value={code}>
                        {CONDITION_LABELS[code]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <select
                      id="add-product-condition"
                      value={sealedCondition}
                      onChange={(e) => setSealedCondition(e.target.value as SealedCondition)}
                      className="h-10 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
                    >
                      {SEALED_CONDITIONS.map((code) => (
                        <option key={code} value={code}>
                          {SEALED_CONDITION_LABELS[code]}
                        </option>
                      ))}
                    </select>
                    {sealedCondition === "OTHER" && (
                      <input
                        type="text"
                        placeholder="Describe the condition"
                        maxLength={SEALED_CONDITION_OTHER_MAX_LENGTH}
                        value={otherDescription}
                        onChange={(e) => setOtherDescription(e.target.value)}
                        className="h-10 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
                      />
                    )}
                  </>
                )}

                <label htmlFor="add-product-marketplace" className="font-body text-xs font-medium text-ink-muted">
                  Bought from
                </label>
                <select
                  id="add-product-marketplace"
                  value={marketplace}
                  onChange={(e) => setMarketplace(e.target.value as Marketplace)}
                  className="h-10 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
                >
                  {MARKETPLACES.map((code) => (
                    <option key={code} value={code}>
                      {MARKETPLACE_LABELS[code]}
                    </option>
                  ))}
                </select>
                {marketplace === "OTHER" && (
                  <input
                    type="text"
                    placeholder="Where did you buy it?"
                    maxLength={MARKETPLACE_OTHER_MAX_LENGTH}
                    value={otherMarketplace}
                    onChange={(e) => setOtherMarketplace(e.target.value)}
                    className="h-10 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
                  />
                )}

                <label htmlFor="add-product-quantity" className="font-body text-xs font-medium text-ink-muted">
                  Quantity
                </label>
                <input
                  id="add-product-quantity"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-10 w-24 rounded-full border border-line bg-paper-raised px-3 font-data text-sm text-ink outline-none focus:border-emerald"
                />

                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={handleAdd}
                    className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {pending ? "Adding…" : "Add to portfolio"}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectItem(null)}
                    className="font-body text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
