import Link from "next/link";
import Image from "next/image";
import type { TransactionListItem, PurchaseListItem } from "@/lib/pnl";
import { CONDITION_LABELS, type Condition } from "@/lib/condition";

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
export function SellTable({ transactions }: { transactions: TransactionListItem[] }) {
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
                <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">{tx.soldAt}</td>
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
                <td className="px-3 py-2 font-data text-ink-muted">{tx.quantity}</td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {tx.costPerUnit != null ? priceFormatter.format(tx.costPerUnit) : "—"}
                </td>
                <td className="px-3 py-2 font-data text-ink-muted">{priceFormatter.format(tx.salePricePerUnit)}</td>
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
export function BuyTable({ purchases }: { purchases: PurchaseListItem[] }) {
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
                <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">{p.purchasedAt}</td>
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
                <td className="px-3 py-2 font-data text-ink-muted">{p.quantity}</td>
                <td className="px-3 py-2 font-data text-ink-muted">
                  {p.costPerUnit != null ? priceFormatter.format(p.costPerUnit) : "—"}
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
