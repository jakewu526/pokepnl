import "server-only";
import { Prisma } from "@/app/generated/prisma/client";

// Weighted-average cost basis when the same item is added again. Omitting a
// cost on a repeat add means "no new information," not "$0" -- keep
// whatever cost basis (if any) is already known.
function mergeCost(
  existingCost: number | null,
  existingQty: number,
  incomingCost: number | undefined,
  incomingQty: number
): number | null {
  if (incomingCost == null) return existingCost;
  if (existingCost == null) return incomingCost;
  return (existingCost * existingQty + incomingCost * incomingQty) / (existingQty + incomingQty);
}

export type PositionKey = { cardId: string | null; sealedProductId: string | null; condition: string | null };

// Positions are built from transactions, not maintained as independent state:
// this replays every PurchaseLot (via the same mergeCost weighted-average math
// used at write time) and nets out every Transaction for the same
// (userId, cardId|sealedProductId, condition) key, then makes CollectionItem
// match. Called at the end of every ledger-writing action (add, sell, and the
// lot/transaction edits in app/actions/collection.ts and
// app/actions/ebay-import.ts) inside the same $transaction as that write, so
// CollectionItem can never drift from its own ledger. Throws if an edit would
// reduce recorded purchases below what's already been sold -- callers catch
// that and surface it as a validation error.
export async function recomputePosition(
  tx: Prisma.TransactionClient,
  userId: string,
  key: PositionKey
): Promise<void> {
  const where = key.cardId
    ? { userId, cardId: key.cardId, condition: key.condition }
    : { userId, sealedProductId: key.sealedProductId, condition: key.condition };

  const lots = await tx.purchaseLot.findMany({ where, orderBy: { purchasedAt: "asc" } });

  let totalBought = 0;
  let costPerUnit: number | null = null;
  let earliestPurchasedAt: Date | null = null;
  let latestMarketplace: string | null = null;
  for (const lot of lots) {
    const lotCost = lot.costPerUnit != null ? parseFloat(lot.costPerUnit.toString()) : undefined;
    costPerUnit = mergeCost(costPerUnit, totalBought, lotCost, lot.quantity);
    totalBought += lot.quantity;
    if (earliestPurchasedAt == null) earliestPurchasedAt = lot.purchasedAt;
    // Lots are ordered ascending by purchasedAt, so the last one processed is
    // the most recent -- keep overwriting so this ends up as that lot's value.
    latestMarketplace = lot.marketplace;
  }

  const soldAgg = await tx.transaction.aggregate({ where, _sum: { quantity: true } });
  const soldQty = soldAgg._sum.quantity ?? 0;
  const remaining = totalBought - soldQty;

  const existing = await tx.collectionItem.findFirst({ where });

  if (remaining < 0) {
    throw new Error("This would reduce recorded purchases below what's already been sold.");
  }
  if (remaining === 0) {
    if (existing) await tx.collectionItem.delete({ where: { id: existing.id } });
    return;
  }

  const data = {
    quantity: remaining,
    costPerUnit,
    createdAt: earliestPurchasedAt ?? new Date(),
    marketplace: latestMarketplace,
  };
  if (existing) {
    await tx.collectionItem.update({ where: { id: existing.id }, data });
  } else {
    await tx.collectionItem.create({
      data: { userId, cardId: key.cardId, sealedProductId: key.sealedProductId, condition: key.condition, ...data },
    });
  }
}
