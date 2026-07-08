import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { tcgplayerFetch } from "@/lib/tcgplayer";

// Recurring job: fetch current TCGplayer prices for every card/sealed
// product we know about and insert one PriceSnapshot row per item for
// today. Safe to re-run the same day thanks to the (entity, source,
// priceType, condition, capturedDate) unique constraint in the schema.

const BATCH_SIZE = 250; // TCGplayer pricing endpoint's per-request product limit

type TcgPrice = {
  productId: number;
  subTypeName: string; // e.g. "Normal", "Holofoil", "1st Edition Holofoil"
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchPrices(productIds: number[]): Promise<TcgPrice[]> {
  const all: TcgPrice[] = [];
  for (const batch of chunk(productIds, BATCH_SIZE)) {
    const res = await tcgplayerFetch<{ results: TcgPrice[] }>(
      `/pricing/product/${batch.join(",")}`
    );
    all.push(...res.results);
  }
  return all;
}

async function snapshotEntities(
  entityIdByProductId: Map<number, string>,
  entityField: "cardId" | "sealedProductId"
) {
  const productIds = [...entityIdByProductId.keys()];
  if (productIds.length === 0) return 0;

  const prices = await fetchPrices(productIds);
  const capturedAt = new Date();

  let count = 0;
  for (const price of prices) {
    const entityId = entityIdByProductId.get(price.productId);
    if (!entityId || price.marketPrice == null) continue;

    await prisma.priceSnapshot.upsert({
      where: {
        cardId_sealedProductId_source_priceType_condition_capturedDate: {
          cardId: entityField === "cardId" ? entityId : null,
          sealedProductId: entityField === "sealedProductId" ? entityId : null,
          source: "TCGPLAYER",
          priceType: "MARKET",
          condition: price.subTypeName,
          capturedDate: capturedAt,
        },
      },
      create: {
        [entityField]: entityId,
        source: "TCGPLAYER",
        priceType: "MARKET",
        condition: price.subTypeName,
        price: price.marketPrice,
        capturedAt,
        capturedDate: capturedAt,
      } as never,
      update: {
        price: price.marketPrice,
        capturedAt,
      },
    });
    count += 1;
  }
  return count;
}

async function main() {
  const cards = await prisma.card.findMany({
    where: { tcgplayerProductId: { not: null } },
    select: { id: true, tcgplayerProductId: true },
  });
  const sealedProducts = await prisma.sealedProduct.findMany({
    where: { tcgplayerProductId: { not: null } },
    select: { id: true, tcgplayerProductId: true },
  });

  const cardMap = new Map(cards.map((c) => [Number(c.tcgplayerProductId), c.id]));
  const sealedMap = new Map(
    sealedProducts.map((p) => [Number(p.tcgplayerProductId), p.id])
  );

  const cardCount = await snapshotEntities(cardMap, "cardId");
  const sealedCount = await snapshotEntities(sealedMap, "sealedProductId");

  console.log(
    `Captured ${cardCount} card price snapshots and ${sealedCount} sealed product price snapshots.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
