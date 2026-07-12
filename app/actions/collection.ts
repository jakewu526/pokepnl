"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";

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

export async function addToCollection(
  cardId: string,
  condition: string = "NM",
  costPerUnit?: number
): Promise<void> {
  const session = await verifySession();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.collectionItem.findUnique({
      where: { userId_cardId_condition: { userId: session.userId, cardId, condition } },
    });

    if (existing) {
      const mergedCost = mergeCost(
        existing.costPerUnit != null ? parseFloat(existing.costPerUnit.toString()) : null,
        existing.quantity,
        costPerUnit,
        1
      );
      await tx.collectionItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: 1 }, costPerUnit: mergedCost },
      });
    } else {
      await tx.collectionItem.create({
        data: { userId: session.userId, cardId, condition, costPerUnit },
      });
    }
  });

  revalidatePath("/collection");
  revalidatePath(`/cards/${cardId}`);
}

export async function addSealedToCollection(
  sealedProductId: string,
  costPerUnit?: number
): Promise<void> {
  const session = await verifySession();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.collectionItem.findUnique({
      where: { userId_sealedProductId: { userId: session.userId, sealedProductId } },
    });

    if (existing) {
      const mergedCost = mergeCost(
        existing.costPerUnit != null ? parseFloat(existing.costPerUnit.toString()) : null,
        existing.quantity,
        costPerUnit,
        1
      );
      await tx.collectionItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: 1 }, costPerUnit: mergedCost },
      });
    } else {
      await tx.collectionItem.create({
        data: { userId: session.userId, sealedProductId, costPerUnit },
      });
    }
  });

  revalidatePath("/collection");
  revalidatePath(`/sealed/${sealedProductId}`);
}

export async function removeFromCollection(collectionItemId: string): Promise<void> {
  const session = await verifySession();

  await prisma.$transaction(async (tx) => {
    const item = await tx.collectionItem.findFirst({
      where: { id: collectionItemId, userId: session.userId },
    });
    if (!item) return;

    if (item.quantity <= 1) {
      await tx.collectionItem.delete({ where: { id: item.id } });
    } else {
      await tx.collectionItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: 1 } },
      });
    }
  });

  revalidatePath("/collection");
}

export async function sellCollectionItem(
  collectionItemId: string,
  quantitySold: number,
  salePricePerUnit: number
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
    const profit = costPerUnit != null ? (salePricePerUnit - costPerUnit) * quantity : null;
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
        profit,
      },
    });

    if (quantity >= item.quantity) {
      await tx.collectionItem.delete({ where: { id: item.id } });
    } else {
      await tx.collectionItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: quantity } },
      });
    }
  });

  revalidatePath("/collection");
}
