import { prisma } from "@/lib/prisma";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";
import { CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import type { PricePoint } from "@/lib/cards";

export type PnlSummary = {
  realizedProfit: number;
  unrealizedProfit: number;
  itemsWithUnknownCost: number;
};

export async function getPnlSummary(userId: string): Promise<PnlSummary> {
  const [items, realized] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId },
      select: { cardId: true, sealedProductId: true, condition: true, quantity: true, costPerUnit: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, profit: { not: null } },
      _sum: { profit: true },
    }),
  ]);

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

  return {
    realizedProfit: realized._sum.profit ? parseFloat(realized._sum.profit.toString()) : 0,
    unrealizedProfit,
    itemsWithUnknownCost,
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
  profit: number | null;
  soldAt: string;
  itemType: "card" | "sealed";
  itemId: string | null;
};

export async function getTransactionHistory(userId: string): Promise<TransactionListItem[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { soldAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    itemName: row.itemName,
    condition: row.condition,
    quantity: row.quantity,
    costPerUnit: row.costPerUnit != null ? parseFloat(row.costPerUnit.toString()) : null,
    salePricePerUnit: parseFloat(row.salePricePerUnit.toString()),
    profit: row.profit != null ? parseFloat(row.profit.toString()) : null,
    soldAt: row.soldAt.toISOString().slice(0, 10),
    itemType: row.cardId ? "card" : "sealed",
    itemId: row.cardId ?? row.sealedProductId ?? null,
  }));
}
