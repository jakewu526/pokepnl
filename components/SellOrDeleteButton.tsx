"use client";

import Image from "next/image";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { deletePosition, sellCollectionItem } from "@/app/actions/collection";
import { MARKETPLACES, MARKETPLACE_LABELS, MARKETPLACE_OTHER_MAX_LENGTH, type Marketplace } from "@/lib/marketplace";

// Kept at module scope (not nested in SellOrDeleteButton) so its identity is
// stable across renders -- a component defined inside another component's
// body gets redefined every render, which makes React remount it (and drop
// input focus) on every keystroke in the sell form below.
function DialogShell({
  open,
  onClose,
  title,
  itemName,
  imageUrl,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  itemName: string;
  imageUrl: string | null;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-card border border-line bg-paper p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-line/40">
              {imageUrl && <Image src={imageUrl} alt={itemName} fill sizes="48px" className="object-contain" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
              <p className="truncate font-body text-xs text-ink-muted">{itemName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 font-body text-xs font-medium text-ink-muted transition-colors hover:bg-paper-raised"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Both Sell and Delete open as real dialogs -- same fixed-inset shell as
// PositionActivityModal/DayActivityModal -- rather than expanding inline in
// the table row, since Delete is irreversible and Sell needs several fields.
export function SellOrDeleteButton({
  collectionItemId,
  itemName,
  imageUrl,
  quantity,
  marketPrice,
}: {
  collectionItemId: string;
  itemName: string;
  imageUrl: string | null;
  quantity: number;
  marketPrice: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [qtySold, setQtySold] = useState(String(quantity));
  const [salePrice, setSalePrice] = useState("");
  const [fees, setFees] = useState("");
  const [shipping, setShipping] = useState("");
  const [marketplace, setMarketplace] = useState<Marketplace>("EBAY");
  const [otherMarketplace, setOtherMarketplace] = useState("");

  useEffect(() => {
    if (!sellOpen && !deleteOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSellOpen(false);
      setDeleteOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sellOpen, deleteOpen]);

  function openSell() {
    setQtySold(String(quantity));
    setSalePrice("");
    setFees("");
    setShipping("");
    setMarketplace("EBAY");
    setOtherMarketplace("");
    setSellOpen(true);
  }

  const qty = Math.max(1, Math.min(Math.floor(Number(qtySold)) || 1, quantity));
  const parsedPrice = parseFloat(salePrice);
  const parsedFees = parseFloat(fees);
  const parsedShipping = parseFloat(shipping);
  const feesValue = Number.isFinite(parsedFees) && parsedFees >= 0 ? parsedFees : 0;
  const shippingValue = Number.isFinite(parsedShipping) && parsedShipping >= 0 ? parsedShipping : 0;
  const netProceeds =
    Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice * qty - feesValue - shippingValue : null;

  function handleConfirm() {
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return;
    const marketplaceValue =
      marketplace === "OTHER"
        ? otherMarketplace.trim().slice(0, MARKETPLACE_OTHER_MAX_LENGTH) || "Other"
        : MARKETPLACE_LABELS[marketplace];
    startTransition(async () => {
      await sellCollectionItem(
        collectionItemId,
        qty,
        parsedPrice,
        fees.trim() ? feesValue : undefined,
        shipping.trim() ? shippingValue : undefined,
        marketplaceValue
      );
      setSellOpen(false);
    });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openSell}
          className="font-body text-xs font-medium text-emerald-strong hover:underline"
        >
          Sell
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="font-body text-xs font-medium text-ink-muted hover:text-amber"
        >
          Delete
        </button>
      </div>

      <DialogShell
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete"
        itemName={itemName}
        imageUrl={imageUrl}
      >
        <div className="flex flex-col gap-3">
          <p className="font-body text-sm text-ink-muted">
            This permanently deletes this position and its full purchase/sale history. This can&apos;t be undone.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => deletePosition(collectionItemId))}
              className="font-body text-xs font-medium text-amber hover:underline disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="font-body text-xs font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogShell>

      <DialogShell
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        title="Sell"
        itemName={itemName}
        imageUrl={imageUrl}
      >
        <div className="flex flex-col gap-3">
          {quantity > 1 && (
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-ink-muted">Quantity sold</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={quantity}
                value={qtySold}
                onChange={(e) => setQtySold(e.target.value)}
                className="h-9 rounded-full border border-line bg-paper-raised px-3 font-data text-sm text-ink outline-none focus:border-emerald"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink-muted">Sale price per unit</span>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-ink-muted">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="h-9 w-full rounded-full border border-line bg-paper-raised pl-6 pr-3 font-data text-sm text-ink outline-none focus:border-emerald"
                />
              </div>
              {marketPrice != null && (
                <button
                  type="button"
                  onClick={() => setSalePrice(marketPrice.toFixed(2))}
                  className="rounded-full border border-line px-2.5 py-2 font-body text-xs font-medium text-ink-muted hover:text-ink"
                >
                  Market
                </button>
              )}
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink-muted">Sold on</span>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as Marketplace)}
              className="h-9 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
            >
              {MARKETPLACES.map((code) => (
                <option key={code} value={code}>
                  {MARKETPLACE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          {marketplace === "OTHER" && (
            <input
              type="text"
              placeholder="Where did you sell it?"
              maxLength={MARKETPLACE_OTHER_MAX_LENGTH}
              value={otherMarketplace}
              onChange={(e) => setOtherMarketplace(e.target.value)}
              className="h-9 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
            />
          )}

          <div className="flex items-center gap-1.5">
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-body text-xs text-ink-muted">Fees</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-ink-muted">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  className="h-9 w-full rounded-full border border-line bg-paper-raised pl-6 pr-3 font-data text-sm text-ink outline-none focus:border-emerald"
                />
              </div>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-body text-xs text-ink-muted">Shipping</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-ink-muted">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  className="h-9 w-full rounded-full border border-line bg-paper-raised pl-6 pr-3 font-data text-sm text-ink outline-none focus:border-emerald"
                />
              </div>
            </label>
          </div>

          {netProceeds != null && (
            <p className="font-data text-xs text-ink-muted">
              Net proceeds: <span className="font-medium text-ink">${netProceeds.toFixed(2)}</span>
            </p>
          )}

          <div className="mt-1 flex items-center gap-3">
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
              onClick={() => setSellOpen(false)}
              className="font-body text-xs font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogShell>
    </>
  );
}
