import { prisma } from "@/lib/prisma";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";
import { CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import type { PricePoint } from "@/lib/cards";

export type PnlSummary = {
  realizedProfit: number;
  unrealizedProfit: number;
  itemsWithUnknownCost: number;
  realizedRevenue: number;
  realizedCogs: number;
  realizedFees: number;
  netMarginPct: number;
  realizedRoiPct: number;
};

export async function getPnlSummary(userId: string): Promise<PnlSummary> {
  const [items, realizedAgg] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId },
      select: { cardId: true, sealedProductId: true, condition: true, quantity: true, costPerUnit: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, profit: { not: null } },
      _sum: { profit: true, feesTotal: true, shippingCost: true },
    }),
  ]);

  // Revenue/COGS need per-row quantity math (salePricePerUnit * quantity),
  // which _sum can't express -- pull the rows once and reduce in JS.
  const soldRows = await prisma.transaction.findMany({
    where: { userId, profit: { not: null } },
    select: { quantity: true, costPerUnit: true, salePricePerUnit: true },
  });
  let realizedRevenue = 0;
  let realizedCogs = 0;
  for (const row of soldRows) {
    realizedRevenue += parseFloat(row.salePricePerUnit.toString()) * row.quantity;
    if (row.costPerUnit != null) {
      realizedCogs += parseFloat(row.costPerUnit.toString()) * row.quantity;
    }
  }

  const cardIds = items.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);
  const [cardPrices, sealedPrices] = await Promise.all([
    getLatestPrices(cardIds),
    getLatestSealedPrices(sealedIds),
  ]);

  let unrealizedProfit = 0;
  let itemsWithUnknownCost = 0;
  for (const item of items) {
    if (item.costPerUnit == null) {
      itemsWithUnknownCost += 1;
      continue;
    }
    const cost = parseFloat(item.costPerUnit.toString());
    if (item.cardId) {
      const priceInfo = cardPrices.get(item.cardId);
      if (!priceInfo) continue;
      const multiplier = CONDITION_MULTIPLIERS[(item.condition as Condition) ?? "NM"] ?? 1;
      unrealizedProfit += (priceInfo.price * multiplier - cost) * item.quantity;
    } else if (item.sealedProductId) {
      const priceInfo = sealedPrices.get(item.sealedProductId);
      if (!priceInfo) continue;
      unrealizedProfit += (priceInfo.price - cost) * item.quantity;
    }
  }

  const realizedProfit = realizedAgg._sum.profit ? parseFloat(realizedAgg._sum.profit.toString()) : 0;
  const realizedFees =
    (realizedAgg._sum.feesTotal ? parseFloat(realizedAgg._sum.feesTotal.toString()) : 0) +
    (realizedAgg._sum.shippingCost ? parseFloat(realizedAgg._sum.shippingCost.toString()) : 0);

  return {
    realizedProfit,
    unrealizedProfit,
    itemsWithUnknownCost,
    realizedRevenue,
    realizedCogs,
    realizedFees,
    netMarginPct: realizedRevenue !== 0 ? realizedProfit / realizedRevenue : 0,
    realizedRoiPct: realizedCogs !== 0 ? realizedProfit / realizedCogs : 0,
  };
}

export async function getRealizedProfitHistory(userId: string): Promise<PricePoint[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, profit: { not: null } },
    select: { profit: true, soldAt: true },
    orderBy: { soldAt: "asc" },
  });

  const byDate = new Map<string, number>();
  for (const row of rows) {
    const dateKey = row.soldAt.toISOString().slice(0, 10);
    const profit = parseFloat(row.profit!.toString());
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + profit);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  let running = 0;
  return sortedDates.map((date) => {
    running += byDate.get(date)!;
    return { date, price: running };
  });
}

export type TransactionListItem = {
  id: string;
  itemName: string;
  condition: string | null;
  quantity: number;
  costPerUnit: number | null;
  salePricePerUnit: number;
  feesTotal: number | null;
  shippingCost: number | null;
  profit: number | null;
  soldAt: string;
  marketplace: string | null;
  itemType: "card" | "sealed";
  itemId: string | null;
  imageUrl: string | null;
};

export async function getTransactionHistory(
  userId: string,
  limit?: number,
  skip?: number
): Promise<TransactionListItem[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { soldAt: "desc" },
    take: limit,
    skip,
    include: {
      card: { select: { imageUrl: true } },
      sealedProduct: { select: { imageUrl: true } },
    },
  });

  return rows.map((row) => ({
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
    marketplace: row.marketplace,
    // The card/sealed FKs are onDelete: SetNull, so a deleted item leaves
    // itemName populated but both relations null -- itemId/imageUrl fall
    // back to null rather than pointing at a row that no longer exists.
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  }));
}

export async function getTransactionCount(userId: string): Promise<number> {
  return prisma.transaction.count({ where: { userId } });
}

