"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DialogShell } from "@/components/DialogShell";
import { MultiItemPicker } from "@/components/trade/MultiItemPicker";
import { MultiSelectBar } from "@/components/trade/MultiSelectBar";
import { getMyCollectionForSale, sellMultipleItems } from "@/app/actions/collection";
import type { SellableItem } from "@/app/actions/collection";
import type { TradeableItem } from "@/app/actions/trades";
import { MARKETPLACES, MARKETPLACE_LABELS, MARKETPLACE_OTHER_MAX_LENGTH, type Marketplace } from "@/lib/marketplace";

type Step = "pick" | "review";

type SellRow = {
  collectionItemId: string;
  name: string;
  imageUrl: string | null;
  maxQuantity: number;
  quantity: string;
  price: string;
  marketPrice: number | null;
  marketplace: Marketplace;
  otherMarketplace: string;
  fees: string;
  shipping: string;
};

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// One editable table for selling multiple items -- pre-filled with full
// quantity and current market price, both editable. Selling at market rate
// is simply "don't touch anything before confirming"; manual pricing is
// "edit the rows that need it." See the plain-language rule -- this is the
// one place in the app that does surface $ amounts, since selling *is* a
// sale (unlike a trade).
export function SellModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [portfolio, setPortfolio] = useState<SellableItem[] | null>(null);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [rows, setRows] = useState<SellRow[]>([]);
  const [defaultMarketplace, setDefaultMarketplace] = useState<Marketplace>("EBAY");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getMyCollectionForSale().then(setPortfolio);
  }, []);

  function toggle(item: TradeableItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.collectionItemId)) next.delete(item.collectionItemId);
      else next.set(item.collectionItemId, item.quantity);
      return next;
    });
  }

  function setQuantity(collectionItemId: string, quantity: number) {
    setSelected((prev) => new Map(prev).set(collectionItemId, quantity));
  }

  function buildRows() {
    if (!portfolio) return;
    const byId = new Map(portfolio.map((item) => [item.collectionItemId, item]));
    setRows(
      Array.from(selected, ([id, qty]) => {
        const item = byId.get(id)!;
        return {
          collectionItemId: id,
          name: item.name,
          imageUrl: item.imageUrl,
          maxQuantity: item.quantity,
          quantity: String(qty),
          price: item.marketPrice != null ? item.marketPrice.toFixed(2) : "",
          marketPrice: item.marketPrice,
          marketplace: defaultMarketplace,
          otherMarketplace: "",
          fees: "",
          shipping: "",
        };
      })
    );
    setStep("review");
  }

  function updateRow(id: string, patch: Partial<SellRow>) {
    setRows((prev) => prev.map((r) => (r.collectionItemId === id ? { ...r, ...patch } : r)));
  }

  function applyMarketplaceToAll(marketplace: Marketplace) {
    setDefaultMarketplace(marketplace);
    // Only rows still sitting at whatever the previous shared default was
    // get updated -- a row someone has deliberately overridden keeps it.
    setRows((prev) => prev.map((r) => (r.marketplace === defaultMarketplace ? { ...r, marketplace } : r)));
  }

  const netTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const qty = Math.max(1, Math.floor(Number(r.quantity)) || 1);
      const price = parseFloat(r.price) || 0;
      const fees = parseFloat(r.fees) || 0;
      const shipping = parseFloat(r.shipping) || 0;
      return sum + price * qty - fees - shipping;
    }, 0);
  }, [rows]);

  function handleSubmit() {
    setError(null);
    const sales = rows.map((r) => {
      const marketplaceValue =
        r.marketplace === "OTHER"
          ? r.otherMarketplace.trim().slice(0, MARKETPLACE_OTHER_MAX_LENGTH) || "Other"
          : MARKETPLACE_LABELS[r.marketplace];
      return {
        collectionItemId: r.collectionItemId,
        quantitySold: Math.max(1, Math.min(Math.floor(Number(r.quantity)) || 1, r.maxQuantity)),
        salePricePerUnit: parseFloat(r.price) || 0,
        feesTotal: r.fees.trim() ? parseFloat(r.fees) : undefined,
        shippingCost: r.shipping.trim() ? parseFloat(r.shipping) : undefined,
        marketplace: marketplaceValue,
      };
    });
    startTransition(async () => {
      const result = await sellMultipleItems(sales);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <DialogShell
      onClose={onClose}
      title={step === "pick" ? "What did you sell?" : "Confirm sale"}
      titleClassName="text-lg"
      maxWidthClassName={step === "review" ? "max-w-2xl" : "max-w-lg"}
      scrollable
    >
      {step === "pick" &&
        (portfolio === null ? (
          <p className="font-body text-sm text-ink-muted">Loading your collection…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <MultiItemPicker items={portfolio} selected={selected} onToggle={toggle} onQuantityChange={setQuantity} />
            <MultiSelectBar count={selected.size} actionLabel="Continue" onAction={buildRows} onClear={() => setSelected(new Map())} />
          </div>
        ))}

      {step === "review" && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setStep("pick")}
            className="self-start font-body text-xs font-medium text-ink-muted hover:text-ink"
          >
            ← Back
          </button>

          <label className="flex items-center gap-2">
            <span className="font-body text-xs font-medium text-ink-muted">Sold on (applies to rows still unset)</span>
            <select
              value={defaultMarketplace}
              onChange={(e) => applyMarketplaceToAll(e.target.value as Marketplace)}
              className="h-8 rounded-full border border-line bg-paper-raised px-3 font-body text-xs text-ink outline-none focus:border-emerald"
            >
              {MARKETPLACES.map((code) => (
                <option key={code} value={code}>
                  {MARKETPLACE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const qty = Math.max(1, Math.floor(Number(r.quantity)) || 1);
              const price = parseFloat(r.price) || 0;
              const fees = parseFloat(r.fees) || 0;
              const shipping = parseFloat(r.shipping) || 0;
              const net = price * qty - fees - shipping;
              return (
                <div key={r.collectionItemId} className="flex flex-col gap-2 rounded-card border border-line bg-paper-raised p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-line/40">
                      {r.imageUrl && <Image src={r.imageUrl} alt={r.name} fill sizes="48px" className="object-contain" />}
                    </div>
                    <p className="min-w-0 flex-1 truncate font-body text-sm font-medium text-ink">{r.name}</p>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    {r.maxQuantity > 1 && (
                      <label className="flex flex-col gap-1">
                        <span className="font-body text-[11px] text-ink-muted">Qty</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max={r.maxQuantity}
                          value={r.quantity}
                          onChange={(e) => updateRow(r.collectionItemId, { quantity: e.target.value })}
                          className="h-8 w-16 rounded-full border border-line bg-paper px-2 font-data text-xs text-ink outline-none focus:border-emerald"
                        />
                      </label>
                    )}
                    <label className="flex flex-col gap-1">
                      <span className="font-body text-[11px] text-ink-muted">Price/unit</span>
                      <div className="flex items-center gap-1">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-data text-xs text-ink-muted">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={r.price}
                            onChange={(e) => updateRow(r.collectionItemId, { price: e.target.value })}
                            className="h-8 w-24 rounded-full border border-line bg-paper pl-5 pr-2 font-data text-xs text-ink outline-none focus:border-emerald"
                          />
                        </div>
                        {r.marketPrice != null && (
                          <button
                            type="button"
                            onClick={() => updateRow(r.collectionItemId, { price: r.marketPrice!.toFixed(2) })}
                            className="rounded-full border border-line px-2 py-1.5 font-body text-[11px] font-medium text-ink-muted hover:text-ink"
                          >
                            Market
                          </button>
                        )}
                      </div>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-body text-[11px] text-ink-muted">Sold on</span>
                      <select
                        value={r.marketplace}
                        onChange={(e) => updateRow(r.collectionItemId, { marketplace: e.target.value as Marketplace })}
                        className="h-8 rounded-full border border-line bg-paper px-2 font-body text-xs text-ink outline-none focus:border-emerald"
                      >
                        {MARKETPLACES.map((code) => (
                          <option key={code} value={code}>
                            {MARKETPLACE_LABELS[code]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {r.marketplace === "OTHER" && (
                      <input
                        type="text"
                        placeholder="Where?"
                        maxLength={MARKETPLACE_OTHER_MAX_LENGTH}
                        value={r.otherMarketplace}
                        onChange={(e) => updateRow(r.collectionItemId, { otherMarketplace: e.target.value })}
                        className="h-8 rounded-full border border-line bg-paper px-2 font-body text-xs text-ink outline-none focus:border-emerald"
                      />
                    )}
                    <label className="flex flex-col gap-1">
                      <span className="font-body text-[11px] text-ink-muted">Fees</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={r.fees}
                        onChange={(e) => updateRow(r.collectionItemId, { fees: e.target.value })}
                        className="h-8 w-20 rounded-full border border-line bg-paper px-2 font-data text-xs text-ink outline-none focus:border-emerald"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-body text-[11px] text-ink-muted">Shipping</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={r.shipping}
                        onChange={(e) => updateRow(r.collectionItemId, { shipping: e.target.value })}
                        className="h-8 w-20 rounded-full border border-line bg-paper px-2 font-data text-xs text-ink outline-none focus:border-emerald"
                      />
                    </label>
                  </div>

                  <p className="font-data text-xs font-medium text-emerald-strong">Net {priceFormatter.format(net)}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <p className="font-body text-sm font-medium text-ink">Total net proceeds</p>
            <p className="font-data text-sm font-semibold text-emerald-strong">{priceFormatter.format(netTotal)}</p>
          </div>

          {error && <p className="font-body text-xs text-amber">{error}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Selling…" : "Confirm"}
          </button>
        </div>
      )}
    </DialogShell>
  );
}
