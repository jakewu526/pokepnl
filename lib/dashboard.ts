import { prisma } from "@/lib/prisma";
import { buildPortfolioSeries, itemValueAt } from "@/lib/portfolio";
import type { PurchaseListItem, TransactionListItem } from "@/lib/pnl";

const DAY_MS = 86_400_000;

export type MonthlyPerformance = { month: string; revenue: number; netProfit: number; units: number };

// Last 12 calendar months (oldest first, including empty months) grouped from
// Transaction. Explicit month keys rather than "whatever months have sales"
// so the bar chart has a stable x-axis even with a gap month.
export async function getMonthlyPerformance(userId: string): Promise<MonthlyPerformance[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const rows = await prisma.transaction.findMany({
    where: { userId, soldAt: { gte: start } },
    select: { soldAt: true, quantity: true, salePricePerUnit: true, profit: true },
  });

  const byMonth = new Map<string, { revenue: number; netProfit: number; units: number }>();
  for (const row of rows) {
    const key = row.soldAt.toISOString().slice(0, 7); // "YYYY-MM"
    const entry = byMonth.get(key) ?? { revenue: 0, netProfit: 0, units: 0 };
    entry.revenue += parseFloat(row.salePricePerUnit.toString()) * row.quantity;
    entry.netProfit += row.profit != null ? parseFloat(row.profit.toString()) : 0;
    entry.units += row.quantity;
    byMonth.set(key, entry);
  }

  const months: MonthlyPerformance[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
    const key = d.toISOString().slice(0, 7);
    const entry = byMonth.get(key) ?? { revenue: 0, netProfit: 0, units: 0 };
    months.push({ month: key, ...entry });
  }
  return months;
}

export type Mover = {
  name: string;
  imageUrl: string | null;
  setName: string | null;
  itemType: "card" | "sealed";
  itemId: string;
  changeAbs: number;
  changePct: number;
};

