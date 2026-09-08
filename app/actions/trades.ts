"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { recomputePosition, mergeCost } from "@/lib/position";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";
import { marketPriceFor } from "@/lib/portfolio";

type ItemWithNames = { card: { name: string } | null; sealedProduct: { name: string } | null };

function itemLabel(item: ItemWithNames): string {
  return item.card?.name ?? item.sealedProduct?.name ?? "Unknown item";
}

async function areFriends(userIdA: string, userIdB: string): Promise<boolean> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userIdA, addresseeId: userIdB },
        { requesterId: userIdB, addresseeId: userIdA },
      ],
    },
  });
  return !!friendship;
}

// ---------- shared reads used by the trade pickers ----------

export type TradeableItem = {
  collectionItemId: string;
  name: string;
  imageUrl: string | null;
  subtitle: string;
  condition: string | null;
  quantity: number;
  cardId: string | null;
  sealedProductId: string | null;
};

// Simplified list for the "pick cards to trade away" UI (MultiItemPicker) --
// used by the manual-trade modal, the live-trade proposer/recipient pickers,
// and (via getMyCollectionForSale in app/actions/collection.ts) the sell
// picker -- none of which can rely on a page's own server-fetched props
// since they can be opened from anywhere via the green button overlay.
export async function getMyCollectionForTrade(): Promise<TradeableItem[]> {
  const session = await verifySession();
  const items = await prisma.collectionItem.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      card: { select: { name: true, imageUrl: true, set: { select: { name: true } } } },
      sealedProduct: { select: { name: true, imageUrl: true, set: { select: { name: true } } } },
    },
  });
  return items.map((item) => ({
    collectionItemId: item.id,
    name: itemLabel(item),
    imageUrl: item.card?.imageUrl ?? item.sealedProduct?.imageUrl ?? null,
    subtitle: item.card?.set.name ?? item.sealedProduct?.set?.name ?? "",
    condition: item.condition,
    quantity: item.quantity,
    cardId: item.cardId,
    sealedProductId: item.sealedProductId,
  }));
}

// ---------- manual trade (trade partner doesn't use the app) ----------

