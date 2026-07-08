import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { searchActiveListings } from "@/lib/ebay";
import { capturePriceSnapshot } from "@/lib/price-snapshot";

// eBay has no structured sealed-product catalog like TCGplayer's, so we
// generate one product per (set, product template) combination and use
// the median price of matching active listings as a market-price proxy.
// This is noisier than a real marketplace API (active asking price, not
// sold price; title-match false positives are possible) but requires no
// paid/gated access -- see lib/ebay.ts.

const PRODUCT_TEMPLATES: { suffix: string; type: string; queryTerm: string }[] = [
  { suffix: "Booster Box", type: "BOOSTER_BOX", queryTerm: "booster box" },
  { suffix: "Elite Trainer Box", type: "ELITE_TRAINER_BOX", queryTerm: "elite trainer box" },
  { suffix: "Booster Bundle", type: "BUNDLE", queryTerm: "booster bundle" },
];

const MIN_LISTINGS_FOR_PRICE = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function processSetProduct(
  setId: string,
  setName: string,
  template: (typeof PRODUCT_TEMPLATES)[number]
): Promise<boolean> {
  const query = `Pokemon ${setName} ${template.queryTerm}`;
  const listings = await searchActiveListings(query);

  const prices = listings
    .map((item) => (item.price ? parseFloat(item.price.value) : null))
    .filter((p): p is number => p != null && p > 0);

  if (prices.length < MIN_LISTINGS_FOR_PRICE) {
    console.log(`  Skipping "${query}": only ${prices.length} matching listings`);
    return false;
  }

  const name = `${setName} ${template.suffix}`;
  const product = await prisma.sealedProduct.upsert({
    where: { setId_name: { setId, name } },
    create: { setId, name, type: template.type as never },
    update: { name },
  });

  await capturePriceSnapshot({
    entityId: product.id,
    entityField: "sealedProductId",
    source: "EBAY",
    priceType: "MARKET",
    condition: null,
    price: median(prices),
  });

  console.log(`  ${name}: median $${median(prices).toFixed(2)} across ${prices.length} listings`);
  return true;
}

async function main() {
  const sets = await prisma.cardSet.findMany({
    // Sealed product listings are only meaningfully searchable/available
    // for recent sets; older sets return mostly loose singles or nothing.
    where: { releaseDate: { gte: new Date("2016-01-01") } },
    select: { id: true, name: true },
  });

  let matched = 0;
  for (const set of sets) {
    console.log(`Searching sealed product for "${set.name}"...`);
    for (const template of PRODUCT_TEMPLATES) {
      if (await processSetProduct(set.id, set.name, template)) matched += 1;
    }
  }

  console.log(`Captured prices for ${matched} sealed products.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
