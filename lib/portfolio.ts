import { prisma } from "@/lib/prisma";
import { CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import type { PricePoint } from "@/lib/cards";

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

type CardHistoryRow = { cardId: string; source: "TCGPLAYER" | "CARDMARKET"; price: string; capturedDate: Date };
type SealedHistoryRow = {
  sealedProductId: string;
  source: "PRICECHARTING" | "EBAY";
  price: string;
  capturedDate: Date;
};

type DatedPrice = { price: number; source: string };
// entityId -> dateKey -> price on that date (deduped to one preferred source)
type PriceSeries = Map<string, Map<string, DatedPrice>>;

function buildSeries<Row extends { price: string; capturedDate: Date; source: string }>(
  rows: Row[],
  idOf: (row: Row) => string,
  preferredSource: string
): PriceSeries {
  const series: PriceSeries = new Map();
  for (const row of rows) {
    const id = idOf(row);
    const dateKey = row.capturedDate.toISOString().slice(0, 10);
    let byDate = series.get(id);
    if (!byDate) {
      byDate = new Map();
      series.set(id, byDate);
    }
    const existing = byDate.get(dateKey);
    if (existing && existing.source === preferredSource && row.source !== preferredSource) {
      continue; // keep the preferred-source price already recorded for this date
    }
    byDate.set(dateKey, { price: parseFloat(row.price), source: row.source });
  }
  return series;
}

// Most recent known price at or before `dateKey` (portfolio value carries
// forward between snapshot dates rather than dropping to zero).
function priceAsOf(byDate: Map<string, DatedPrice> | undefined, dateKey: string): number | null {
  if (!byDate) return null;
  let best: { date: string; price: number } | null = null;
  for (const [date, entry] of byDate) {
    if (date <= dateKey && (!best || date > best.date)) {
      best = { date, price: entry.price };
    }
  }
  return best?.price ?? null;
}

export async function getPortfolioData(userId: string): Promise<PortfolioData> {
  const items = await prisma.collectionItem.findMany({
    where: { userId },
    select: { cardId: true, sealedProductId: true, condition: true, quantity: true },
  });

  const cardIds = items.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);

  const [cardRows, sealedRows] = await Promise.all([
    cardIds.length
      ? prisma.$queryRaw<CardHistoryRow[]>`
          SELECT "cardId", source, price::text AS price, "capturedDate"
          FROM "PriceSnapshot"
          WHERE "cardId" = ANY(${cardIds}) AND "priceType" = 'MARKET'
            AND source IN ('TCGPLAYER', 'CARDMARKET')
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

  const cardSeries = buildSeries(cardRows, (r) => r.cardId, "TCGPLAYER");
  const sealedSeries = buildSeries(sealedRows, (r) => r.sealedProductId, "PRICECHARTING");

  const allDates = new Set<string>();
  for (const byDate of cardSeries.values()) for (const key of byDate.keys()) allDates.add(key);
  for (const byDate of sealedSeries.values()) for (const key of byDate.keys()) allDates.add(key);
  const sortedDates = Array.from(allDates).sort();

  function valueAt(dateKey: string): number {
    let value = 0;
    for (const item of items) {
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
