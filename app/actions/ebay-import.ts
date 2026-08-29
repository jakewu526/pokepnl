"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { fetchOrderFees, fetchSoldOrders, isPokemonRelated } from "@/lib/ebay-orders";
import { matchEbayListingToProduct } from "@/lib/ebay-product-match";
import { recomputePosition } from "@/lib/position";
import { MARKETPLACE_LABELS } from "@/lib/marketplace";

export type EbaySyncResult = {
  imported: number;
  skippedNonPokemon: number;
  skippedDuplicate: number;
  positionMismatch: number;
};

// Once a listing is matched to a catalog item, prefer that item's canonical
// name over the raw (often noisy/SEO-heavy) eBay title -- same convention
// sellCollectionItem (app/actions/collection.ts) uses for manually-entered
// sales, so imported and manual rows read consistently in the transactions
// list. Falls back to the raw title when there's no match.
async function resolveItemName(
  match: Awaited<ReturnType<typeof matchEbayListingToProduct>>,
  fallbackTitle: string
): Promise<string> {
  if (!match) return fallbackTitle;
  if (match.kind === "card") {
    const card = await prisma.card.findUnique({ where: { id: match.cardId }, select: { name: true } });
    return card?.name ?? fallbackTitle;
  }
  const sealedProduct = await prisma.sealedProduct.findUnique({
    where: { id: match.sealedProductId },
    select: { name: true },
  });
  return sealedProduct?.name ?? fallbackTitle;
}

export async function syncEbayOrders(): Promise<EbaySyncResult> {
  const session = await verifySession();

  const account = await prisma.ebayAccount.findUnique({ where: { userId: session.userId } });
  if (!account) {
    return { imported: 0, skippedNonPokemon: 0, skippedDuplicate: 0, positionMismatch: 0 };
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
  let positionMismatch = 0;

  for (const item of pokemonItems) {
    const externalId = `${item.orderId}:${item.lineItemId}`;
    const existing = await prisma.transaction.findUnique({
      where: { userId_externalId: { userId: session.userId, externalId } },
    });
    if (existing) {
      skippedDuplicate++;
      continue;
    }

    // Best-effort catalog match against the listing title -- see
    // lib/ebay-product-match.ts. A miss (null) leaves cardId/sealedProductId
    // unset, same as a manually-entered sale with no linked catalog item;
    // it's never treated as a failure that should abort the sync.
    const match = await matchEbayListingToProduct(item.title);
    const itemName = await resolveItemName(match, item.title);

    // A matched card/sealedProduct only decrements an existing position if
    // this user actually has one on record -- condition is read off *that*
    // row (same pattern sellCollectionItem uses) rather than assumed, since
    // cards keep per-condition positions (e.g. "NM") that a bare `null`
    // wouldn't match. No existing position at all means there's nothing of
    // ours to net this sale against, so the Transaction is still created
    // (for display/history) but recomputePosition is skipped entirely rather
    // than fabricating a phantom position or throwing on a negative balance.
    let condition: string | null = null;
    let existingPosition = false;
    let costPerUnit: number | null = null;
    if (match) {
      const where = match.kind === "card" ? { cardId: match.cardId } : { sealedProductId: match.sealedProductId };
      const position = await prisma.collectionItem.findFirst({ where: { userId: session.userId, ...where } });
      if (position) {
        condition = position.condition;
        existingPosition = true;
        costPerUnit = position.costPerUnit != null ? parseFloat(position.costPerUnit.toString()) : null;
      }
    }

    // Same profit formula as sellCollectionItem (app/actions/collection.ts):
    // cost basis is the position's weighted-average cost at sale time, fees
    // and shipping are per-sale totals rather than per-unit.
    const profit =
      costPerUnit != null
        ? (item.salePricePerUnit - costPerUnit) * item.quantity -
          (feesByOrderId.get(item.orderId) ?? 0) -
          (item.shippingCost ?? 0)
        : null;

    // The sale itself is always recorded, even if the position recompute
    // below fails -- a bad recompute (e.g. this sale would outnumber what's
    // recorded as bought, likely because the item was bought before this
    // tracker existed) is a data-quality mismatch to surface, not a reason
    // to silently drop the sale from history or abort the rest of the sync.
    await prisma.transaction.create({
      data: {
        userId: session.userId,
        cardId: match?.cardId ?? null,
        sealedProductId: match?.sealedProductId ?? null,
        itemName,
        condition,
        quantity: item.quantity,
        costPerUnit,
        salePricePerUnit: item.salePricePerUnit,
        shippingCost: item.shippingCost,
        feesTotal: feesByOrderId.get(item.orderId) ?? null,
        profit,
        soldAt: item.soldAt,
        marketplace: MARKETPLACE_LABELS.EBAY,
        externalId,
      },
    });
    imported++;

    if (existingPosition && match) {
      try {
        await prisma.$transaction(async (tx) => {
          await recomputePosition(tx, session.userId, {
            cardId: match.cardId,
            sealedProductId: match.sealedProductId,
            condition,
          });
        });
      } catch {
        positionMismatch++;
      }
    }
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

  return { imported, skippedNonPokemon, skippedDuplicate, positionMismatch };
}

export async function disconnectEbay(): Promise<void> {
  const session = await verifySession();
  await prisma.ebayAccount.deleteMany({ where: { userId: session.userId } });
  revalidatePath("/settings");
}
