"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { verifySession } from "@/lib/dal";
import { getPositionLedger, type PositionLedger } from "@/lib/pnl";

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

type PositionKey = { cardId: string | null; sealedProductId: string | null; condition: string | null };

// Parses a "YYYY-MM-DD" <input type="date"> value into a Date. Anchored to
// UTC midnight (not local midnight) so it round-trips exactly through the
// row's own `.toISOString().slice(0, 10)` display format regardless of the
// server's timezone.
function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Positions are built from transactions, not maintained as independent state:
// this replays every PurchaseLot (via the same mergeCost weighted-average math
// used at write time) and nets out every Transaction for the same
// (userId, cardId|sealedProductId, condition) key, then makes CollectionItem
// match. Called at the end of every ledger-writing action (add, sell, and the
// lot/transaction edits below) inside the same $transaction as that write, so
// CollectionItem can never drift from its own ledger. Throws if an edit would
// reduce recorded purchases below what's already been sold -- callers catch
// that and surface it as a validation error.
async function recomputePosition(tx: Prisma.TransactionClient, userId: string, key: PositionKey): Promise<void> {
  const where = key.cardId
    ? { userId, cardId: key.cardId, condition: key.condition }
    : { userId, sealedProductId: key.sealedProductId, condition: key.condition };

  const lots = await tx.purchaseLot.findMany({ where, orderBy: { purchasedAt: "asc" } });

  let totalBought = 0;
  let costPerUnit: number | null = null;
  let earliestPurchasedAt: Date | null = null;
  for (const lot of lots) {
    const lotCost = lot.costPerUnit != null ? parseFloat(lot.costPerUnit.toString()) : undefined;
    costPerUnit = mergeCost(costPerUnit, totalBought, lotCost, lot.quantity);
    totalBought += lot.quantity;
    if (earliestPurchasedAt == null) earliestPurchasedAt = lot.purchasedAt;
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
  };
  if (existing) {
    await tx.collectionItem.update({ where: { id: existing.id }, data });
  } else {
    await tx.collectionItem.create({
      data: { userId, cardId: key.cardId, sealedProductId: key.sealedProductId, condition: key.condition, ...data },
    });
  }
}

export async function addToCollection(
  cardId: string,
  condition: string = "NM",
  costPerUnit?: number,
  quantity: number = 1
): Promise<void> {
  const session = await verifySession();
  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseLot.create({
      data: { userId: session.userId, cardId, condition, costPerUnit, quantity: qty },
    });
    await recomputePosition(tx, session.userId, { cardId, sealedProductId: null, condition });
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath(`/cards/${cardId}`);
}

