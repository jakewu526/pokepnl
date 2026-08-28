"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { getPositionLedger, type PositionLedger } from "@/lib/pnl";
import { recomputePosition } from "@/lib/position";

// Parses a "YYYY-MM-DD" <input type="date"> value into a Date. Anchored to
// UTC midnight (not local midnight) so it round-trips exactly through the
// row's own `.toISOString().slice(0, 10)` display format regardless of the
// server's timezone.
function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function addToCollection(
  cardId: string,
  condition: string = "NM",
  costPerUnit?: number,
  quantity: number = 1,
  marketplace?: string
): Promise<void> {
  const session = await verifySession();
  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseLot.create({
      data: { userId: session.userId, cardId, condition, costPerUnit, quantity: qty, marketplace },
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
  costPerUnit?: number,
  quantity: number = 1,
  marketplace?: string
): Promise<void> {
  const session = await verifySession();
  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseLot.create({
      data: { userId: session.userId, sealedProductId, costPerUnit, quantity: qty, marketplace },
    });
    await recomputePosition(tx, session.userId, { cardId: null, sealedProductId, condition: null });
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
  updates: { quantity?: number; costPerUnit?: number | null; purchasedAt?: string; marketplace?: string | null }
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
      const marketplace = "marketplace" in updates ? updates.marketplace : lot.marketplace;

      await tx.purchaseLot.update({
        where: { id: lot.id },
        data: { quantity, costPerUnit, purchasedAt: purchasedAt ?? lot.purchasedAt, marketplace },
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
    marketplace?: string | null;
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
      const marketplace = "marketplace" in updates ? updates.marketplace : txn.marketplace;
      const costPerUnit = txn.costPerUnit != null ? parseFloat(txn.costPerUnit.toString()) : null;
      const feesValue = feesTotal != null ? parseFloat(feesTotal.toString()) : 0;
      const shippingValue = shippingCost != null ? parseFloat(shippingCost.toString()) : 0;
      const profit = costPerUnit != null ? (salePricePerUnit - costPerUnit) * quantity - feesValue - shippingValue : null;

      await tx.transaction.update({
        where: { id: txn.id },
        data: { quantity, salePricePerUnit, feesTotal, shippingCost, profit, soldAt: soldAt ?? txn.soldAt, marketplace },
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
  shippingCost?: number,
  marketplace?: string
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
        marketplace: marketplace ?? null,
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
