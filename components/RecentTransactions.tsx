"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import type { TransactionListItem, PurchaseListItem } from "@/lib/pnl";
import { CONDITION_LABELS, type Condition } from "@/lib/condition";
import { updatePurchaseLot, updateTransaction } from "@/app/actions/collection";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function itemHref(itemType: "card" | "sealed", itemId: string | null): string | null {
  if (!itemId) return null;
  return itemType === "card" ? `/cards/${itemId}` : `/sealed/${itemId}`;
}

// Blur-to-save numeric cell shared by BuyTable/SellTable's editable rows --
// same local-draft + useTransition + commit-on-blur pattern as
// PortfolioTableRow's inline edits. Reverts to the last known value and shows
// the server's message inline on a rejected edit (no toast system in this
// codebase) rather than throwing.
function EditableAmountCell({
  value,
  kind,
  onCommit,
}: {
  value: number;
  kind: "quantity" | "currency";
  onCommit: (next: number) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState(kind === "quantity" ? String(value) : value.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    const parsed = kind === "quantity" ? Math.floor(Number(draft)) : parseFloat(draft);
    const min = kind === "quantity" ? 1 : 0;
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(kind === "quantity" ? String(value) : value.toFixed(2));
      return;
    }
    if (parsed === value) return;
    startTransition(async () => {
      const result = await onCommit(parsed);
      if (result.error) {
        setError(result.error);
        setDraft(kind === "quantity" ? String(value) : value.toFixed(2));
      } else {
        setError(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative w-20">
        {kind === "currency" && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-data text-xs text-ink-muted">
            $
          </span>
        )}
        <input
          type="number"
          inputMode={kind === "quantity" ? "numeric" : "decimal"}
          step={kind === "quantity" ? "1" : "0.01"}
          min={kind === "quantity" ? "1" : "0"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          disabled={pending}
          aria-label={kind === "quantity" ? "Quantity" : "Price"}
          className={`h-7 w-full rounded-full border border-line bg-paper font-data text-xs text-ink outline-none focus:border-emerald disabled:opacity-60 ${
            kind === "currency" ? "pl-5 pr-2" : "px-2"
          }`}
        />
      </div>
      {error && <p className="font-body text-[10px] text-amber">{error}</p>}
    </div>
  );
}

// Same blur-to-save pattern as EditableAmountCell, but for the date column --
// a plain <input type="date"> instead of a number input.
function EditableDateCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    if (!draft || draft === value) {
      setDraft(value);
      return;
    }
    startTransition(async () => {
      const result = await onCommit(draft);
      if (result.error) {
        setError(result.error);
        setDraft(value);
      } else {
        setError(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        disabled={pending}
        aria-label="Date"
        className="h-7 w-36 rounded-full border border-line bg-paper px-2 font-data text-xs text-ink outline-none focus:border-emerald disabled:opacity-60"
      />
      {error && <p className="font-body text-[10px] text-amber">{error}</p>}
    </div>
  );
}

function RowThumb({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
      {imageUrl && <Image src={imageUrl} alt={name} fill sizes="40px" className="object-contain" />}
    </div>
  );
}

// Sales -- what we've always shown. Extracted from the page-level component
// so a day's modal (DayActivityModal) can render the exact same table for a
// single filtered day instead of duplicating the markup.
export function SellTable({
  transactions,
  editable = false,
}: {
  transactions: TransactionListItem[];
  editable?: boolean;
}) {
  if (transactions.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-paper-raised">
      <table className="w-full min-w-[640px] text-left font-body text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Cost</th>
            <th className="px-3 py-2 font-medium">Sold for</th>
            <th className="px-3 py-2 font-medium">Net profit</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const itemLabel = (
              <>
                {tx.itemName}
                {tx.condition && (
                  <span className="text-ink-muted"> · {CONDITION_LABELS[tx.condition as Condition] ?? tx.condition}</span>
                )}
              </>
            );
            const href = itemHref(tx.itemType, tx.itemId);

            return (
              <tr key={tx.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">
                  {editable ? (
                    <EditableDateCell
                      value={tx.soldAt}
                      onCommit={(next) => updateTransaction(tx.id, { soldAt: next })}
                    />
                  ) : (
                    tx.soldAt
                  )}
                </td>
                <td className="px-3 py-2 text-ink">
                  <div className="flex items-center gap-2">
                    <RowThumb imageUrl={tx.imageUrl} name={tx.itemName} />
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {itemLabel}
                      </Link>
                    ) : (
                      <span>{itemLabel}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {editable ? (
                    <EditableAmountCell
                      value={tx.quantity}
                      kind="quantity"
                      onCommit={(next) => updateTransaction(tx.id, { quantity: next })}
                    />
                  ) : (
                    tx.quantity
                  )}
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {tx.costPerUnit != null ? priceFormatter.format(tx.costPerUnit) : "—"}
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {editable ? (
                    <EditableAmountCell
                      value={tx.salePricePerUnit}
                      kind="currency"
                      onCommit={(next) => updateTransaction(tx.id, { salePricePerUnit: next })}
                    />
                  ) : (
                    priceFormatter.format(tx.salePricePerUnit)
                  )}
                </td>
                <td
                  className={`px-3 py-2 font-data font-medium ${
                    tx.profit == null ? "text-ink-muted" : tx.profit < 0 ? "text-amber" : "text-emerald-strong"
                  }`}
                >
                  {tx.profit != null ? signedPrice(tx.profit) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Purchases -- the new table. Reads the same costPerUnit/createdAt every
// add-to-collection already writes, so there's nothing new to enter.
export function BuyTable({
  purchases,
  editable = false,
}: {
  purchases: PurchaseListItem[];
  editable?: boolean;
}) {
  if (purchases.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-paper-raised">
      <table className="w-full min-w-[420px] text-left font-body text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Paid</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => {
            const itemLabel = (
              <>
                {p.itemName}
                {p.condition && (
                  <span className="text-ink-muted"> · {CONDITION_LABELS[p.condition as Condition] ?? p.condition}</span>
                )}
              </>
            );
            const href = itemHref(p.itemType, p.itemId);

            return (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">
                  {editable ? (
                    <EditableDateCell
                      value={p.purchasedAt}
                      onCommit={(next) => updatePurchaseLot(p.id, { purchasedAt: next })}
                    />
                  ) : (
                    p.purchasedAt
                  )}
                </td>
                <td className="px-3 py-2 text-ink">
                  <div className="flex items-center gap-2">
                    <RowThumb imageUrl={p.imageUrl} name={p.itemName} />
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {itemLabel}
                      </Link>
                    ) : (
                      <span>{itemLabel}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {editable ? (
                    <EditableAmountCell
                      value={p.quantity}
                      kind="quantity"
                      onCommit={(next) => updatePurchaseLot(p.id, { quantity: next })}
                    />
                  ) : (
                    p.quantity
                  )}
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {editable ? (
                    <EditableAmountCell
                      value={p.costPerUnit ?? 0}
                      kind="currency"
                      onCommit={(next) => updatePurchaseLot(p.id, { costPerUnit: next })}
                    />
                  ) : p.costPerUnit != null ? (
                    priceFormatter.format(p.costPerUnit)
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type MergedRow =
  | { kind: "buy"; date: string; row: PurchaseListItem }
  | { kind: "sell"; date: string; row: TransactionListItem };

// Combined view for /transactions's "Merged" toggle. Each row routes its
// edits to updatePurchaseLot or updateTransaction depending on `kind`, since
// buys and sells are still backed by different tables/actions under the hood.
export function MergedTable({ rows, editable = false }: { rows: MergedRow[]; editable?: boolean }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-paper-raised">
      <table className="w-full min-w-[640px] text-left font-body text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Net profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const item = r.row;
            const itemLabel = (
              <>
                {item.itemName}
                {item.condition && (
                  <span className="text-ink-muted"> · {CONDITION_LABELS[item.condition as Condition] ?? item.condition}</span>
                )}
              </>
            );
            const href = itemHref(item.itemType, item.itemId);
            const price = r.kind === "buy" ? r.row.costPerUnit : r.row.salePricePerUnit;
            const profit = r.kind === "sell" ? r.row.profit : null;

            return (
              <tr key={`${r.kind}-${item.id}`} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">
                  {editable ? (
                    <EditableDateCell
                      value={r.date}
                      onCommit={(next) =>
                        r.kind === "buy"
                          ? updatePurchaseLot(item.id, { purchasedAt: next })
                          : updateTransaction(item.id, { soldAt: next })
                      }
                    />
                  ) : (
                    r.date
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-body text-[11px] font-medium ${
                      r.kind === "buy" ? "bg-emerald/10 text-emerald-strong" : "bg-amber-tint text-amber"
                    }`}
                  >
                    {r.kind === "buy" ? "Buy" : "Sell"}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink">
                  <div className="flex items-center gap-2">
                    <RowThumb imageUrl={item.imageUrl} name={item.itemName} />
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {itemLabel}
                      </Link>
                    ) : (
                      <span>{itemLabel}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {editable ? (
                    <EditableAmountCell
                      value={item.quantity}
                      kind="quantity"
                      onCommit={(next) =>
                        r.kind === "buy"
                          ? updatePurchaseLot(item.id, { quantity: next })
                          : updateTransaction(item.id, { quantity: next })
                      }
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {editable ? (
                    <EditableAmountCell
                      value={price ?? 0}
                      kind="currency"
                      onCommit={(next) =>
                        r.kind === "buy"
                          ? updatePurchaseLot(item.id, { costPerUnit: next })
                          : updateTransaction(item.id, { salePricePerUnit: next })
                      }
                    />
                  ) : price != null ? (
                    priceFormatter.format(price)
                  ) : (
                    "—"
                  )}
                </td>
                <td
                  className={`px-3 py-2 font-data font-medium ${
                    profit == null ? "text-ink-muted" : profit < 0 ? "text-amber" : "text-emerald-strong"
                  }`}
                >
                  {profit != null ? signedPrice(profit) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RecentTransactions({
  purchases,
  purchaseCount,
  transactions,
  totalCount,
}: {
  purchases: PurchaseListItem[];
  purchaseCount: number;
  transactions: TransactionListItem[];
  totalCount: number;
}) {
  if (purchases.length === 0 && transactions.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {purchases.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-lg font-semibold tracking-tight text-ink">Buying</h2>
          <BuyTable purchases={purchases} />
          {purchaseCount > purchases.length && (
            <Link
              href="/portfolio"
              className="mt-2 inline-block font-body text-xs font-medium text-emerald-strong hover:underline"
            >
              View all {purchaseCount} →
            </Link>
          )}
        </div>
      )}

      {transactions.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-lg font-semibold tracking-tight text-ink">Selling</h2>
          <SellTable transactions={transactions} />
          {totalCount > transactions.length && (
            <Link
              href="/transactions"
              className="mt-2 inline-block font-body text-xs font-medium text-emerald-strong hover:underline"
            >
              View all {totalCount} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
