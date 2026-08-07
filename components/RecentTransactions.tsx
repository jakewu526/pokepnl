import Link from "next/link";
import Image from "next/image";
import type { TransactionListItem } from "@/lib/pnl";
import { CONDITION_LABELS, type Condition } from "@/lib/condition";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

export function RecentTransactions({
  transactions,
  totalCount,
}: {
  transactions: TransactionListItem[];
  totalCount: number;
}) {
  if (transactions.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 font-display text-lg font-semibold tracking-tight text-ink">Transactions</h2>
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
              const href = tx.itemId ? (tx.itemType === "card" ? `/cards/${tx.itemId}` : `/sealed/${tx.itemId}`) : null;

              return (
                <tr key={tx.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">{tx.soldAt}</td>
                  <td className="px-3 py-2 text-ink">
                    <div className="flex items-center gap-2">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
                        {tx.imageUrl && (
                          <Image src={tx.imageUrl} alt={tx.itemName} fill sizes="40px" className="object-contain" />
                        )}
                      </div>
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
      {totalCount > transactions.length && (
        <Link
          href="/transactions"
          className="mt-2 inline-block font-body text-xs font-medium text-emerald-strong hover:underline"
        >
          View all {totalCount} →
        </Link>
      )}
    </div>
  );
}
