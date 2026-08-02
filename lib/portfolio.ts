import { prisma } from "@/lib/prisma";
import { CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import type { PricePoint } from "@/lib/cards";
import { buildSeries, priceAsOf } from "@/lib/price-series";

export type PortfolioSummary = {
  totalValue: number;
  cardValue: number;
  sealedValue: number;
  cardCount: number;
  sealedCount: number;
};

export type PortfolioData = {
  summary: PortfolioSummary;
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
  source: "TCGPLAYER" | "PRICECHARTING" | "EBAY";
  price: string;
  capturedDate: Date;
};

export async function getPortfolioData(userId: string): Promise<PortfolioData> {
  const items = await prisma.collectionItem.findMany({
    where: { userId },
    select: { cardId: true, sealedProductId: true, condition: true, quantity: true, createdAt: true },
  });

  const cardIds = items.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);

  const [cardRows, sealedRows] = await Promise.all([
    cardIds.length
      ? prisma.$queryRaw<CardHistoryRow[]>`
          SELECT "cardId", source, price::text AS price, "capturedDate"
          FROM "PriceSnapshot"
          WHERE "cardId" = ANY(${cardIds}) AND "priceType" = 'MARKET' AND variant = 'NORMAL'
            AND source IN ('PRICECHARTING', 'TCGPLAYER', 'CARDMARKET')
            -- Raw/ungraded prices only. PriceCharting's graded tiers land on
            -- the same capturedDate as the ungraded row, and buildSeries keeps
            -- the last row it sees per date -- so without this the portfolio
            -- chart quietly values every card at PSA-10/Grade-9.5 money.
            AND (source <> 'PRICECHARTING' OR condition IS NULL)
          ORDER BY "capturedDate" ASC
        `
      : Promise.resolve([]),
    sealedIds.length
      ? prisma.$queryRaw<SealedHistoryRow[]>`
          SELECT "sealedProductId", source, price::text AS price, "capturedDate"
          FROM "PriceSnapshot"
          WHERE "sealedProductId" = ANY(${sealedIds}) AND "priceType" = 'MARKET'
            AND source IN ('TCGPLAYER', 'PRICECHARTING', 'EBAY')
            -- Sealed product is never graded; snapshot-prices.ts stores
            -- TCGplayer's subTypeName in condition, so this keeps a
            -- "Normal"/"Holofoil" row from being valued as the sealed price.
            AND condition IS NULL
          ORDER BY "capturedDate" ASC
        `
      : Promise.resolve([]),
  ]);

  const cardSeries = buildSeries(cardRows, (r) => r.cardId, "PRICECHARTING");
  // Preferred source must track SEALED_PRICE_SOURCES in lib/sealed.ts, or the
  // portfolio total drifts from the price shown on the product page.
  const sealedSeries = buildSeries(sealedRows, (r) => r.sealedProductId, "TCGPLAYER");

  // Don't backdate value the user didn't have yet -- an item only counts
  // toward the chart from the date it was actually added to the collection,
  // even though the underlying card/product may have years of price history
  // from before the user owned (or even had an account for) it.
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
        if (price == null) continue;
        const multiplier = CONDITION_MULTIPLIERS[(item.condition as Condition) ?? "NM"] ?? 1;
        value += price * multiplier * item.quantity;
      } else if (item.sealedProductId) {
        const price = priceAsOf(sealedSeries.get(item.sealedProductId), dateKey);
        if (price == null) continue;
        value += price * item.quantity;
      }
    }
    return value;
  }

  const history: PricePoint[] = sortedDates.map((date) => ({ date, price: valueAt(date) }));

  let cardValue = 0;
  let sealedValue = 0;
  let cardCount = 0;
  let sealedCount = 0;
  const todayKey = sortedDates[sortedDates.length - 1];
  for (const item of items) {
    if (item.cardId) {
      cardCount += item.quantity;
      const price = todayKey ? priceAsOf(cardSeries.get(item.cardId), todayKey) : null;
      if (price != null) {
        const multiplier = CONDITION_MULTIPLIERS[(item.condition as Condition) ?? "NM"] ?? 1;
        cardValue += price * multiplier * item.quantity;
      }
    } else if (item.sealedProductId) {
      sealedCount += item.quantity;
      const price = todayKey ? priceAsOf(sealedSeries.get(item.sealedProductId), todayKey) : null;
      if (price != null) sealedValue += price * item.quantity;
    }
  }

  return {
    summary: {
      totalValue: cardValue + sealedValue,
      cardValue,
      sealedValue,
      cardCount,
      sealedCount,
    },
    history,
  };
}
