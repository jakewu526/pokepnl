import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";

// One-time backfill of historical prices from PriceCharting for cards/sealed
// products that have a pricechartingId. PriceCharting's public API primarily
// exposes current prices (loose-price, cib-price, new-price, etc.) rather
// than a full history series; if your plan includes historical endpoints,
// adjust `fetchHistory` below to match. Re-verify against
// https://www.pricecharting.com/api-documentation once PRICECHARTING_API_TOKEN
// is available -- this is a best-effort scaffold.

const API_BASE = "https://www.pricecharting.com/api";

type PriceChartingPoint = { date: string; price: number };
type PriceChartingProduct = {
  id: string;
  "loose-price"?: number;
  "cib-price"?: number;
  "new-price"?: number;
  "price-history"?: PriceChartingPoint[];
};

function token(): string {
  const t = process.env.PRICECHARTING_API_TOKEN;
  if (!t) throw new Error("PRICECHARTING_API_TOKEN is not set.");
  return t;
}

async function fetchHistory(pricechartingId: string): Promise<PriceChartingPoint[]> {
  const url = `${API_BASE}/product?t=${token()}&id=${pricechartingId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PriceCharting request failed: ${res.status} ${res.statusText}`);
  }
  const product = (await res.json()) as PriceChartingProduct;
  return product["price-history"] ?? [];
}

async function backfillEntity(
  entityId: string,
  pricechartingId: string,
  entityField: "cardId" | "sealedProductId"
): Promise<number> {
  const history = await fetchHistory(pricechartingId);
  let count = 0;

  for (const point of history) {
    const capturedDate = new Date(point.date);
    await capturePriceSnapshot({
      entityId,
      entityField,
      source: "PRICECHARTING",
      priceType: "MARKET",
      condition: null,
      price: point.price,
      capturedAt: capturedDate,
    });
    count += 1;
  }
  return count;
}

async function main() {
  const cards = await prisma.card.findMany({
    where: { pricechartingId: { not: null } },
    select: { id: true, pricechartingId: true },
  });
  const sealedProducts = await prisma.sealedProduct.findMany({
    where: { pricechartingId: { not: null } },
    select: { id: true, pricechartingId: true },
  });

  let total = 0;
  for (const card of cards) {
    total += await backfillEntity(card.id, card.pricechartingId!, "cardId");
  }
  for (const product of sealedProducts) {
    total += await backfillEntity(product.id, product.pricechartingId!, "sealedProductId");
  }

  console.log(`Backfilled ${total} historical price points from PriceCharting.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
