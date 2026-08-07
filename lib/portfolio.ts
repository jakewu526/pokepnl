import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import type { PricePoint } from "@/lib/cards";
import { buildSeries, priceAsOf, type PriceSeries } from "@/lib/price-series";

export type PortfolioSummary = {
  totalValue: number;
  cardValue: number;
  sealedValue: number;
  cardCount: number;
  sealedCount: number;
  costBasis: number;
  unrealizedRoiPct: number;
  valueDelta30d: { abs: number; pct: number };
};

export type PortfolioData = {
  summary: PortfolioSummary;
  history: PricePoint[];
  costBasisHistory: PricePoint[];
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

export type PortfolioItem = {
  cardId: string | null;
  sealedProductId: string | null;
  condition: string | null;
  quantity: number;
  costPerUnit: number | null;
  createdAt: string; // dateKey ("YYYY-MM-DD"), already normalized
};

export type PortfolioSeries = {
  items: PortfolioItem[];
  cardSeries: PriceSeries;
  sealedSeries: PriceSeries;
  sortedDates: string[];
};

// Shared by getPortfolioData and lib/dashboard.ts's getTopMovers/getAllocation/
// getDataQuality and lib/narrative.ts's getDashboardPulse -- all need the same
// per-item price series against the same holdings, and re-running these two
// PriceSnapshot queries per widget would multiply an already expensive query
// for no reason. Wrapped in React's per-request cache() so the five-plus
// concurrent callers on /dashboard collapse into a single execution instead
// of independently re-running both raw queries.
export const buildPortfolioSeries = cache(async (userId: string): Promise<PortfolioSeries> => {
  const rows = await prisma.collectionItem.findMany({
    where: { userId },
    select: {
      cardId: true,
      sealedProductId: true,
      condition: true,
      quantity: true,
      createdAt: true,
      costPerUnit: true,
    },
  });

  const items: PortfolioItem[] = rows.map((r) => ({
    cardId: r.cardId,
    sealedProductId: r.sealedProductId,
    condition: r.condition,
    quantity: r.quantity,
    costPerUnit: r.costPerUnit != null ? parseFloat(r.costPerUnit.toString()) : null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  }));

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
  const allDates = new Set<string>();
  for (const byDate of cardSeries.values()) for (const key of byDate.keys()) allDates.add(key);
  for (const byDate of sealedSeries.values()) for (const key of byDate.keys()) allDates.add(key);
  for (const item of items) allDates.add(item.createdAt);
  const earliestAdded = items.length
    ? items.map((i) => i.createdAt).reduce((min, d) => (d < min ? d : min))
    : null;
  const sortedDates = Array.from(allDates)
    .filter((d) => earliestAdded != null && d >= earliestAdded)
    .sort();

  return { items, cardSeries, sealedSeries, sortedDates };
});

// Market value of one holding on `dateKey`, or null if the item wasn't yet
// owned or has no price at that date. Applies the same condition-multiplier
// (cards) / raw-price (sealed) rules as getPortfolioData's summary math.
export function itemValueAt(
  item: PortfolioItem,
  series: Pick<PortfolioSeries, "cardSeries" | "sealedSeries">,
  dateKey: string
): number | null {
  if (dateKey < item.createdAt) return null;
  if (item.cardId) {
    const price = priceAsOf(series.cardSeries.get(item.cardId), dateKey);
    if (price == null) return null;
    const multiplier = CONDITION_MULTIPLIERS[(item.condition as Condition) ?? "NM"] ?? 1;
    return price * multiplier * item.quantity;
  }
  if (item.sealedProductId) {
    const price = priceAsOf(series.sealedSeries.get(item.sealedProductId), dateKey);
    if (price == null) return null;
    return price * item.quantity;
  }
  return null;
}

const DAY_MS = 86_400_000;

// Change over the last `days`, anchored to the newest point in `points` (not
// wall-clock "today") -- same anchoring rationale as filterPointsToRange in
// lib/chart-format.ts: snapshots can lag, so anchor to real data. Used for
// every KPI tile's delta, not just portfolio value.
export function deltaOverDays(points: PricePoint[], days: number): { abs: number; pct: number } {
  if (points.length === 0) return { abs: 0, pct: 0 };
  const latest = points[points.length - 1];
  const pastKey = new Date(new Date(latest.date).getTime() - days * DAY_MS).toISOString().slice(0, 10);
  let pastValue: number | null = null;
  for (const p of points) {
    if (p.date <= pastKey) pastValue = p.price;
    else break;
  }
  if (pastValue == null) return { abs: 0, pct: 0 };
  const abs = latest.price - pastValue;
  return { abs, pct: pastValue !== 0 ? abs / pastValue : 0 };
}

export async function getPortfolioData(userId: string): Promise<PortfolioData> {
  const { items, cardSeries, sealedSeries, sortedDates } = await buildPortfolioSeries(userId);
  const series = { cardSeries, sealedSeries };

  function valueAt(dateKey: string): number {
    let value = 0;
    for (const item of items) {
      value += itemValueAt(item, series, dateKey) ?? 0;
    }
    return value;
  }

  const history: PricePoint[] = sortedDates.map((date) => ({ date, price: valueAt(date) }));

  // Step series: cost basis only changes when an item is added/sold, so this
  // is flat between those events rather than tracking market movement.
  function costBasisAt(dateKey: string): number {
    let basis = 0;
    for (const item of items) {
      if (dateKey < item.createdAt) continue;
      if (item.costPerUnit == null) continue;
      basis += item.costPerUnit * item.quantity;
    }
    return basis;
  }
  const costBasisHistory: PricePoint[] = sortedDates.map((date) => ({ date, price: costBasisAt(date) }));

  let cardValue = 0;
  let sealedValue = 0;
  let cardCount = 0;
  let sealedCount = 0;
  const todayKey = sortedDates[sortedDates.length - 1];
  for (const item of items) {
    const value = todayKey ? itemValueAt(item, series, todayKey) : null;
    if (item.cardId) {
      cardCount += item.quantity;
      if (value != null) cardValue += value;
    } else if (item.sealedProductId) {
      sealedCount += item.quantity;
      if (value != null) sealedValue += value;
    }
  }

  const totalValue = cardValue + sealedValue;
  const costBasis = items.reduce((sum, item) => sum + (item.costPerUnit ?? 0) * item.quantity, 0);
  const unrealizedRoiPct = costBasis !== 0 ? (totalValue - costBasis) / costBasis : 0;

  const valueDelta30d = deltaOverDays(history, 30);

  return {
    summary: {
      totalValue,
      cardValue,
      sealedValue,
      cardCount,
      sealedCount,
      costBasis,
      unrealizedRoiPct,
      valueDelta30d,
    },
    history,
    costBasisHistory,
  };
}
