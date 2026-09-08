"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { addToCollection, addSealedToCollection } from "@/app/actions/collection";
import { CONDITIONS, CONDITION_LABELS, type Condition } from "@/lib/condition";
import { MARKETPLACES, MARKETPLACE_LABELS, MARKETPLACE_OTHER_MAX_LENGTH, type Marketplace } from "@/lib/marketplace";
import { ProductSearchPicker, isCardSuggestion, type ProductSuggestion } from "@/components/ProductSearchPicker";
import { SEALED_TYPE_LABELS } from "@/lib/sealed-types";

type Suggestion = ProductSuggestion;

// Combined card+sealed search (unlike the single-mode SearchBar used on
// /cards and /sealed) since this modal isn't scoped to one catalog page --
// ProductSearchPicker fires both suggestion endpoints in parallel and merges
// the results.
export function AddProductModal() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [pending, startTransition] = useTransition();

  const [cost, setCost] = useState("");
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [cardCondition, setCardCondition] = useState<Condition>("NM");
  const [marketplace, setMarketplace] = useState<Marketplace>("POKEMON_CENTER");
  const [otherMarketplace, setOtherMarketplace] = useState("");

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
    setSelected(null);
    setCost("");
    setMarketPrice(null);
    setQuantity("1");
    setCardCondition("NM");
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
        await addSealedToCollection(selected.id, costPerUnit, qty, marketplaceValue);
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
              <ProductSearchPicker onSelect={selectItem} />
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

                {isCardSuggestion(selected) && (
                  <>
                    <label htmlFor="add-product-condition" className="font-body text-xs font-medium text-ink-muted">
                      Condition
                    </label>
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