export async function logManualTrade(input: {
  givenItems: { collectionItemId: string; quantity: number }[];
  receivedItems: { cardId?: string; sealedProductId?: string; condition?: string; quantity: number }[];
  counterpartyNote?: string;
}): Promise<{ error?: string }> {
  const session = await verifySession();

  if (!input.givenItems?.length) return { error: "Pick at least one card to give away." };
  if (!input.receivedItems?.length) return { error: "Pick at least one card you received." };

  const givenIds = input.givenItems.map((g) => g.collectionItemId);
  if (new Set(givenIds).size !== givenIds.length) return { error: "You picked the same card twice." };
  for (const g of input.givenItems) {
    if (!Number.isFinite(g.quantity) || g.quantity < 1) return { error: "Quantity given must be at least 1." };
  }
  for (const r of input.receivedItems) {
    if (!r.cardId && !r.sealedProductId) return { error: "Pick the cards you received." };
    if (!Number.isFinite(r.quantity) || r.quantity < 1) return { error: "Quantity received must be at least 1." };
  }

  const givenItems = await prisma.collectionItem.findMany({
    where: { id: { in: givenIds }, userId: session.userId },
    include: { card: { select: { name: true } }, sealedProduct: { select: { name: true } } },
  });
  if (givenItems.length !== givenIds.length) return { error: "One of those items isn't in your collection." };
  const givenById = new Map(givenItems.map((g) => [g.id, g]));

  // Market-price lookup only feeds CollectionItem.costPerUnit under the hood
  // (so portfolio value math keeps working) -- never shown to the user as a
  // "cost" or "profit" figure for a trade. See the plain-language rule.
  const receivedCardIds = input.receivedItems.filter((r) => r.cardId).map((r) => r.cardId!);
  const receivedSealedIds = input.receivedItems.filter((r) => r.sealedProductId).map((r) => r.sealedProductId!);
  const [cards, sealedProducts, cardPrices, sealedPrices] = await Promise.all([
    receivedCardIds.length
      ? prisma.card.findMany({ where: { id: { in: receivedCardIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    receivedSealedIds.length
      ? prisma.sealedProduct.findMany({ where: { id: { in: receivedSealedIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    receivedCardIds.length ? getLatestPrices(receivedCardIds) : Promise.resolve(new Map()),
    receivedSealedIds.length ? getLatestSealedPrices(receivedSealedIds) : Promise.resolve(new Map()),
  ]);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const sealedById = new Map(sealedProducts.map((s) => [s.id, s]));

  const resolvedReceived = input.receivedItems.map((r) => {
    const card = r.cardId ? cardById.get(r.cardId) : undefined;
    const sealed = r.sealedProductId ? sealedById.get(r.sealedProductId) : undefined;
    const condition = card ? r.condition || "NM" : null;
    const marketPrice = marketPriceFor(
      { cardId: card?.id ?? null, sealedProductId: sealed?.id ?? null, condition },
      cardPrices,
      sealedPrices
    );
    return {
      cardId: card?.id ?? null,
      sealedProductId: sealed?.id ?? null,
      condition,
      quantity: Math.max(1, Math.floor(r.quantity)),
      itemName: card?.name ?? sealed?.name ?? null,
      marketPrice,
    };
  });
  if (resolvedReceived.some((r) => !r.cardId && !r.sealedProductId)) return { error: "Couldn't find one of those cards." };

  const groupId = randomUUID();
  const tradedAt = new Date();
  const note = input.counterpartyNote?.trim() || null;

  await prisma.$transaction(async (tx) => {
    for (const g of input.givenItems) {
      const item = givenById.get(g.collectionItemId)!;
      const givenQty = Math.max(1, Math.min(Math.floor(g.quantity), item.quantity));

      // Given side: decrement/delete directly. Deliberately NOT
      // recomputePosition -- that rebuilds quantity purely from
      // PurchaseLot/Transaction sums, so calling it here (with no matching
      // ledger row for this decrement) would silently undo it. A trade
      // isn't a sale, so no Transaction row either.
      const remaining = item.quantity - givenQty;
      if (remaining <= 0) {
        await tx.collectionItem.delete({ where: { id: item.id } });
      } else {
        await tx.collectionItem.update({ where: { id: item.id }, data: { quantity: remaining } });
      }

      await tx.trade.create({
        data: {
          userId: session.userId,
          source: "MANUAL",
          direction: "GIVEN",
          groupId,
          cardId: item.cardId,
          sealedProductId: item.sealedProductId,
          condition: item.condition,
          quantity: givenQty,
          itemName: itemLabel(item),
          counterpartyNote: note,
          tradedAt,
        },
      });
    }

    for (const r of resolvedReceived) {
      // Received side: normal ledger path, same as addToCollection -- this
      // is a genuinely new position for this user.
      await tx.purchaseLot.create({
        data: {
          userId: session.userId,
          cardId: r.cardId,
          sealedProductId: r.sealedProductId,
          condition: r.condition,
          quantity: r.quantity,
          costPerUnit: r.marketPrice ?? undefined,
        },
      });
      await recomputePosition(tx, session.userId, {
        cardId: r.cardId,
        sealedProductId: r.sealedProductId,
        condition: r.condition,
      });

      await tx.trade.create({
        data: {
          userId: session.userId,
          source: "MANUAL",
          direction: "RECEIVED",
          groupId,
          cardId: r.cardId,
          sealedProductId: r.sealedProductId,
          condition: r.condition,
          quantity: r.quantity,
          itemName: r.itemName!,
          counterpartyNote: note,
          tradedAt,
        },
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
  return {};
}

// ---------- live trade (both accounts are on the app, must be friends) ----------

export async function proposeTradeOffer(
  recipientUserId: string,
  items: { collectionItemId: string; quantity: number }[]
): Promise<{ offerId: string } | { error: string }> {
  const session = await verifySession();
  if (recipientUserId === session.userId) return { error: "Pick a friend to trade with." };
  if (!items?.length) return { error: "Pick at least one card to offer." };

  const ids = items.map((i) => i.collectionItemId);
  if (new Set(ids).size !== ids.length) return { error: "You picked the same card twice." };

  if (!(await areFriends(session.userId, recipientUserId))) {
    return { error: "You can only propose a trade to a friend." };
  }

  const ownedItems = await prisma.collectionItem.findMany({ where: { id: { in: ids }, userId: session.userId } });
  if (ownedItems.length !== items.length) return { error: "One of those items isn't in your collection." };
  const ownedById = new Map(ownedItems.map((i) => [i.id, i]));

  const offer = await prisma.tradeOffer.create({
    data: {
      proposerId: session.userId,
      recipientId: recipientUserId,
      items: {
        create: items.map((i) => {
          const owned = ownedById.get(i.collectionItemId)!;
          const quantity = Math.max(1, Math.min(Math.floor(i.quantity) || 1, owned.quantity));
          return { side: "PROPOSER" as const, collectionItemId: i.collectionItemId, quantity };
        }),
      },
    },
  });
  return { offerId: offer.id };
}

export async function setMyOfferedItems(
  offerId: string,
  items: { collectionItemId: string; quantity: number }[]
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!items?.length) return { error: "Pick at least one card." };

  const ids = items.map((i) => i.collectionItemId);
  if (new Set(ids).size !== ids.length) return { error: "You picked the same card twice." };

  const offer = await prisma.tradeOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "PENDING") return { error: "This trade is no longer open." };
  const isProposer = offer.proposerId === session.userId;
  const isRecipient = offer.recipientId === session.userId;
  if (!isProposer && !isRecipient) return { error: "Not your trade." };

  const ownedItems = await prisma.collectionItem.findMany({ where: { id: { in: ids }, userId: session.userId } });
  if (ownedItems.length !== items.length) return { error: "One of those items isn't in your collection." };
  const ownedById = new Map(ownedItems.map((i) => [i.id, i]));
  const side = isProposer ? "PROPOSER" : "RECIPIENT";

  // Changing the offered set resets that side's confirmation -- a stale
  // "confirmed" must not survive a swapped-out set of cards.
  await prisma.$transaction(async (tx) => {
    await tx.tradeOfferItem.deleteMany({ where: { tradeOfferId: offerId, side } });
    await tx.tradeOfferItem.createMany({
      data: items.map((i) => {
        const owned = ownedById.get(i.collectionItemId)!;
        const quantity = Math.max(1, Math.min(Math.floor(i.quantity) || 1, owned.quantity));
        return { tradeOfferId: offerId, side, collectionItemId: i.collectionItemId, quantity };
      }),
    });
    await tx.tradeOffer.update({
      where: { id: offerId },
      data: isProposer ? { proposerConfirmed: false } : { recipientConfirmed: false },
    });
  });
  return {};
}

// Transfers `quantity` units of the CollectionItem `sourceItemId` to
// destUserId. Deliberately does not touch PurchaseLot/Transaction on either
// side -- this is a transfer between two real, already-ledger-backed
// positions, not a new acquisition, so fabricating a PurchaseLot would
// corrupt both users' buy history (the giver would still "show" as having
// bought something they no longer own, and the receiver would show a
// purchase that never happened).
//
// Re-fetches the source row fresh (rather than trusting a snapshot the
// caller took before the transaction's own writes) because a multi-item
// trade can call this more than once per confirmTradeOffer transaction --
// e.g. both sides offering the same card+condition means the first call's
// destination merge lands on the exact row the second call treats as its
// source, and a stale quantity there would delete a row that had since
// been topped back up instead of correctly decrementing it.
async function transferItem(
  tx: Prisma.TransactionClient,
  sourceItemId: string,
  quantity: number,
  destUserId: string
): Promise<void> {
  const sourceItem = await tx.collectionItem.findUniqueOrThrow({ where: { id: sourceItemId } });
  const remaining = sourceItem.quantity - quantity;
  if (remaining <= 0) {
    await tx.collectionItem.delete({ where: { id: sourceItem.id } });
  } else {
    await tx.collectionItem.update({ where: { id: sourceItem.id }, data: { quantity: remaining } });
  }

  const sourceCost = sourceItem.costPerUnit != null ? parseFloat(sourceItem.costPerUnit.toString()) : undefined;
  const where = sourceItem.cardId
    ? { userId: destUserId, cardId: sourceItem.cardId, condition: sourceItem.condition }
    : { userId: destUserId, sealedProductId: sourceItem.sealedProductId, condition: sourceItem.condition };

  const existing = await tx.collectionItem.findFirst({ where });
  if (existing) {
    const existingCost = existing.costPerUnit != null ? parseFloat(existing.costPerUnit.toString()) : null;
    const blended = mergeCost(existingCost, existing.quantity, sourceCost, quantity);
    await tx.collectionItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity, costPerUnit: blended },
    });
  } else {
    await tx.collectionItem.create({
      data: {
        userId: destUserId,
        cardId: sourceItem.cardId,
        sealedProductId: sourceItem.sealedProductId,
        condition: sourceItem.condition,
        quantity,
        costPerUnit: sourceCost,
      },
    });
  }
}

export async function confirmTradeOffer(offerId: string): Promise<{ error?: string }> {
  const session = await verifySession();

  try {
    await prisma.$transaction(async (tx) => {
      const offer = await tx.tradeOffer.findUnique({ where: { id: offerId } });
      if (!offer || offer.status !== "PENDING") throw new Error("This trade is no longer open.");
      const isProposer = offer.proposerId === session.userId;
      const isRecipient = offer.recipientId === session.userId;
      if (!isProposer && !isRecipient) throw new Error("Not your trade.");

      const mySide = isProposer ? "PROPOSER" : "RECIPIENT";
      const myItemCount = await tx.tradeOfferItem.count({ where: { tradeOfferId: offerId, side: mySide } });
      if (myItemCount === 0) throw new Error("Pick at least one card before confirming.");

      const updated = await tx.tradeOffer.update({
        where: { id: offerId },
        data: isProposer ? { proposerConfirmed: true } : { recipientConfirmed: true },
      });

      if (!updated.proposerConfirmed || !updated.recipientConfirmed) return;

      const includeItem = {
        collectionItem: {
          include: { card: { select: { name: true } }, sealedProduct: { select: { name: true } } },
        },
      } as const;
      const [proposerItems, recipientItems] = await Promise.all([
        tx.tradeOfferItem.findMany({ where: { tradeOfferId: offerId, side: "PROPOSER" }, include: includeItem }),
        tx.tradeOfferItem.findMany({ where: { tradeOfferId: offerId, side: "RECIPIENT" }, include: includeItem }),
      ]);

      const stillValid =
        proposerItems.length > 0 &&
        recipientItems.length > 0 &&
        proposerItems.every(
          (i) => i.collectionItem.userId === updated.proposerId && i.collectionItem.quantity >= i.quantity
        ) &&
        recipientItems.every(
          (i) => i.collectionItem.userId === updated.recipientId && i.collectionItem.quantity >= i.quantity
        );

      if (!stillValid) {
        await tx.tradeOffer.update({ where: { id: offerId }, data: { status: "CANCELLED" } });
        throw new Error("One of the offered cards is no longer available. Trade cancelled.");
      }

      const tradedAt = new Date();
      const proposerGroupId = randomUUID();
      const recipientGroupId = randomUUID();

      for (const offerItem of proposerItems) {
        const { cardId, sealedProductId, condition } = offerItem.collectionItem;
        const name = itemLabel(offerItem.collectionItem);
        await transferItem(tx, offerItem.collectionItem.id, offerItem.quantity, updated.recipientId);
        await tx.trade.create({
          data: {
            userId: updated.proposerId,
            source: "LIVE",
            direction: "GIVEN",
            groupId: proposerGroupId,
            cardId,
            sealedProductId,
            condition,
            quantity: offerItem.quantity,
            itemName: name,
            counterpartyUserId: updated.recipientId,
            tradeOfferId: offerId,
            tradedAt,
          },
        });
        await tx.trade.create({
          data: {
            userId: updated.recipientId,
            source: "LIVE",
            direction: "RECEIVED",
            groupId: recipientGroupId,
            cardId,
            sealedProductId,
            condition,
            quantity: offerItem.quantity,
            itemName: name,
            counterpartyUserId: updated.proposerId,
            tradeOfferId: offerId,
            tradedAt,
          },
        });
      }

      for (const offerItem of recipientItems) {
        const { cardId, sealedProductId, condition } = offerItem.collectionItem;
        const name = itemLabel(offerItem.collectionItem);
        await transferItem(tx, offerItem.collectionItem.id, offerItem.quantity, updated.proposerId);
        await tx.trade.create({
          data: {
            userId: updated.recipientId,
            source: "LIVE",
            direction: "GIVEN",
            groupId: recipientGroupId,
            cardId,
            sealedProductId,
            condition,
            quantity: offerItem.quantity,
            itemName: name,
            counterpartyUserId: updated.proposerId,
            tradeOfferId: offerId,
            tradedAt,
          },
        });
        await tx.trade.create({
          data: {
            userId: updated.proposerId,
            source: "LIVE",
            direction: "RECEIVED",
            groupId: proposerGroupId,
            cardId,
            sealedProductId,
            condition,
            quantity: offerItem.quantity,
            itemName: name,
            counterpartyUserId: updated.recipientId,
            tradeOfferId: offerId,
            tradedAt,
          },
        });
      }

      await tx.tradeOffer.update({ where: { id: offerId }, data: { status: "COMPLETED", completedAt: tradedAt } });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not confirm trade." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  revalidatePath("/transactions");
  return {};
}

export async function cancelTradeOffer(offerId: string): Promise<void> {
  const session = await verifySession();
  await prisma.tradeOffer.updateMany({
    where: { id: offerId, status: "PENDING", OR: [{ proposerId: session.userId }, { recipientId: session.userId }] },
    data: { status: "CANCELLED" },
  });
}

export type TradeOfferItemView = {
  collectionItemId: string;
  name: string;
  imageUrl: string | null;
  condition: string | null;
  quantity: number;
};

export type TradeOfferState =
  | {
      status: "PENDING" | "COMPLETED" | "CANCELLED";
      proposerName: string;
      recipientName: string;
      proposerItems: TradeOfferItemView[];
      recipientItems: TradeOfferItemView[];
      proposerConfirmed: boolean;
      recipientConfirmed: boolean;
      viewerRole: "proposer" | "recipient";
    }
  | { error: string };

// Read-only polling endpoint -- LiveTradeScreen calls this on a short
// interval while the screen is open, since this codebase has no
// websocket/Pusher layer to push updates instead.
export async function getTradeOfferState(offerId: string): Promise<TradeOfferState> {
  const session = await verifySession();
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: offerId },
    include: {
      proposer: { select: { id: true, name: true, email: true } },
      recipient: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          collectionItem: {
            include: { card: { select: { name: true, imageUrl: true } }, sealedProduct: { select: { name: true, imageUrl: true } } },
          },
        },
      },
    },
  });
  if (!offer) return { error: "Trade not found." };
  if (offer.proposerId !== session.userId && offer.recipientId !== session.userId) {
    return { error: "Not your trade." };
  }

  function toView(item: NonNullable<typeof offer>["items"][number]): TradeOfferItemView {
    const ci = item.collectionItem;
    return {
      collectionItemId: ci.id,
      name: ci.card?.name ?? ci.sealedProduct?.name ?? "Unknown item",
      imageUrl: ci.card?.imageUrl ?? ci.sealedProduct?.imageUrl ?? null,
      condition: ci.condition,
      quantity: item.quantity,
    };
  }

  return {
    status: offer.status,
    proposerName: offer.proposer.name ?? offer.proposer.email,
    recipientName: offer.recipient.name ?? offer.recipient.email,
    proposerItems: offer.items.filter((i) => i.side === "PROPOSER").map(toView),
    recipientItems: offer.items.filter((i) => i.side === "RECIPIENT").map(toView),
    proposerConfirmed: offer.proposerConfirmed,
    recipientConfirmed: offer.recipientConfirmed,
    viewerRole: offer.proposerId === session.userId ? "proposer" : "recipient",
  };
}

export type TradeInviteSummary = {
  offerId: string;
  counterpartyName: string;
  role: "proposer" | "recipient";
  createdAt: string;
};

// Feeds both the Friends settings section's "pending trades" list and the
// avatar's small notification dot -- see components/AppChrome.tsx.
export async function getPendingTradeOffers(): Promise<TradeInviteSummary[]> {
  const session = await verifySession();
  const offers = await prisma.tradeOffer.findMany({
    where: { status: "PENDING", OR: [{ proposerId: session.userId }, { recipientId: session.userId }] },
    orderBy: { createdAt: "desc" },
    include: {
      proposer: { select: { name: true, email: true } },
      recipient: { select: { name: true, email: true } },
    },
  });
  return offers.map((o) => {
    const isProposer = o.proposerId === session.userId;
    const other = isProposer ? o.recipient : o.proposer;
    return {
      offerId: o.id,
      counterpartyName: other.name ?? other.email,
      role: isProposer ? "proposer" : "recipient",
      createdAt: o.createdAt.toISOString(),
    };
  });
}
