import { prisma } from "@/lib/prisma";
import type { PricePoint } from "@/lib/cards";
import { buildSeries, priceAsOf } from "@/lib/price-series";

// Returns the subset of `cardIds` the user is watching -- used by grid/detail
// pages to decide which heart icons render filled. `userId` is null for
// signed-out visitors, who can't have a watchlist.
export async function getWatchlistedCardIds(
  userId: string | null,
  cardIds: string[]
): Promise<Set<string>> {
  if (!userId || cardIds.length === 0) return new Set();
  const rows = await prisma.watchlistItem.findMany({
    where: { userId, cardId: { in: cardIds } },
    select: { cardId: true },
  });
  return new Set(rows.map((r) => r.cardId!));
}

export async function getWatchlistedSealedIds(
  userId: string | null,
  sealedProductIds: string[]
): Promise<Set<string>> {
  if (!userId || sealedProductIds.length === 0) return new Set();
  const rows = await prisma.watchlistItem.findMany({
    where: { userId, sealedProductId: { in: sealedProductIds } },
    select: { sealedProductId: true },
  });
  return new Set(rows.map((r) => r.sealedProductId!));
}

export type WatchlistSummary = {
  totalValue: number;
  cardValue: number;
  sealedValue: number;
  cardCount: number;
  sealedCount: number;
};

export type WatchlistData = {
  summary: WatchlistSummary;
  history: PricePoint[];
};

type CardHistoryRow = {
  cardId: string;
  source: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET";
  price: string;
  capturedDate: Date;
};
type SealedHistoryRow = {
  sealedProductId: string;
  source: "PRICECHARTING" | "EBAY";
  price: string;
  capturedDate: Date;
};

// Value-over-time for a user's watchlist -- mirrors getPortfolioData in
// lib/portfolio.ts, minus condition/cost (watchlist items aren't owned, so
// there's no condition to scale by and no cost basis to track P&L against).
// Same "don't backdate before it was added" rule applies: an item only
// contributes to the chart from the date it was watchlisted.
export async function getWatchlistData(userId: string): Promise<WatchlistData> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    select: { cardId: true, sealedProductId: true, createdAt: true },
  });

  const cardIds = items.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);

  const [cardRows, sealedRows] = await Promise.all([
    cardIds.length
      ? prisma.$queryRaw<CardHistoryRow[]>`
          SELECT "cardId", source, price::text AS price, "capturedDate"
          FROM "PriceSnapshot"
          WHERE "cardId" = ANY(${cardIds}) AND "priceType" = 'MARKET'
            AND source IN ('PRICECHARTING', 'TCGPLAYER', 'CARDMARKET')
          ORDER BY "capturedDate" ASC
        `
      : Promise.resolve([]),
    sealedIds.length
      ? prisma.$queryRaw<SealedHistoryRow[]>`
          SELECT "sealedProductId", source, price::text AS price, "capturedDate"
          FROM "PriceSnapshot"
          WHERE "sealedProductId" = ANY(${sealedIds}) AND "priceType" = 'MARKET'
            AND source IN ('PRICECHARTING', 'EBAY')
          ORDER BY "capturedDate" ASC
        `
      : Promise.resolve([]),
  ]);

  const cardSeries = buildSeries(cardRows, (r) => r.cardId, "PRICECHARTING");
  const sealedSeries = buildSeries(sealedRows, (r) => r.sealedProductId, "PRICECHARTING");

  const addedDateKey = (item: (typeof items)[number]) => item.createdAt.toISOString().slice(0, 10);

  const allDates = new Set<string>();
  for (const byDate of cardSeries.values()) for (const key of byDate.keys()) allDates.add(key);
  for (const byDate of sealedSeries.values()) for (const key of byDate.keys()) allDates.add(key);
  for (const item of items) allDates.add(addedDateKey(item));
  const earliestAdded = items.length
    ? items.map(addedDateKey).reduce((min, d) => (d < min ? d : min))
    : null;
  const sortedDates = Array.from(allDates)
    .filter((d) => earliestAdded != null && d >= earliestAdded)
    .sort();

  function valueAt(dateKey: string): number {
    let value = 0;
    for (const item of items) {
      if (dateKey < addedDateKey(item)) continue;
      if (item.cardId) {
        const price = priceAsOf(cardSeries.get(item.cardId), dateKey);
        if (price != null) value += price;
      } else if (item.sealedProductId) {
        const price = priceAsOf(sealedSeries.get(item.sealedProductId), dateKey);
        if (price != null) value += price;
      }
    }
    return value;
  }

  const history: PricePoint[] = sortedDates.map((date) => ({ date, price: valueAt(date) }));

  let cardValue = 0;
  let sealedValue = 0;
  const todayKey = sortedDates[sortedDates.length - 1];
  for (const item of items) {
    if (item.cardId) {
      const price = todayKey ? priceAsOf(cardSeries.get(item.cardId), todayKey) : null;
      if (price != null) cardValue += price;
    } else if (item.sealedProductId) {
      const price = todayKey ? priceAsOf(sealedSeries.get(item.sealedProductId), todayKey) : null;
      if (price != null) sealedValue += price;
    }
  }

  return {
    summary: {
      totalValue: cardValue + sealedValue,
      cardValue,
      sealedValue,
      cardCount: cardIds.length,
      sealedCount: sealedIds.length,
    },
    history,
  };
}
