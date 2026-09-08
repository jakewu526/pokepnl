"use client";

import { useMemo, useState } from "react";
import { TradeItemTile } from "@/components/trade/TradeItemTile";
import type { TradeableItem } from "@/app/actions/trades";

// Multi-select grid over a caller-supplied list (the user's own collection,
// fetched by the caller via getMyCollectionForTrade/getMyCollectionForSale
// since this can be opened from anywhere via the green button overlay) with
// a name filter at the top. `selected` maps collectionItemId -> chosen
// quantity; a sibling to (replacing) the old single-select GivenItemPicker
// since the callback shape genuinely differs (toggle+quantity map vs.
// single-fire select), not just a mode flag on the same component.
export function MultiItemPicker({
  items,
  selected,
  onToggle,
  onQuantityChange,
}: {
  items: TradeableItem[];
  selected: Map<string, number>;
  onToggle: (item: TradeableItem) => void;
  onQuantityChange: (collectionItemId: string, quantity: number) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  if (items.length === 0) {
    return <p className="font-body text-sm text-ink-muted">Your portfolio is empty — nothing to pick yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="multi-item-search" className="sr-only">
        Search your portfolio
      </label>
      <input
        id="multi-item-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Search your portfolio…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full rounded-full border border-line bg-paper-raised px-4 font-body text-sm text-ink placeholder:text-ink-muted outline-none focus:border-emerald"
      />

      {filtered.length === 0 ? (
        <p className="font-body text-sm text-ink-muted">No matches found.</p>
      ) : (
        <div className="grid max-h-[45vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {filtered.map((item) => {
            const qty = selected.get(item.collectionItemId);
            const isSelected = qty != null;
            return (
              <div key={item.collectionItemId} className="flex flex-col gap-1.5">
                <TradeItemTile item={item} selected={isSelected} onSelect={() => onToggle(item)} />
                {isSelected && item.quantity > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.collectionItemId, Math.max(1, qty! - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-muted hover:text-ink"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-data text-xs text-ink">{qty}</span>
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.collectionItemId, Math.min(item.quantity, qty! + 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-muted hover:text-ink"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
