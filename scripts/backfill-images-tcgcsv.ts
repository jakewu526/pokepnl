import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  fetchGroups,
  fetchProducts,
  productImageUrl,
  POKEMON_EN_CATEGORY,
  POKEMON_JP_CATEGORY,
} from "@/lib/tcgcsv";

// Fills remaining Card/SealedProduct.imageUrl gaps left by
// backfill-pricecharting-details.ts (PriceCharting has no image for that
// product) by checking tcgcsv.com -- already the primary sealed-product image
// source, but never previously used for cards. Matches purely on the
// tcgplayerProductId every row already carries, so this is one pass over
// every group's product list rather than a per-row HTTP call.

async function main() {
  const [cards, sealedProducts] = await Promise.all([
    prisma.card.findMany({
      where: { imageUrl: null, tcgplayerProductId: { not: null } },
      select: { id: true, tcgplayerProductId: true },
    }),
    prisma.sealedProduct.findMany({
      where: { imageUrl: null, tcgplayerProductId: { not: null } },
      select: { id: true, tcgplayerProductId: true },
    }),
  ]);

  const cardById = new Map(cards.map((c) => [c.tcgplayerProductId!, c.id]));
  const sealedById = new Map(sealedProducts.map((p) => [p.tcgplayerProductId!, p.id]));
  console.log(`Targets: ${cardById.size} cards, ${sealedById.size} sealed products.`);

  let cardsFixed = 0;
  let sealedFixed = 0;
  let groupsProcessed = 0;

  for (const categoryId of [POKEMON_EN_CATEGORY, POKEMON_JP_CATEGORY]) {
    const groups = await fetchGroups(categoryId);
    for (const group of groups) {
      const products = await fetchProducts(categoryId, group.groupId);
      for (const product of products) {
        const tcgId = String(product.productId);
        const imageUrl = productImageUrl(product);
        if (!imageUrl) continue;

        const cardId = cardById.get(tcgId);
        if (cardId) {
          await prisma.card.update({ where: { id: cardId }, data: { imageUrl } });
          cardById.delete(tcgId);
          cardsFixed += 1;
        }

        const sealedId = sealedById.get(tcgId);
        if (sealedId) {
          await prisma.sealedProduct.update({ where: { id: sealedId }, data: { imageUrl } });
          sealedById.delete(tcgId);
          sealedFixed += 1;
        }
      }
      groupsProcessed += 1;
      if (groupsProcessed % 100 === 0) {
        console.log(
          `${groupsProcessed} groups processed. cardsFixed=${cardsFixed}, sealedFixed=${sealedFixed}`
        );
      }
    }
  }

  console.log(
    `Done. groups=${groupsProcessed}, cardsFixed=${cardsFixed}, sealedFixed=${sealedFixed}, ` +
      `cardsStillMissing=${cardById.size}, sealedStillMissing=${sealedById.size}`
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
