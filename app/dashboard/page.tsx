import Link from "next/link";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { CollectionHero, type HeroArt } from "@/components/CollectionHero";
import { DashboardOverview } from "@/components/DashboardOverview";
import { TopMovers } from "@/components/TopMovers";
import { RecentTransactions } from "@/components/RecentTransactions";
import { PortfolioItemTile } from "@/components/PortfolioItemTile";
import { PortfolioCarousel } from "@/components/PortfolioCarousel";
import { CONDITION_LABELS, CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import { SEALED_TYPE_LABELS, type SealedProductType } from "@/lib/sealed";
import { getPortfolioData, deltaOverDays } from "@/lib/portfolio";
import { getPnlSummary, getRealizedProfitHistory, getTransactionHistory, getPurchaseHistory } from "@/lib/pnl";
import { getTopMovers, getAllocation, getCollectionTimeline } from "@/lib/dashboard";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";
import { getDashboardPulse } from "@/lib/narrative";

const RECENT_LIMIT = 10;

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

export default async function DashboardPage() {
  const session = await verifySession();

  const [
    user,
    recentItems,
    itemCount,
    portfolio,
    pnl,
    profitHistory,
    purchases,
    transactions,
    transactionCount,
    topMovers,
    allocation,
    timeline,
    pulse,
  ] = await Promise.all([
    // verifySession() already guarantees this account has a name (redirects
    // to /welcome otherwise) -- the ! below reflects that, not a guess.
    getCurrentUser(),
    prisma.collectionItem.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
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
    prisma.collectionItem.count({ where: { userId: session.userId } }),
    getPortfolioData(session.userId),
    getPnlSummary(session.userId),
    getRealizedProfitHistory(session.userId),
    getPurchaseHistory(session.userId, RECENT_LIMIT),
    getTransactionHistory(session.userId, RECENT_LIMIT),
    prisma.transaction.count({ where: { userId: session.userId } }),
    getTopMovers(session.userId),
    getAllocation(session.userId),
    getCollectionTimeline(session.userId),
    getDashboardPulse(session.userId),
  ]);

  const cardIds = recentItems.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = recentItems.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);
  const [cardPrices, sealedPrices] = await Promise.all([
    getLatestPrices(cardIds),
    getLatestSealedPrices(sealedIds),
  ]);

  function marketPriceFor(item: (typeof recentItems)[number]): number | null {
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

  const unrealizedHistory = portfolio.history.map((p, i) => ({
    date: p.date,
    price: p.price - (portfolio.costBasisHistory[i]?.price ?? 0),
  }));
  const valueDelta7d = deltaOverDays(portfolio.history, 7);
  const investedDelta7d = deltaOverDays(portfolio.costBasisHistory, 7);
  const unrealizedDelta7d = deltaOverDays(unrealizedHistory, 7);
  const realizedDelta7d = deltaOverDays(profitHistory, 7);

  const hasPortfolio = itemCount > 0;
  const unrealizedProfit = portfolio.summary.totalValue - portfolio.summary.costBasis;
  const firstName = user!.name!.split(" ")[0];

  // The hero art always carries a reason for being on screen. First choice is
  // the holding the narrative is actually about; when nothing has moved (a
  // brand-new account, a flat week) it falls back to the newest addition, so
  // the hero is never a wall of numbers with a blank space beside it.
  const newest = recentItems.find((i) => i.card?.imageUrl || i.sealedProduct?.imageUrl);
  // A driver that didn't actually move is not a "biggest gain" -- labelling a
  // $0.00 change that way is worse than showing no mover at all, so a flat
  // week falls through to the newest card instead.
  const heroArt: HeroArt | null = pulse.driver && pulse.driver.changeAbs !== 0
    ? {
        name: pulse.driver.name,
        imageUrl: pulse.driver.imageUrl,
        href: pulse.driver.itemType === "card" ? `/cards/${pulse.driver.itemId}` : `/sealed/${pulse.driver.itemId}`,
        reason: pulse.driver.changeAbs >= 0 ? "Biggest gain this week" : "Biggest drop this week",
        detail: `${signedPrice(pulse.driver.changeAbs)} · ${signedPercent(pulse.driver.changePct)}`,
      }
    : newest
      ? {
          name: newest.card?.name ?? newest.sealedProduct?.name ?? "Your newest card",
          imageUrl: newest.card?.imageUrl ?? newest.sealedProduct?.imageUrl ?? null,
          href: newest.card ? `/cards/${newest.card.id}` : `/sealed/${newest.sealedProduct!.id}`,
          reason: "Newest in your collection",
          detail: null,
        }
      : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="font-body text-sm font-medium text-emerald-strong hover:underline">
            ← Binder
          </Link>
          <AuthNav />
        </div>
      </header>

      <main className="flex-1">
        {hasPortfolio ? (
          // One scroller, not two. This whole block -- hero, overview, top
          // movers, just added, transactions, footer -- lives inside a
          // single `lg:overflow-y-auto` box, so there's exactly one
          // scrollbar/scroll gesture for the whole page at lg: and up.
          // Only the hero and overview sections get `snap-start`; everything
          // after them scrolls through normally without snapping. (Two
          // independent scroll regions -- this bounded box plus the outer
          // document -- used to fight each other: scrolling inside the box
          // never reached what was below it, and vice versa.) Below lg this
          // is unconstrained and just normal single-scroller document flow.
          //
          // `snap-proximity`, not `snap-mandatory`: mandatory forces the
          // scroll position to always rest on a snap point, but only the
          // first two sections have one -- past them, mandatory kept
          // dragging the page back to the overview slide instead of letting
          // the user continue down to top movers/transactions/footer.
          // Proximity only snaps when already close to a snap point and
          // never fights a scroll gesture headed past the last one.
          <div className="lg:h-[calc(100dvh-4.5rem)] lg:snap-y lg:snap-proximity lg:overflow-y-auto">
            <section className="lg:min-h-full lg:snap-start">
              <CollectionHero pulse={pulse} art={heroArt} firstName={firstName} />
            </section>
            <section className="lg:min-h-full lg:snap-start">
              <DashboardOverview
                totalValue={portfolio.summary.totalValue}
                costBasis={portfolio.summary.costBasis}
                unrealizedProfit={unrealizedProfit}
                realizedProfit={pnl.realizedProfit}
                valueDelta7d={valueDelta7d}
                investedDelta7d={investedDelta7d}
                unrealizedDelta7d={unrealizedDelta7d}
                realizedDelta7d={realizedDelta7d}
                valuePoints={portfolio.history}
                costBasisPoints={portfolio.costBasisHistory}
                allocationSlices={allocation.byType}
                timeline={timeline}
              />
            </section>

            <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-10 pb-16 sm:px-6">
              <TopMovers gainers={topMovers.gainers} losers={topMovers.losers} />

              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-tight text-ink">Just added</h3>
                    <p className="mt-0.5 font-body text-sm text-ink-muted">The latest cards in your binder.</p>
                  </div>
                  {itemCount > recentItems.length && (
                    <Link
                      href="/portfolio"
                      className="rounded-full border border-line px-3 py-1.5 font-body text-sm font-medium text-emerald-strong transition-colors hover:bg-paper-raised hover:underline"
                    >
                      See all {itemCount} →
                    </Link>
                  )}
                </div>
                <PortfolioCarousel>
                  {recentItems.map((item) => {
                    const marketPrice = marketPriceFor(item);
                    const cost = item.costPerUnit != null ? parseFloat(item.costPerUnit.toString()) : null;
                    const unrealized =
                      cost != null && marketPrice != null ? (marketPrice - cost) * item.quantity : null;
                    const unrealizedPct =
                      cost != null && cost !== 0 && marketPrice != null ? (marketPrice - cost) / cost : null;

                    return item.card ? (
                      <PortfolioItemTile
                        key={item.id}
                        href={`/cards/${item.card.id}`}
                        imageUrl={item.card.imageUrl}
                        imageAlt={item.card.name}
                        fallbackLabel="No image"
                        name={item.card.name}
                        subtitle={`${item.card.set.name} · ${CONDITION_LABELS[item.condition as Condition] ?? item.condition}`}
                        quantity={item.quantity}
                        cost={cost}
                        unrealized={unrealized}
                        unrealizedPct={unrealizedPct}
                        collectionItemId={item.id}
                        marketPrice={marketPrice}
                      />
                    ) : item.sealedProduct ? (
                      <PortfolioItemTile
                        key={item.id}
                        href={`/sealed/${item.sealedProduct.id}`}
                        imageUrl={item.sealedProduct.imageUrl}
                        imageAlt={item.sealedProduct.name}
                        fallbackLabel={SEALED_TYPE_LABELS[item.sealedProduct.type as SealedProductType]}
                        name={item.sealedProduct.name}
                        subtitle={
                          (item.sealedProduct.set?.name ??
                            SEALED_TYPE_LABELS[item.sealedProduct.type as SealedProductType]) +
                          (item.condition ? ` · ${item.condition}` : "")
                        }
                        quantity={item.quantity}
                        cost={cost}
                        unrealized={unrealized}
                        unrealizedPct={unrealizedPct}
                        collectionItemId={item.id}
                        marketPrice={marketPrice}
                      />
                    ) : null;
                  })}
                </PortfolioCarousel>
              </div>

              <RecentTransactions
                purchases={purchases}
                purchaseCount={itemCount}
                transactions={transactions}
                totalCount={transactionCount}
              />
            </div>

            {/* Same scroller as everything above -- a second, separately
                positioned <footer> sibling would reintroduce exactly the
                two-scroller problem this layout exists to avoid. */}
            <div className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
              {itemCount} card{itemCount === 1 ? "" : "s"} in your binder
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-24 text-center sm:px-6">
            <p className="font-body text-lg font-medium text-ink">Your collection is empty</p>
            <p className="font-body text-sm text-ink-muted">
              Browse cards and add them to your binder to see them here.
            </p>
          </div>
        )}
      </main>

      {!hasPortfolio && (
        <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
          {itemCount} card{itemCount === 1 ? "" : "s"} in your binder
        </footer>
      )}
    </div>
  );
}
