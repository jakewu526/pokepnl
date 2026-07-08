import { prisma } from "@/lib/prisma";

export type PriceSourceName = "TCGPLAYER" | "CARDMARKET" | "PRICECHARTING" | "EBAY";
export type PriceTypeName = "MARKET" | "LOW" | "MID" | "HIGH" | "DIRECT_LOW";

export async function capturePriceSnapshot(params: {
  entityId: string;
  entityField: "cardId" | "sealedProductId";
  source: PriceSourceName;
  priceType: PriceTypeName;
  condition: string | null;
  price: number;
  capturedAt?: Date;
}): Promise<void> {
  if (!params.price || params.price <= 0) return;

  const capturedAt = params.capturedAt ?? new Date();
  const cardId = params.entityField === "cardId" ? params.entityId : null;
  const sealedProductId = params.entityField === "sealedProductId" ? params.entityId : null;

  // Prisma's typed compound-unique `where` rejects `null` for a component
  // field even though cardId/sealedProductId are nullable columns, so we
  // can't use upsert() here -- fall back to findFirst + create/update.
  const existing = await prisma.priceSnapshot.findFirst({
    where: {
      cardId,
      sealedProductId,
      source: params.source,
      priceType: params.priceType,
      condition: params.condition,
      capturedDate: capturedAt,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.priceSnapshot.update({
      where: { id: existing.id },
      data: { price: params.price, capturedAt },
    });
  } else {
    await prisma.priceSnapshot.create({
      data: {
        [params.entityField]: params.entityId,
        source: params.source,
        priceType: params.priceType,
        condition: params.condition,
        price: params.price,
        capturedAt,
        capturedDate: capturedAt,
      } as never,
    });
  }
}