// Per-holding value now vs `days` ago, reusing the same price series
// getPortfolioData builds -- this must not re-query PriceSnapshot, since that
// query is already the most expensive thing on the dashboard. Extracted from
// getTopMovers so lib/narrative.ts can reuse the exact same math at a
// different window (7d) without a third definition of "how much did this
// holding move" existing in the codebase.
export async function computeMovers(userId: string, days: number): Promise<Mover[]> {
  const { items, cardSeries, sealedSeries, sortedDates } = await buildPortfolioSeries(userId);
  const series = { cardSeries, sealedSeries };
  const todayKey = sortedDates[sortedDates.length - 1];
  if (!todayKey) return [];

  const pastKey = new Date(new Date(todayKey).getTime() - days * DAY_MS).toISOString().slice(0, 10);

  const cardIds = [...new Set(items.filter((i) => i.cardId).map((i) => i.cardId!))];
  const sealedIds = [...new Set(items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!))];
  const [cards, sealedProducts] = await Promise.all([
    cardIds.length
      ? prisma.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, name: true, imageUrl: true, set: { select: { name: true } } },
        })
      : Promise.resolve([]),
    sealedIds.length
      ? prisma.sealedProduct.findMany({
          where: { id: { in: sealedIds } },
          select: { id: true, name: true, imageUrl: true, set: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const sealedById = new Map(sealedProducts.map((s) => [s.id, s]));

  const movers: Mover[] = [];
  for (const item of items) {
    const valueNow = itemValueAt(item, series, todayKey);
    const valuePast = itemValueAt(item, series, pastKey);
    if (valueNow == null || valuePast == null) continue;

    const id = item.cardId ?? item.sealedProductId!;
    const info = item.cardId ? cardById.get(id) : sealedById.get(id);
    if (!info) continue;

    const changeAbs = valueNow - valuePast;
    movers.push({
      name: info.name,
      imageUrl: info.imageUrl,
      setName: info.set?.name ?? null,
      itemType: item.cardId ? "card" : "sealed",
      itemId: id,
      changeAbs,
      changePct: valuePast !== 0 ? changeAbs / valuePast : 0,
    });
  }

  return movers;
}

export async function getTopMovers(userId: string, days = 30): Promise<{ gainers: Mover[]; losers: Mover[] }> {
  const movers = await computeMovers(userId, days);
  const gainers = movers
    .filter((m) => m.changeAbs > 0)
    .sort((a, b) => b.changeAbs - a.changeAbs)
    .slice(0, 5);
  const losers = movers
    .filter((m) => m.changeAbs < 0)
    .sort((a, b) => a.changeAbs - b.changeAbs)
    .slice(0, 5);

  return { gainers, losers };
}

export type Slice = { label: string; value: number; pct: number };

export async function getAllocation(userId: string): Promise<{ byType: Slice[]; topHoldings: Slice[] }> {
  const { items, cardSeries, sealedSeries, sortedDates } = await buildPortfolioSeries(userId);
  const series = { cardSeries, sealedSeries };
  const todayKey = sortedDates[sortedDates.length - 1];
  if (!todayKey) return { byType: [], topHoldings: [] };

  const cardIds = [...new Set(items.filter((i) => i.cardId).map((i) => i.cardId!))];
  const sealedIds = [...new Set(items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!))];
  const [cards, sealedProducts] = await Promise.all([
    cardIds.length
      ? prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    sealedIds.length
      ? prisma.sealedProduct.findMany({ where: { id: { in: sealedIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const sealedById = new Map(sealedProducts.map((s) => [s.id, s]));

  let cardValue = 0;
  let sealedValue = 0;
  const holdings: { label: string; value: number }[] = [];
  for (const item of items) {
    const value = itemValueAt(item, series, todayKey);
    if (value == null) continue;
    if (item.cardId) {
      cardValue += value;
      holdings.push({ label: cardById.get(item.cardId)?.name ?? "Unknown card", value });
    } else if (item.sealedProductId) {
      sealedValue += value;
      holdings.push({ label: sealedById.get(item.sealedProductId)?.name ?? "Unknown product", value });
    }
  }

  const totalValue = cardValue + sealedValue;
  const pct = (v: number) => (totalValue !== 0 ? v / totalValue : 0);

  const byType: Slice[] = [
    { label: "Cards", value: cardValue, pct: pct(cardValue) },
    { label: "Sealed", value: sealedValue, pct: pct(sealedValue) },
  ];

  const topHoldings: Slice[] = holdings
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((h) => ({ label: h.label, value: h.value, pct: pct(h.value) }));

  return { byType, topHoldings };
}

export type AgingBucket = { bucket: string; itemCount: number; costBasis: number };

const AGING_BUCKETS = [
  { label: "0-30 days", min: 0, max: 30 },
  { label: "31-90 days", min: 31, max: 90 },
  { label: "91-180 days", min: 91, max: 180 },
  { label: "180+ days", min: 181, max: Infinity },
];

export async function getInventoryAging(userId: string): Promise<AgingBucket[]> {
  const items = await prisma.collectionItem.findMany({
    where: { userId },
    select: { quantity: true, costPerUnit: true, createdAt: true },
  });

  const now = Date.now();
  const buckets = AGING_BUCKETS.map((b) => ({ bucket: b.label, itemCount: 0, costBasis: 0 }));

  for (const item of items) {
    const ageDays = Math.floor((now - item.createdAt.getTime()) / DAY_MS);
    const bucketIndex = AGING_BUCKETS.findIndex((b) => ageDays >= b.min && ageDays <= b.max);
    if (bucketIndex === -1) continue;
    buckets[bucketIndex].itemCount += item.quantity;
    if (item.costPerUnit != null) {
      buckets[bucketIndex].costBasis += parseFloat(item.costPerUnit.toString()) * item.quantity;
    }
  }

  return buckets;
}

export type DataQualityCheck = {
  id: "price-coverage" | "cost-coverage" | "freshness";
  label: string;
  detail: string;
  state: "ok" | "warn" | "fail";
};

export type DataQuality = {
  itemsMissingCost: number;
  itemsMissingPrice: number;
  latestSnapshotDate: string | null;
  isStale: boolean;
  totalItems: number;
  score: number; // 0-1, see the weighted blend below
  checks: DataQualityCheck[];
};

// Shared ok/warn/fail thresholds for the two coverage ratios (price, cost).
// Freshness gets its own time-bucketed mapping below instead, since it isn't
// a smooth ratio and the pre-existing ">48h" stale cutoff is worth keeping.
function stateFromRatio(ratio: number): "ok" | "warn" | "fail" {
  if (ratio >= 0.9) return "ok";
  if (ratio >= 0.7) return "warn";
  return "fail";
}

export async function getDataQuality(userId: string): Promise<DataQuality> {
  const { items, cardSeries, sealedSeries, sortedDates } = await buildPortfolioSeries(userId);
  const series = { cardSeries, sealedSeries };
  const todayKey = sortedDates[sortedDates.length - 1];

  let itemsMissingCost = 0;
  let itemsMissingPrice = 0;
  for (const item of items) {
    if (item.costPerUnit == null) itemsMissingCost += 1;
    // getPnlSummary silently skips items with no price data without counting
    // them -- count that gap here so it's visible instead of just absorbed
    // into a smaller unrealizedProfit number.
    if (!todayKey || itemValueAt(item, series, todayKey) == null) itemsMissingPrice += 1;
  }
  const totalItems = items.length;

  const latest = await prisma.priceSnapshot.aggregate({ _max: { capturedDate: true } });
  const latestSnapshotDate = latest._max.capturedDate
    ? latest._max.capturedDate.toISOString().slice(0, 10)
    : null;
  const snapshotAgeMs = latest._max.capturedDate ? Date.now() - latest._max.capturedDate.getTime() : null;
  const isStale = snapshotAgeMs != null ? snapshotAgeMs > 48 * 60 * 60 * 1000 : false;

  if (totalItems === 0) {
    return {
      itemsMissingCost,
      itemsMissingPrice,
      latestSnapshotDate,
      isStale,
      totalItems,
      score: 1,
      checks: [
        { id: "price-coverage", label: "Price coverage", detail: "No holdings yet", state: "ok" },
        { id: "cost-coverage", label: "Cost basis coverage", detail: "No holdings yet", state: "ok" },
        {
          id: "freshness",
          label: "Price freshness",
          detail: latestSnapshotDate ? `Last captured ${latestSnapshotDate}` : "No snapshots captured yet",
          state: "ok",
        },
      ],
    };
  }

  // Weighted blend of three coverage signals. Price coverage matters most --
  // an unpriced item silently zeroes out of every total on the page. Cost
  // coverage matters less -- a missing cost basis only breaks P&L, not
  // portfolio value. Freshness matters least -- a stale-but-present price is
  // still directionally useful, unlike a missing one.
  //   score = 0.5*priceCoverage + 0.3*costCoverage + 0.2*freshness
  const priceCoverage = (totalItems - itemsMissingPrice) / totalItems;
  const costCoverage = (totalItems - itemsMissingCost) / totalItems;
  const freshness =
    snapshotAgeMs == null
      ? 0
      : snapshotAgeMs < 24 * 60 * 60 * 1000
        ? 1
        : snapshotAgeMs < 48 * 60 * 60 * 1000
          ? 0.6
          : snapshotAgeMs < 7 * 24 * 60 * 60 * 1000
            ? 0.2
            : 0;
  const score = 0.5 * priceCoverage + 0.3 * costCoverage + 0.2 * freshness;

  const checks: DataQualityCheck[] = [
    {
      id: "price-coverage",
      label: "Price coverage",
      detail:
        itemsMissingPrice === 0
          ? `All ${totalItems} holdings priced`
          : `${Math.round(priceCoverage * 100)}% of holdings priced (${itemsMissingPrice} of ${totalItems} missing)`,
      state: stateFromRatio(priceCoverage),
    },
    {
      id: "cost-coverage",
      label: "Cost basis coverage",
      detail:
        itemsMissingCost === 0
          ? `All ${totalItems} holdings have a cost basis`
          : `${Math.round(costCoverage * 100)}% of holdings have a cost basis (${itemsMissingCost} of ${totalItems} missing)`,
      state: stateFromRatio(costCoverage),
    },
    {
      id: "freshness",
      label: "Price freshness",
      detail: latestSnapshotDate ? `Prices last updated ${latestSnapshotDate}` : "No price data captured yet",
      state:
        snapshotAgeMs == null
          ? "fail"
          : snapshotAgeMs < 24 * 60 * 60 * 1000
            ? "ok"
            : snapshotAgeMs < 48 * 60 * 60 * 1000
              ? "warn"
              : "fail",
    },
  ];

  return { itemsMissingCost, itemsMissingPrice, latestSnapshotDate, isStale, totalItems, score, checks };
}

export type TimelineDay = {
  date: string; // "YYYY-MM-DD", local
  added: { count: number; amount: number; names: string[] };
  sold: { count: number; amount: number; names: string[] };
};

export type CollectionTimeline = {
  days: TimelineDay[]; // contiguous, oldest first -- includes empty days
  firstActivity: string | null;
  totalAdded: number;
  totalSold: number;
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Minimum span the track always draws, even for an account created an hour
// ago. A brand-new user gets a fortnight of runway with today's additions
// pinned at the right-hand end, rather than a single dot floating in an empty
// rail -- the dashboard should never look punitive about being new.
const MIN_TIMELINE_DAYS = 14;
const MAX_TIMELINE_DAYS = 365;

// Buys and sells on one contiguous daily track. Deliberately *not* gated on
// having history: the span simply widens as the account ages, which is the
// "grows rather than unlocks" behaviour -- nothing here is hidden and then
// revealed at a threshold.
export async function getCollectionTimeline(userId: string): Promise<CollectionTimeline> {
  const [items, transactions] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId },
      select: {
        createdAt: true,
        quantity: true,
        costPerUnit: true,
        card: { select: { name: true } },
        sealedProduct: { select: { name: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: { soldAt: true, quantity: true, salePricePerUnit: true, itemName: true },
    }),
  ]);

  const byDay = new Map<string, TimelineDay>();
  function slot(key: string): TimelineDay {
    let entry = byDay.get(key);
    if (!entry) {
      entry = { date: key, added: { count: 0, amount: 0, names: [] }, sold: { count: 0, amount: 0, names: [] } };
      byDay.set(key, entry);
    }
    return entry;
  }

  for (const item of items) {
    const entry = slot(dayKey(item.createdAt));
    const cost = item.costPerUnit != null ? parseFloat(item.costPerUnit.toString()) : 0;
    entry.added.count += item.quantity;
    entry.added.amount += cost * item.quantity;
    const name = item.card?.name ?? item.sealedProduct?.name;
    if (name && entry.added.names.length < 4) entry.added.names.push(name);
  }

  for (const tx of transactions) {
    const entry = slot(dayKey(tx.soldAt));
    entry.sold.count += tx.quantity;
    entry.sold.amount += parseFloat(tx.salePricePerUnit.toString()) * tx.quantity;
    if (entry.sold.names.length < 4) entry.sold.names.push(tx.itemName);
  }

  const keys = Array.from(byDay.keys()).sort();
  const firstActivity = keys[0] ?? null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  const earliest = firstActivity ? new Date(`${firstActivity}T00:00:00`) : today;
  const spanDays = Math.min(
    MAX_TIMELINE_DAYS,
    Math.max(MIN_TIMELINE_DAYS, Math.round((today.getTime() - earliest.getTime()) / DAY_MS) + 1)
  );
  start.setDate(start.getDate() - (spanDays - 1));

  const days: TimelineDay[] = [];
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    days.push(byDay.get(key) ?? { date: key, added: { count: 0, amount: 0, names: [] }, sold: { count: 0, amount: 0, names: [] } });
  }

  return {
    days,
    firstActivity,
    totalAdded: items.reduce((sum, i) => sum + i.quantity, 0),
    totalSold: transactions.reduce((sum, t) => sum + t.quantity, 0),
  };
}

export type DayActivity = {
  date: string;
  purchases: PurchaseListItem[];
  sales: TransactionListItem[];
};

// The full-detail counterpart to a single day of getCollectionTimeline's
// aggregates -- same two tables, same day, but real rows instead of counts,
// for the click-through modal on the timeline.
export async function getDayActivity(userId: string, date: string): Promise<DayActivity> {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [items, transactions] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "desc" },
      include: {
        card: { select: { name: true, imageUrl: true } },
        sealedProduct: { select: { name: true, imageUrl: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { userId, soldAt: { gte: start, lt: end } },
      orderBy: { soldAt: "desc" },
      include: {
        card: { select: { imageUrl: true } },
        sealedProduct: { select: { imageUrl: true } },
      },
    }),
  ]);

  const purchases: PurchaseListItem[] = items.map((row) => ({
    id: row.id,
    itemName: row.card?.name ?? row.sealedProduct?.name ?? "Unknown item",
    condition: row.condition,
    quantity: row.quantity,
    costPerUnit: row.costPerUnit != null ? parseFloat(row.costPerUnit.toString()) : null,
    purchasedAt: row.createdAt.toISOString().slice(0, 10),
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  }));

  const sales: TransactionListItem[] = transactions.map((row) => ({
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
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  }));

  return { date, purchases, sales };
}