export async function batchAddToCollection(
  items: { cardId: string; price: number | null }[]
): Promise<void> {
  const session = await verifySession();
  if (items.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const { cardId, price } of items) {
      const costPerUnit = price ?? undefined;
      await tx.purchaseLot.create({
        data: { userId: session.userId, cardId, condition: "NM", costPerUnit, quantity: 1 },
      });
      await recomputePosition(tx, session.userId, { cardId, sealedProductId: null, condition: "NM" });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/");
}

export async function addSealedToCollection(
  sealedProductId: string,
  condition: string = "Mint",
  costPerUnit?: number,
  quantity: number = 1
): Promise<void> {
  const session = await verifySession();
  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseLot.create({
      data: { userId: session.userId, sealedProductId, condition, costPerUnit, quantity: qty },
    });
    await recomputePosition(tx, session.userId, { cardId: null, sealedProductId, condition });
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath(`/sealed/${sealedProductId}`);
}

// Drill-down for the portfolio table's "History" button -- every buy/sell
// event that built up (or drew down) this position, keyed off the position's
// current cardId/sealedProductId/condition. See lib/pnl.ts's getPositionLedger
// for the matching + sync caveats.
export async function getPositionLedgerAction(collectionItemId: string): Promise<PositionLedger> {
  const session = await verifySession();

  const item = await prisma.collectionItem.findFirst({
    where: { id: collectionItemId, userId: session.userId },
    select: { cardId: true, sealedProductId: true, condition: true },
  });
  if (!item) return { purchases: [], sales: [] };

  return getPositionLedger(session.userId, {
    cardId: item.cardId,
    sealedProductId: item.sealedProductId,
    condition: item.condition,
  });
}

// Fix a wrong price/quantity on a past buy. Recomputes the owning position
// inside the same transaction so CollectionItem never drifts from its ledger;
// rejected (without writing anything) if it would undersell the position's
// own recorded sales.
export async function updatePurchaseLot(
  lotId: string,
  updates: { quantity?: number; costPerUnit?: number | null; purchasedAt?: string }
): Promise<{ error?: string }> {
  const session = await verifySession();

  if (updates.quantity != null && (!Number.isFinite(updates.quantity) || updates.quantity < 1)) {
    return { error: "Quantity must be at least 1." };
  }
  if (updates.costPerUnit != null && (!Number.isFinite(updates.costPerUnit) || updates.costPerUnit < 0)) {
    return { error: "Cost must be zero or more." };
  }
  const purchasedAt = updates.purchasedAt != null ? parseDateInput(updates.purchasedAt) : undefined;
  if (updates.purchasedAt != null && !purchasedAt) {
    return { error: "Invalid date." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.purchaseLot.findFirst({ where: { id: lotId, userId: session.userId } });
      if (!lot) throw new Error("Purchase not found.");

      const quantity = updates.quantity != null ? Math.floor(updates.quantity) : lot.quantity;
      const costPerUnit = "costPerUnit" in updates ? updates.costPerUnit : lot.costPerUnit;

      await tx.purchaseLot.update({
        where: { id: lot.id },
        data: { quantity, costPerUnit, purchasedAt: purchasedAt ?? lot.purchasedAt },
      });
      await recomputePosition(tx, session.userId, {
        cardId: lot.cardId,
        sealedProductId: lot.sealedProductId,
        condition: lot.condition,
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
  return {};
}

// Fix a wrong price/quantity/fees on a past sale. costPerUnit is never edited
// here -- it's what was actually paid, captured at sale time -- but profit is
// always recalculated from it. Same recompute-and-validate flow as
// updatePurchaseLot.
export async function updateTransaction(
  transactionId: string,
  updates: {
    quantity?: number;
    salePricePerUnit?: number;
    feesTotal?: number | null;
    shippingCost?: number | null;
    soldAt?: string;
  }
): Promise<{ error?: string }> {
  const session = await verifySession();

  if (updates.quantity != null && (!Number.isFinite(updates.quantity) || updates.quantity < 1)) {
    return { error: "Quantity must be at least 1." };
  }
  if (
    updates.salePricePerUnit != null &&
    (!Number.isFinite(updates.salePricePerUnit) || updates.salePricePerUnit < 0)
  ) {
    return { error: "Sale price must be zero or more." };
  }
  if (updates.feesTotal != null && (!Number.isFinite(updates.feesTotal) || updates.feesTotal < 0)) {
    return { error: "Fees must be zero or more." };
  }
  if (updates.shippingCost != null && (!Number.isFinite(updates.shippingCost) || updates.shippingCost < 0)) {
    return { error: "Shipping must be zero or more." };
  }
  const soldAt = updates.soldAt != null ? parseDateInput(updates.soldAt) : undefined;
  if (updates.soldAt != null && !soldAt) {
    return { error: "Invalid date." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.findFirst({ where: { id: transactionId, userId: session.userId } });
      if (!txn) throw new Error("Sale not found.");

      const quantity = updates.quantity != null ? Math.floor(updates.quantity) : txn.quantity;
      const salePricePerUnit =
        updates.salePricePerUnit != null ? updates.salePricePerUnit : parseFloat(txn.salePricePerUnit.toString());
      const feesTotal = "feesTotal" in updates ? updates.feesTotal : txn.feesTotal;
      const shippingCost = "shippingCost" in updates ? updates.shippingCost : txn.shippingCost;
      const costPerUnit = txn.costPerUnit != null ? parseFloat(txn.costPerUnit.toString()) : null;
      const feesValue = feesTotal != null ? parseFloat(feesTotal.toString()) : 0;
      const shippingValue = shippingCost != null ? parseFloat(shippingCost.toString()) : 0;
      const profit = costPerUnit != null ? (salePricePerUnit - costPerUnit) * quantity - feesValue - shippingValue : null;

      await tx.transaction.update({
        where: { id: txn.id },
        data: { quantity, salePricePerUnit, feesTotal, shippingCost, profit, soldAt: soldAt ?? txn.soldAt },
      });
      await recomputePosition(tx, session.userId, {
        cardId: txn.cardId,
        sealedProductId: txn.sealedProductId,
        condition: txn.condition,
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
  return {};
}

// Deletes an entire position: the CollectionItem plus every PurchaseLot and
// Transaction that fed it (same (userId, cardId|sealedProductId, condition)
// key recomputePosition uses). This is a full wipe of that position's
// history, not a quantity decrement -- the UI must confirm with the user
// before calling this, since it can't be undone.
export async function deletePosition(collectionItemId: string): Promise<void> {
  const session = await verifySession();

  await prisma.$transaction(async (tx) => {
    const item = await tx.collectionItem.findFirst({
      where: { id: collectionItemId, userId: session.userId },
    });
    if (!item) return;

    const where = item.cardId
      ? { userId: session.userId, cardId: item.cardId, condition: item.condition }
      : { userId: session.userId, sealedProductId: item.sealedProductId, condition: item.condition };

    await tx.transaction.deleteMany({ where });
    await tx.purchaseLot.deleteMany({ where });
    await tx.collectionItem.delete({ where: { id: item.id } });
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
}

export async function sellCollectionItem(
  collectionItemId: string,
  quantitySold: number,
  salePricePerUnit: number,
  feesTotal?: number,
  shippingCost?: number
): Promise<void> {
  const session = await verifySession();

  await prisma.$transaction(async (tx) => {
    const item = await tx.collectionItem.findFirst({
      where: { id: collectionItemId, userId: session.userId },
      include: { card: { select: { name: true } }, sealedProduct: { select: { name: true } } },
    });
    if (!item) return;

    const quantity = Math.max(1, Math.min(quantitySold, item.quantity));
    const costPerUnit = item.costPerUnit != null ? parseFloat(item.costPerUnit.toString()) : null;
    // Fees and shipping are per-SALE totals, not per-unit.
    const profit =
      costPerUnit != null
        ? (salePricePerUnit - costPerUnit) * quantity - (feesTotal ?? 0) - (shippingCost ?? 0)
        : null;
    const itemName = item.card?.name ?? item.sealedProduct?.name ?? "Unknown item";

    await tx.transaction.create({
      data: {
        userId: session.userId,
        cardId: item.cardId,
        sealedProductId: item.sealedProductId,
        itemName,
        condition: item.condition,
        quantity,
        costPerUnit,
        salePricePerUnit,
        feesTotal: feesTotal ?? null,
        shippingCost: shippingCost ?? null,
        profit,
      },
    });

    await recomputePosition(tx, session.userId, {
      cardId: item.cardId,
      sealedProductId: item.sealedProductId,
      condition: item.condition,
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
}
