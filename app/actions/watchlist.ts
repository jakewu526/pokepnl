"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";

export async function addCardToWatchlist(cardId: string): Promise<void> {
  const session = await verifySession();
  await prisma.watchlistItem.upsert({
    where: { userId_cardId: { userId: session.userId, cardId } },
    create: { userId: session.userId, cardId },
    update: {},
  });
  revalidatePath("/watchlist");
  revalidatePath("/");
  revalidatePath(`/cards/${cardId}`);
}

export async function removeCardFromWatchlist(cardId: string): Promise<void> {
  const session = await verifySession();
  await prisma.watchlistItem.deleteMany({
    where: { userId: session.userId, cardId },
  });
  revalidatePath("/watchlist");
  revalidatePath("/");
  revalidatePath(`/cards/${cardId}`);
}

export async function setFeaturedWatchlistCard(watchlistItemId: string | null): Promise<void> {
  const session = await verifySession();
  await prisma.$transaction([
    prisma.watchlistItem.updateMany({
      where: { userId: session.userId, featured: true },
      data: { featured: false },
    }),
    ...(watchlistItemId
      ? [
          prisma.watchlistItem.update({
            where: { id: watchlistItemId, userId: session.userId },
            data: { featured: true },
          }),
        ]
      : []),
  ]);
  revalidatePath("/dashboard");
}

export async function addSealedToWatchlist(sealedProductId: string): Promise<void> {
  const session = await verifySession();
  await prisma.watchlistItem.upsert({
    where: { userId_sealedProductId: { userId: session.userId, sealedProductId } },
    create: { userId: session.userId, sealedProductId },
    update: {},
  });
  revalidatePath("/watchlist");
  revalidatePath("/sealed");
  revalidatePath(`/sealed/${sealedProductId}`);
}

export async function removeSealedFromWatchlist(sealedProductId: string): Promise<void> {
  const session = await verifySession();
  await prisma.watchlistItem.deleteMany({
    where: { userId: session.userId, sealedProductId },
  });
  revalidatePath("/watchlist");
  revalidatePath("/sealed");
  revalidatePath(`/sealed/${sealedProductId}`);
}
