import Link from "next/link";
import Image from "next/image";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { SellOrDeleteButton } from "@/components/SellOrDeleteButton";
import { PriceChart } from "@/components/PriceChart";
import { CONDITION_LABELS, CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import { SEALED_TYPE_LABELS, type SealedProductType } from "@/lib/sealed";
import { getPortfolioData } from "@/lib/portfolio";
import { getPnlSummary, getRealizedProfitHistory, getTransactionHistory } from "@/lib/pnl";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

export default async function CollectionPage() {
  const session = await verifySession();

  const [items, portfolio, pnl, profitHistory, transactions] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          select: {
            id: true,
            name: true,
            number: true,
            imageUrl: true,
            set: { select: { name: true, totalCards: true } },
          },
        },
        sealedProduct: {
          select: {
            id: true,
            name: true,
            type: true,
            imageUrl: true,
            set: { select: { name: true } },
          },
        },
      },
    }),
    getPortfolioData(session.userId),
    getPnlSummary(session.userId),
    getRealizedProfitHistory(session.userId),
    getTransactionHistory(session.userId),
  ]);

  const cardIds = items.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);
  const [cardPrices, sealedPrices] = await Promise.all([
    getLatestPrices(cardIds),
    getLatestSealedPrices(sealedIds),
  ]);

  function marketPriceFor(item: (typeof items)[number]): number | null {
    if (item.cardId) {
      const info = cardPrices.get(item.cardId);
      if (!info) return null;
      const multiplier = CONDITION_MULTIPLIERS[(item.condition as Condition) ?? "NM"] ?? 1;
      return info.price * multiplier;
    }
    if (item.sealedProductId) {
      return sealedPrices.get(item.sealedProductId)?.price ?? null;
    }
    return null;
  }

  const profitIsNegative = profitHistory.length > 0 && profitHistory[profitHistory.length - 1].price < 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link
            href="/"
            className="font-body text-sm font-medium text-emerald-strong hover:underline"
          >
            ← Binder
          </Link>
          <AuthNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight text-ink">
          My Collection
        </h1>

        {items.length > 0 && (
          <div className="mb-8 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-card border border-line bg-paper-raised px-4 py-3">
                <p className="font-body text-xs text-ink-muted">Total value</p>
                <p className="font-data text-2xl font-medium text-emerald-strong">
                  {priceFormatter.format(portfolio.summary.totalValue)}
                </p>
              </div>
              <div className="rounded-card border border-line bg-paper-raised px-4 py-3">
                <p className="font-body text-xs text-ink-muted">
                  Cards · {portfolio.summary.cardCount}
                </p>
                <p className="font-data text-2xl font-medium text-ink">
                  {priceFormatter.format(portfolio.summary.cardValue)}
                </p>
              </div>
              <div className="rounded-card border border-line bg-paper-raised px-4 py-3">
                <p className="font-body text-xs text-ink-muted">
                  Sealed · {portfolio.summary.sealedCount}
                </p>
                <p className="font-data text-2xl font-medium text-ink">
                  {priceFormatter.format(portfolio.summary.sealedValue)}
                </p>
              </div>
            </div>

            <div>
              <h2 className="mb-2 font-body text-sm font-semibold text-ink">Collection value over time</h2>
              <PriceChart points={portfolio.history} source={null} />
            </div>
          </div>
        )}

        {(pnl.realizedProfit !== 0 || pnl.unrealizedProfit !== 0 || transactions.length > 0) && (
          <div className="mb-8 flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Profit &amp; loss</h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-card border border-line bg-paper-raised px-4 py-3">
                <p className="font-body text-xs text-ink-muted">Realized profit</p>
                <p
                  className={`font-data text-2xl font-medium ${
                    pnl.realizedProfit < 0 ? "text-amber" : "text-emerald-strong"
                  }`}
                >
                  {signedPrice(pnl.realizedProfit)}
                </p>
              </div>
              <div className="rounded-card border border-line bg-paper-raised px-4 py-3">
                <p className="font-body text-xs text-ink-muted">
                  Unrealized profit
                  {pnl.itemsWithUnknownCost > 0 && (
                    <span> · {pnl.itemsWithUnknownCost} item{pnl.itemsWithUnknownCost === 1 ? "" : "s"} missing cost</span>
                  )}
                </p>
                <p
                  className={`font-data text-2xl font-medium ${
                    pnl.unrealizedProfit < 0 ? "text-amber" : "text-emerald-strong"
                  }`}
                >
                  {signedPrice(pnl.unrealizedProfit)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-body text-sm font-semibold text-ink">Realized profit over time</h3>
              <PriceChart points={profitHistory} source={null} negative={profitIsNegative} />
            </div>

            {transactions.length > 0 && (
              <div>
                <h3 className="mb-2 font-body text-sm font-semibold text-ink">Transactions</h3>
                <div className="overflow-x-auto rounded-card border border-line bg-paper-raised">
                  <table className="w-full min-w-[560px] text-left font-body text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs text-ink-muted">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Cost</th>
                        <th className="px-3 py-2 font-medium">Sold for</th>
                        <th className="px-3 py-2 font-medium">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-line last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">
                            {tx.soldAt}
                          </td>
                          <td className="px-3 py-2 text-ink">
                            {tx.itemName}
                            {tx.condition && (
                              <span className="text-ink-muted"> · {CONDITION_LABELS[tx.condition as Condition] ?? tx.condition}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-data text-ink-muted">{tx.quantity}</td>
                          <td className="px-3 py-2 font-data text-ink-muted">
                            {tx.costPerUnit != null ? priceFormatter.format(tx.costPerUnit) : "—"}
                          </td>
                          <td className="px-3 py-2 font-data text-ink-muted">
                            {priceFormatter.format(tx.salePricePerUnit)}
                          </td>
                          <td
                            className={`px-3 py-2 font-data font-medium ${
                              tx.profit == null
                                ? "text-ink-muted"
                                : tx.profit < 0
                                  ? "text-amber"
                                  : "text-emerald-strong"
                            }`}
                          >
                            {tx.profit != null ? signedPrice(tx.profit) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">Your collection is empty</p>
            <p className="font-body text-sm text-ink-muted">
              Browse cards and add them to your collection to see them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {items.map((item) => {
              const marketPrice = marketPriceFor(item);
              const cost = item.costPerUnit != null ? parseFloat(item.costPerUnit.toString()) : null;
              const unrealized = cost != null && marketPrice != null ? (marketPrice - cost) * item.quantity : null;

              return item.card ? (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised"
                >
                  <Link href={`/cards/${item.card.id}`} className="relative aspect-[5/7] bg-line/40">
                    {item.card.imageUrl ? (
                      <Image
                        src={item.card.imageUrl}
                        alt={item.card.name}
                        fill
                        sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw"
                        className="object-contain p-2"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                        No image
                      </div>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
                    <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">
                      {item.card.name}
                    </h2>
                    <p className="font-body text-[13px] text-ink-muted">
                      {item.card.set.name} ·{" "}
                      {CONDITION_LABELS[item.condition as Condition] ?? item.condition}
                    </p>
                    <p className="font-data text-[13px] text-ink-muted">Qty {item.quantity}</p>
                    <p className="font-data text-[13px] text-ink-muted">
                      Cost {cost != null ? priceFormatter.format(cost) : "—"}
                    </p>
                    {unrealized != null && (
                      <p
                        className={`font-data text-[13px] font-medium ${
                          unrealized < 0 ? "text-amber" : "text-emerald-strong"
                        }`}
                      >
                        {signedPrice(unrealized)}
                      </p>
                    )}
                    <div className="mt-auto pt-2">
                      <SellOrDeleteButton
                        collectionItemId={item.id}
                        quantity={item.quantity}
                        marketPrice={marketPrice}
                      />
                    </div>
                  </div>
                </div>
              ) : item.sealedProduct ? (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised"
                >
                  <Link href={`/sealed/${item.sealedProduct.id}`} className="relative aspect-[5/7] bg-line/40">
                    {item.sealedProduct.imageUrl ? (
                      <Image
                        src={item.sealedProduct.imageUrl}
                        alt={item.sealedProduct.name}
                        fill
                        sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw"
                        className="object-contain p-2"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                        {SEALED_TYPE_LABELS[item.sealedProduct.type as SealedProductType]}
                      </div>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
                    <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">
                      {item.sealedProduct.name}
                    </h2>
                    <p className="font-body text-[13px] text-ink-muted">
                      {item.sealedProduct.set?.name ?? SEALED_TYPE_LABELS[item.sealedProduct.type as SealedProductType]}
                    </p>
                    <p className="font-data text-[13px] text-ink-muted">Qty {item.quantity}</p>
                    <p className="font-data text-[13px] text-ink-muted">
                      Cost {cost != null ? priceFormatter.format(cost) : "—"}
                    </p>
                    {unrealized != null && (
                      <p
                        className={`font-data text-[13px] font-medium ${
                          unrealized < 0 ? "text-amber" : "text-emerald-strong"
                        }`}
                      >
                        {signedPrice(unrealized)}
                      </p>
                    )}
                    <div className="mt-auto pt-2">
                      <SellOrDeleteButton
                        collectionItemId={item.id}
                        quantity={item.quantity}
                        marketPrice={marketPrice}
                      />
                    </div>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {items.length} item{items.length === 1 ? "" : "s"} in your collection
      </footer>
    </div>
  );
}