export type PurchaseListItem = {
  id: string;
  itemName: string;
  condition: string | null;
  quantity: number;
  costPerUnit: number | null;
  purchasedAt: string;
  marketplace: string | null;
  itemType: "card" | "sealed";
  itemId: string | null;
  imageUrl: string | null;
};

// The "buying" side of the transaction history -- current holdings, one row
// per position (not per individual buy event; see getPositionLedger for the
// per-event PurchaseLot view used by the portfolio table's drill-down).
export async function getPurchaseHistory(userId: string, limit?: number, skip?: number): Promise<PurchaseListItem[]> {
  const rows = await prisma.collectionItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip,
    include: {
      card: { select: { name: true, imageUrl: true } },
      sealedProduct: { select: { name: true, imageUrl: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    itemName: row.card?.name ?? row.sealedProduct?.name ?? "Unknown item",
    condition: row.condition,
    quantity: row.quantity,
    costPerUnit: row.costPerUnit != null ? parseFloat(row.costPerUnit.toString()) : null,
    purchasedAt: row.createdAt.toISOString().slice(0, 10),
    // CollectionItem's marketplace is the most recent PurchaseLot's (kept in
    // sync by recomputePosition) -- a merged position can be built from lots
    // bought in different places, so this is "most recently bought from,"
    // not a guaranteed single source. See getAllPurchaseLots/
    // getPositionLedger for the full per-event PurchaseLot marketplace.
    marketplace: row.marketplace,
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  }));
}

export async function getPurchaseCount(userId: string): Promise<number> {
  return prisma.collectionItem.count({ where: { userId } });
}

type PurchaseLotRow = {
  id: string;
  cardId: string | null;
  sealedProductId: string | null;
  condition: string | null;
  quantity: number;
  costPerUnit: { toString(): string } | null;
  purchasedAt: Date;
  marketplace: string | null;
  card: { name: string; imageUrl: string | null } | null;
  sealedProduct: { name: string; imageUrl: string | null } | null;
};

function mapPurchaseLotRow(row: PurchaseLotRow): PurchaseListItem {
  return {
    id: row.id,
    itemName: row.card?.name ?? row.sealedProduct?.name ?? "Unknown item",
    condition: row.condition,
    quantity: row.quantity,
    costPerUnit: row.costPerUnit != null ? parseFloat(row.costPerUnit.toString()) : null,
    purchasedAt: row.purchasedAt.toISOString().slice(0, 10),
    marketplace: row.marketplace,
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  };
}

// The individual buy-event ledger (every PurchaseLot row, never merged) --
// what /transactions shows and lets the user edit, as opposed to
// getPurchaseHistory's one-row-per-current-position view used for the
// dashboard's quick "recently added" glance.
export async function getAllPurchaseLots(userId: string, limit?: number, skip?: number): Promise<PurchaseListItem[]> {
  const rows = await prisma.purchaseLot.findMany({
    where: { userId },
    orderBy: { purchasedAt: "desc" },
    take: limit,
    skip,
    include: {
      card: { select: { name: true, imageUrl: true } },
      sealedProduct: { select: { name: true, imageUrl: true } },
    },
  });
  return rows.map(mapPurchaseLotRow);
}

export async function getPurchaseLotCount(userId: string): Promise<number> {
  return prisma.purchaseLot.count({ where: { userId } });
}

export type PositionLedger = {
  purchases: PurchaseListItem[];
  sales: TransactionListItem[];
};

// Drill-down for a single position (one CollectionItem's card/sealedProduct +
// condition key): every PurchaseLot that built it up, plus every Transaction
// that has ever sold out of it. Matches by the position's *current* condition
// string -- if a position's condition is edited later, older lots/sales
// recorded under the old value won't show up anymore (same key convention
// CollectionItem's own unique constraint already relies on).
export async function getPositionLedger(
  userId: string,
  key: { cardId: string | null; sealedProductId: string | null; condition: string | null }
): Promise<PositionLedger> {
  const where = key.cardId
    ? { userId, cardId: key.cardId, condition: key.condition }
    : { userId, sealedProductId: key.sealedProductId, condition: key.condition };

  const [lotRows, saleRows] = await Promise.all([
    prisma.purchaseLot.findMany({
      where,
      orderBy: { purchasedAt: "desc" },
      include: {
        card: { select: { name: true, imageUrl: true } },
        sealedProduct: { select: { name: true, imageUrl: true } },
      },
    }),
    prisma.transaction.findMany({
      where,
      orderBy: { soldAt: "desc" },
      include: {
        card: { select: { imageUrl: true } },
        sealedProduct: { select: { imageUrl: true } },
      },
    }),
  ]);

  const purchases: PurchaseListItem[] = lotRows.map(mapPurchaseLotRow);

  const sales: TransactionListItem[] = saleRows.map((row) => ({
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
    marketplace: row.marketplace,
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
    imageUrl: row.card?.imageUrl ?? row.sealedProduct?.imageUrl ?? null,
  }));

  return { purchases, sales };
}
