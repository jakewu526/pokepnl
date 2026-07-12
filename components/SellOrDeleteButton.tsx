"use client";

import { useState, useTransition } from "react";
import { removeFromCollection, sellCollectionItem } from "@/app/actions/collection";

export function SellOrDeleteButton({
  collectionItemId,
  quantity,
  marketPrice,
}: {
  collectionItemId: string;
  quantity: number;
  marketPrice: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [selling, setSelling] = useState(false);
  const [qtySold, setQtySold] = useState(String(quantity));
  const [salePrice, setSalePrice] = useState("");

  if (!selling) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSelling(true)}
          className="font-body text-xs font-medium text-emerald-strong hover:underline"
        >
          Sell
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => removeFromCollection(collectionItemId))}
          className="font-body text-xs font-medium text-ink-muted hover:text-amber disabled:opacity-60"
        >
          {pending ? "Removing…" : quantity > 1 ? "Delete 1" : "Delete"}
        </button>
      </div>
    );
  }

  function handleConfirm() {
    const qty = Math.max(1, Math.min(Math.floor(Number(qtySold)) || 1, quantity));
    const price = parseFloat(salePrice);
    if (!Number.isFinite(price) || price < 0) return;
    startTransition(async () => {
      await sellCollectionItem(collectionItemId, qty, price);
      setSelling(false);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {quantity > 1 && (
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={quantity}
            value={qtySold}
            onChange={(e) => setQtySold(e.target.value)}
            aria-label="Quantity sold"
            className="h-8 w-14 rounded-full border border-line bg-paper-raised px-2 font-data text-xs text-ink outline-none focus:border-emerald"
          />
        )}
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-data text-xs text-ink-muted">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="Sale price"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            aria-label="Sale price per unit"
            className="h-8 w-24 rounded-full border border-line bg-paper-raised pl-5 pr-2 font-data text-xs text-ink outline-none focus:border-emerald"
          />
        </div>
        {marketPrice != null && (
          <button
            type="button"
            onClick={() => setSalePrice(marketPrice.toFixed(2))}
            className="rounded-full border border-line px-2 py-1.5 font-body text-[11px] font-medium text-ink-muted hover:text-ink"
          >
            Market
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={handleConfirm}
          className="font-body text-xs font-medium text-emerald-strong hover:underline disabled:opacity-60"
        >
          {pending ? "Selling…" : "Confirm sale"}
        </button>
        <button
          type="button"
          onClick={() => setSelling(false)}
          className="font-body text-xs font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
