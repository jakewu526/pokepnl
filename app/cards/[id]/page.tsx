import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCardDetail, getCardGradeHistories } from "@/lib/cards";
import { getWatchlistedCardIds } from "@/lib/watchlist";
import { getCurrentUser } from "@/lib/dal";
import { Suspense } from "react";
import { PriceChart } from "@/components/PriceChart";
import { GradePriceChart } from "@/components/GradePriceChart";
import { AuthNav } from "@/components/AuthNav";
import { AddToCollectionButton } from "@/components/AddToCollectionButton";
import { WatchlistHeartButton } from "@/components/WatchlistHeartButton";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatNumber(number: string, setTotal: number | null): string {
  if (!setTotal) return number;
  const padded = number.padStart(String(setTotal).length, "0");
  return `${padded}/${setTotal}`;
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCardDetail(id);
  if (!card) notFound();
  const [gradeHistories, user] = await Promise.all([getCardGradeHistories(id), getCurrentUser()]);
  const watchedIds = user ? await getWatchlistedCardIds(user.id, [id]) : new Set<string>();
  // More than one series means real graded-tier data exists (PSA-style
  // Grade 7 through Grade 10, not just the single Ungraded/raw price) --
  // otherwise fall back to the single-source chart, which already shows
  // whatever price data is available (PriceCharting/TCGplayer/Cardmarket).
  const hasGradeData = gradeHistories.length > 1;

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
          <div className="flex items-center gap-4">
            <Suspense fallback={null}>
              <AuthNav />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <div className="relative aspect-[5/7] w-full max-w-[280px] overflow-hidden rounded-card border border-line bg-paper-raised">
            {card.imageUrl ? (
              <Image
                src={card.imageUrl}
                alt={`${card.name}, ${card.setName} #${card.number}`}
                fill
                sizes="280px"
                className="object-contain p-3"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                No image
              </div>
            )}
            {card.rarity && (
              <span className="absolute left-2 top-2 rounded-full bg-amber-tint px-2 py-0.5 font-body text-[11px] font-medium text-amber">
                {card.rarity}
              </span>
            )}
            {user && (
              <WatchlistHeartButton
                target={{ cardId: card.id }}
                initialWatched={watchedIds.has(card.id)}
                className="absolute bottom-3 right-3"
              />
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
                {card.name}
              </h1>
              <p className="mt-1 font-body text-sm text-ink-muted">
                {card.setName}
                {card.setSeries ? ` · ${card.setSeries}` : ""} ·{" "}
                <span className="font-data">{formatNumber(card.number, card.setTotal)}</span>
              </p>
              {card.supertype && (
                <p className="mt-1 font-body text-xs text-ink-muted">
                  {card.supertype}
                  {card.subtypes.length > 0 ? ` · ${card.subtypes.join(", ")}` : ""}
                </p>
              )}

              <div className="mt-4">
                {card.price != null ? (
                  <p className="font-data text-3xl font-medium text-emerald-strong">
                    {priceFormatter.format(card.price)}
                  </p>
                ) : (
                  <p className="font-data text-lg text-ink-muted">No price yet</p>
                )}
              </div>

              <div className="mt-4">
                <Suspense fallback={null}>
                  <AddToCollectionButton cardId={card.id} marketPrice={card.price} />
                </Suspense>
              </div>
            </div>

            <div>
              <h2 className="mb-2 font-body text-sm font-semibold text-ink">
                {hasGradeData ? "Price by grade" : "Price history"}
              </h2>
              {hasGradeData ? (
                <GradePriceChart series={gradeHistories} />
              ) : (
                <PriceChart points={card.history} source={card.priceSource} />
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        Prices from PriceCharting, TCGplayer, and Cardmarket, captured daily
      </footer>
    </div>
  );
}
