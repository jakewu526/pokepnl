"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { fetchOrderFees, fetchSoldOrders, isPokemonRelated } from "@/lib/ebay-orders";

export type EbaySyncResult = {
  imported: number;
  skippedNonPokemon: number;
  skippedDuplicate: number;
};

export async function syncEbayOrders(): Promise<EbaySyncResult> {
  const session = await verifySession();

  const account = await prisma.ebayAccount.findUnique({ where: { userId: session.userId } });
  if (!account) {
    return { imported: 0, skippedNonPokemon: 0, skippedDuplicate: 0 };
  }

  const allItems = await fetchSoldOrders(session.userId, account.lastSyncedAt?.toISOString());
  const pokemonItems = allItems.filter(isPokemonRelated);
  const skippedNonPokemon = allItems.length - pokemonItems.length;

  // One fee lookup per distinct order, reused across that order's line items.
  const feesByOrderId = new Map<string, number | null>();
  for (const item of pokemonItems) {
    if (!feesByOrderId.has(item.orderId)) {
      feesByOrderId.set(item.orderId, await fetchOrderFees(session.userId, item.orderId));
    }
  }

  let imported = 0;
  let skippedDuplicate = 0;

  for (const item of pokemonItems) {
    const externalId = `${item.orderId}:${item.lineItemId}`;
    const existing = await prisma.transaction.findUnique({
      where: { userId_externalId: { userId: session.userId, externalId } },
    });
    if (existing) {
      skippedDuplicate++;
      continue;
    }

    await prisma.transaction.create({
      data: {
        userId: session.userId,
        itemName: item.title,
        quantity: item.quantity,
        salePricePerUnit: item.salePricePerUnit,
        shippingCost: item.shippingCost,
        feesTotal: feesByOrderId.get(item.orderId) ?? null,
        soldAt: item.soldAt,
        marketplace: "EBAY",
        externalId,
      },
    });
    imported++;
  }

  // Only advance the cursor after a fully successful pass, so a failed sync
  // retries the same window next time instead of silently losing orders.
  await prisma.ebayAccount.update({
    where: { userId: session.userId },
    data: { lastSyncedAt: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
  revalidatePath("/settings");

  return { imported, skippedNonPokemon, skippedDuplicate };
}

export async function disconnectEbay(): Promise<void> {
  const session = await verifySession();
  await prisma.ebayAccount.deleteMany({ where: { userId: session.userId } });
  revalidatePath("/settings");
}
