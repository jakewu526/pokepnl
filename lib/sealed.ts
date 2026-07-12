import { prisma } from "@/lib/prisma";
import type { PricePoint } from "@/lib/cards";

export const SEALED_PAGE_SIZE = 30;

export type SealedProductType =
  | "BOOSTER_BOX"
  | "BOOSTER_PACK"
  | "ELITE_TRAINER_BOX"
  | "BUNDLE"
  | "BLISTER"
  | "COLLECTION_BOX"
  | "TIN"
  | "OTHER";

export const SEALED_TYPE_LABELS: Record<SealedProductType, string> = {
  BOOSTER_BOX: "Booster Box",
  BOOSTER_PACK: "Booster Pack",
  ELITE_TRAINER_BOX: "Elite Trainer Box",
  BUNDLE: "Booster Bundle",
  BLISTER: "Blister",
  COLLECTION_BOX: "Collection Box",
  TIN: "Tin",
  OTHER: "Sealed Product",
};

export type SealedProductListItem = {
  id: string;
  name: string;
  type: SealedProductType;
  imageUrl: string | null;
  setName: string | null;
  price: number | null;
  priceSource: "PRICECHARTING" | "EBAY" | null;
};

export type SealedProductSearchResult = {
  products: SealedProductListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export async function getSealedCatalogStats(): Promise<{ productCount: number }> {
  const productCount = await prisma.sealedProduct.count();
  return { productCount };
}

export async function searchSealedProducts(
  query: string,
  page: number
): Promise<SealedProductSearchResult> {
  const where = query.trim()
    ? { name: { contains: query.trim(), mode: "insensitive" as const } }
    : {};

  const [total, products] = await Promise.all([
    prisma.sealedProduct.count({ where }),
    prisma.sealedProduct.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * SEALED_PAGE_SIZE,
      take: SEALED_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        type: true,
        imageUrl: true,
        set: { select: { name: true } },
      },
    }),
  ]);

  const prices = await getLatestSealedPrices(products.map((p) => p.id));

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / SEALED_PAGE_SIZE)),
    products: products.map((p) => {
      const priceInfo = prices.get(p.id);
      return {
        id: p.id,
        name: p.name,
        type: p.type as SealedProductType,
        imageUrl: p.imageUrl,
        setName: p.set?.name ?? null,
        price: priceInfo?.price ?? null,
        priceSource: priceInfo?.source ?? null,
      };
    }),
  };
}

export type SealedProductDetail = {
  id: string;
  name: string;
  type: SealedProductType;
  imageUrl: string | null;
  setName: string | null;
  setSeries: string | null;
  price: number | null;
  priceSource: "PRICECHARTING" | "EBAY" | null;
  history: PricePoint[];
};

type SealedHistoryRow = {
  source: "PRICECHARTING" | "EBAY";
  price: string;
  capturedDate: Date;
};

export async function getSealedProductDetail(id: string): Promise<SealedProductDetail | null> {
  const product = await prisma.sealedProduct.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      imageUrl: true,
      set: { select: { name: true, series: true } },
    },
  });
  if (!product) return null;

  const rows = await prisma.$queryRaw<SealedHistoryRow[]>`
    SELECT source, price::text AS price, "capturedDate"
    FROM "PriceSnapshot"
    WHERE "sealedProductId" = ${id} AND "priceType" = 'MARKET'
      AND source IN ('PRICECHARTING', 'EBAY')
    ORDER BY "capturedDate" ASC
  `;

  let history: PricePoint[] = [];
  let priceSource: "PRICECHARTING" | "EBAY" | null = null;

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const lastDateKey = last.capturedDate.toISOString().slice(0, 10);
    const lastDayRows = rows.filter(
      (r) => r.capturedDate.toISOString().slice(0, 10) === lastDateKey
    );
    const chosen = lastDayRows.find((r) => r.source === "PRICECHARTING") ?? last;
    priceSource = chosen.source;

    history = rows
      .filter((r) => r.source === chosen.source)
      .map((r) => ({
        date: r.capturedDate.toISOString().slice(0, 10),
        price: parseFloat(r.price),
      }));
  }

  const price = history.length > 0 ? history[history.length - 1].price : null;

  return {
    id: product.id,
    name: product.name,
    type: product.type as SealedProductType,
    imageUrl: product.imageUrl,
    setName: product.set?.name ?? null,
    setSeries: product.set?.series ?? null,
    price,
    priceSource,
    history,
  };
}

type LatestSealedPriceRow = { sealedProductId: string; source: "PRICECHARTING" | "EBAY"; price: string };

export async function getLatestSealedPrices(
  productIds: string[]
): Promise<Map<string, { price: number; source: "PRICECHARTING" | "EBAY" }>> {
  if (productIds.length === 0) return new Map();

  // Latest MARKET-type snapshot per (product, source); prefer PriceCharting
  // over eBay when both are available.
  const rows = await prisma.$queryRaw<LatestSealedPriceRow[]>`
    SELECT DISTINCT ON ("sealedProductId", source) "sealedProductId", source, price::text AS price
    FROM "PriceSnapshot"
    WHERE "sealedProductId" = ANY(${productIds}) AND "priceType" = 'MARKET'
    ORDER BY "sealedProductId", source, "capturedDate" DESC
  `;

  const map = new Map<string, { price: number; source: "PRICECHARTING" | "EBAY" }>();
  for (const row of rows) {
    const existing = map.get(row.sealedProductId);
    if (!existing || row.source === "PRICECHARTING") {
      map.set(row.sealedProductId, { price: parseFloat(row.price), source: row.source });
    }
  }
  return map;
}
