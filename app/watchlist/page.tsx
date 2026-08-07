import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getWatchlistData, getFeaturedWatchlistCard } from "@/lib/watchlist";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";
import { AuthNav } from "@/components/AuthNav";
import { CardTile } from "@/components/CardTile";
import { SealedProductTile } from "@/components/SealedProductTile";
import { PriceChart } from "@/components/PriceChart";
import { StatTile } from "@/components/StatTile";
import { RotatingWatchlistCard } from "@/components/RotatingWatchlistCard";

export default async function WatchlistPage() {
  const session = await verifySession();

  const [items, data, featuredOptions] = await Promise.all([
    prisma.watchlistItem.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          select: {
            id: true,
            name: true,
            number: true,
            rarity: true,
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
            language: true,
            set: { select: { name: true } },
          },
        },
      },
    }),
    getWatchlistData(session.userId),
    getFeaturedWatchlistCard(session.userId),
  ]);

  // Picking the pinned card (or a random one) here rather than inside
  // RotatingWatchlistCard keeps that component a pure display + pin-setter --
  // the "which card starts featured" decision belongs to the page, same as
  // it did on /dashboard before this card moved here.
  const pinnedCard = featuredOptions.find((o) => o.featured);
  // react-hooks/purity flags Math.random() as unsafe for memoized re-renders,
  // but this is a Server Component -- it renders exactly once per request,
  // so a fresh random pick per page load is the intended behavior, not a
  // purity bug.
  const randomIndex = Math.floor(Math.random() * featuredOptions.length); // eslint-disable-line react-hooks/purity
  const featuredCard = pinnedCard ?? (featuredOptions.length ? featuredOptions[randomIndex] : null);

  const cardIds = items.filter((i) => i.card).map((i) => i.card!.id);
  const sealedIds = items.filter((i) => i.sealedProduct).map((i) => i.sealedProduct!.id);
  const [cardPrices, sealedPrices] = await Promise.all([
    getLatestPrices(cardIds),
    getLatestSealedPrices(sealedIds),
  ]);

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
          <Suspense fallback={null}>
            <AuthNav />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight text-ink">
          Watchlist
        </h1>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px] lg:items-start">
          {items.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="Total value" value={data.summary.totalValue} tone="positive" />
                <StatTile
                  label="Cards"
                  sublabel={String(data.summary.cardCount)}
                  value={data.summary.cardValue}
                />
                <StatTile
                  label="Sealed"
                  sublabel={String(data.summary.sealedCount)}
                  value={data.summary.sealedValue}
                />
              </div>

              <div>
                <h2 className="mb-2 font-body text-sm font-semibold text-ink">Watchlist value over time</h2>
                <PriceChart points={data.history} source={null} />
              </div>
            </div>
          )}

          <div className="flex justify-center lg:sticky lg:top-24">
            <RotatingWatchlistCard featured={featuredCard} options={featuredOptions} />
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">Your watchlist is empty</p>
            <p className="font-body text-sm text-ink-muted">
              Tap the heart on any card or sealed product to save it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {items.map((item) =>
              item.card ? (
                <CardTile
                  key={item.id}
                  card={{
                    id: item.card.id,
                    name: item.card.name,
                    number: item.card.number,
                    rarity: item.card.rarity,
                    imageUrl: item.card.imageUrl,
                    setName: item.card.set.name,
                    setTotal: item.card.set.totalCards,
                    price: cardPrices.get(item.card.id)?.price ?? null,
                    priceSource: cardPrices.get(item.card.id)?.source ?? null,
                  }}
                  watched
                />
              ) : item.sealedProduct ? (
                <SealedProductTile
                  key={item.id}
                  product={{
                    id: item.sealedProduct.id,
                    name: item.sealedProduct.name,
                    type: item.sealedProduct.type,
                    imageUrl: item.sealedProduct.imageUrl,
                    language: item.sealedProduct.language,
                    setName: item.sealedProduct.set?.name ?? null,
                    price: sealedPrices.get(item.sealedProduct.id)?.price ?? null,
                    priceSource: sealedPrices.get(item.sealedProduct.id)?.source ?? null,
                  }}
                  watched
                />
              ) : null
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {items.length} item{items.length === 1 ? "" : "s"} on your watchlist
      </footer>
    </div>
  );
}
