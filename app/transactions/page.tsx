import Link from "next/link";
import Image from "next/image";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { CONDITION_LABELS, type Condition } from "@/lib/condition";

const PAGE_SIZE = 30;

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function buildHref(page: number): string {
  return page > 1 ? `/transactions?page=${page}` : "/transactions";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await verifySession();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [rows, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: session.userId },
      orderBy: { soldAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        card: { select: { imageUrl: true } },
        sealedProduct: { select: { imageUrl: true } },
      },
    }),
    prisma.transaction.count({ where: { userId: session.userId } }),
  ]);

  const transactions = rows.map((row) => ({
    id: row.id,
    itemName: row.itemName,
    condition: row.condition,
    quantity: row.quantity,
    costPerUnit: row.costPerUnit != null ? parseFloat(row.costPerUnit.toString()) : null,
    salePricePerUnit: parseFloat(row.salePricePerUnit.toString()),
    feesTotal: row.feesTotal != null ? parseFloat(row.feesTotal.toString()) : null,
    shippingCost: row.shippingCost != null ? parseFloat(row.shippingCost.toString()) : null,
    profit: row.profit != null ? parseFloat(row.profit.toString()) : null,
    soldAt: row.soldAt.toISOString().slice(0, 10),
    itemType: row.cardId ? ("card" as const) : ("sealed" as const),
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  }));

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link href="/dashboard" className="font-body text-sm font-medium text-emerald-strong hover:underline">
            ← Dashboard
          </Link>
          <AuthNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight text-ink">Transactions</h1>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">No sales yet</p>
            <p className="font-body text-sm text-ink-muted">
              Sell an item from your portfolio to see it show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-card border border-line bg-paper-raised">
              <table className="w-full min-w-[720px] text-left font-body text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Sold for</th>
                    <th className="px-3 py-2 font-medium">Fees</th>
                    <th className="px-3 py-2 font-medium">Net profit</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const href = tx.itemId
                      ? tx.itemType === "card"
                        ? `/cards/${tx.itemId}`
                        : `/sealed/${tx.itemId}`
                      : null;
                    const itemLabel = (
                      <>
                        {tx.itemName}
                        {tx.condition && (
                          <span className="text-ink-muted">
                            {" "}
                            · {CONDITION_LABELS[tx.condition as Condition] ?? tx.condition}
                          </span>
                        )}
                      </>
                    );
                    const feesTotal = (tx.feesTotal ?? 0) + (tx.shippingCost ?? 0);

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
                        <td className="px-3 py-2 font-data text-ink-muted">
                          {priceFormatter.format(tx.salePricePerUnit)}
                        </td>
                        <td className="px-3 py-2 font-data text-ink-muted">
                          {feesTotal > 0 ? priceFormatter.format(feesTotal) : "—"}
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

            <nav aria-label="Transaction pages" className="flex items-center justify-center gap-4 py-6">
              {hasPrev ? (
                <Link
                  href={buildHref(page - 1)}
                  className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink hover:border-emerald hover:text-emerald-strong"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink-muted opacity-50">
                  ← Previous
                </span>
              )}

              <span className="font-data text-sm text-ink-muted">
                Page {page} of {pageCount}
              </span>

              {hasNext ? (
                <Link
                  href={buildHref(page + 1)}
                  className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink hover:border-emerald hover:text-emerald-strong"
                >
                  Next →
                </Link>
              ) : (
                <span className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink-muted opacity-50">
                  Next →
                </span>
              )}
            </nav>
          </>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {totalCount} transaction{totalCount === 1 ? "" : "s"}
      </footer>
    </div>
  );
}
