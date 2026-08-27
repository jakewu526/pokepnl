import { prisma } from "@/lib/prisma";
import type { PricePoint } from "@/lib/cards";
import { densifyHistory } from "@/lib/densify";
import { SEALED_TYPE_LABELS, type SealedProductSuggestion, type SealedProductType } from "@/lib/sealed-types";

export {
  SEALED_TYPE_LABELS,
  type SealedProductSuggestion,
  type SealedProductType,
} from "@/lib/sealed-types";

export const SEALED_PAGE_SIZE = 30;

// Ordered best-first. TCGplayer's market price is what sealed actually
// changes hands at, so it outranks PriceCharting -- whose sealed "loose"
// figure tracks a thinner, higher-priced sample (a 151 ETB reads ~$150 on
// TCGplayer against $528 on PriceCharting).
export const SEALED_PRICE_SOURCES = ["TCGPLAYER", "PRICECHARTING", "EBAY"] as const;
export type SealedPriceSource = (typeof SEALED_PRICE_SOURCES)[number];

export const SEALED_SOURCE_LABELS: Record<SealedPriceSource, string> = {
  TCGPLAYER: "TCGplayer",
  PRICECHARTING: "PriceCharting",
  EBAY: "eBay listings",
};

function betterSource(a: SealedPriceSource, b: SealedPriceSource): SealedPriceSource {
  return SEALED_PRICE_SOURCES.indexOf(a) <= SEALED_PRICE_SOURCES.indexOf(b) ? a : b;
}

export type SealedProductListItem = {
  id: string;
  name: string;
  type: SealedProductType;
  imageUrl: string | null;
  language: string;
  setName: string | null;
  price: number | null;
  priceSource: SealedPriceSource | null;
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

export type SealedFilters = { type?: string; language?: string };

// Splits the query into whitespace-separated tokens and requires every token
// to match at least one searchable field (product name or set name), so e.g.
// "prismatic poster" finds "Prismatic Evolutions Poster Collection" even
// though "poster" isn't adjacent to "prismatic" in the full name. Mirrors
// buildCardSearchWhere in lib/cards.ts.
function buildSealedSearchWhere(query: string) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};

  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" as const } },
        { set: { name: { contains: token, mode: "insensitive" as const } } },
      ],
    })),
  };
}

export async function searchSealedProducts(
  query: string,
  page: number,
  filters: SealedFilters = {}
): Promise<SealedProductSearchResult> {
  const q = query.trim();
  const where = {
    // Searching the set name as well as the product name matters now that
    // TCGplayer names don't always repeat the set ("Poke Ball with Two Mini
    // Tins") -- mirrors the multi-field search in lib/cards.ts.
    ...buildSealedSearchWhere(q),
    ...(filters.type ? { type: filters.type as never } : {}),
    ...(filters.language ? { language: filters.language } : {}),
  };

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
        language: true,
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
        language: p.language,
        setName: p.set?.name ?? null,
        price: priceInfo?.price ?? null,
        priceSource: priceInfo?.source ?? null,
      };
    }),
  };
}

type NameSimilarityRow = { name: string; sim: number };

// Sealed-catalog counterpart to getCardNameSuggestion in lib/cards.ts --
// same pg_trgm "did you mean" behavior, only invoked on a zero-result
// search, never live while typing.
export async function getSealedNameSuggestion(query: string): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const rows = await prisma.$queryRaw<NameSimilarityRow[]>`
    SELECT name, similarity(name, ${trimmed}) AS sim
    FROM "SealedProduct"
    WHERE name % ${trimmed}
    ORDER BY sim DESC
    LIMIT 1
  `;
  const best = rows[0];
  if (!best || best.name.toLowerCase() === trimmed.toLowerCase()) return null;
  return best.name;
}

export const SEALED_SUGGESTION_LIMIT = 8;

// Mirrors getCardSuggestions: over-fetch on the same search-bar match as
// searchSealedProducts, then re-rank so exact/prefix name matches surface
// above looser set-name hits.
export async function getSealedSuggestions(query: string): Promise<SealedProductSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const candidates = await prisma.sealedProduct.findMany({
    where: buildSealedSearchWhere(trimmed),
    orderBy: [{ name: "asc" }],
    take: SEALED_SUGGESTION_LIMIT * 4,
    select: {
      id: true,
      name: true,
      type: true,
      imageUrl: true,
      language: true,
      set: { select: { name: true } },
    },
  });

  const lowerQuery = trimmed.toLowerCase();
  const rank = (p: (typeof candidates)[number]) => {
    const lowerName = p.name.toLowerCase();
    if (lowerName === lowerQuery) return 0;
    if (lowerName.startsWith(lowerQuery)) return 1;
    return 2;
  };

  return candidates
    .slice()
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, SEALED_SUGGESTION_LIMIT)
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type as SealedProductType,
      imageUrl: p.imageUrl,
      language: p.language,
      setName: p.set?.name ?? null,
    }));
}

export type SealedProductDetail = {
  id: string;
  name: string;
  type: SealedProductType;
  imageUrl: string | null;
  setName: string | null;
  setSeries: string | null;
  price: number | null;
  priceSource: SealedPriceSource | null;
  // Source of the charted series, which can differ from priceSource when the
  // preferred source's latest capture is older than another source's.
  historySource: SealedPriceSource | null;
  history: PricePoint[];
};

type SealedHistoryRow = {
  source: SealedPriceSource;
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
      AND source IN ('TCGPLAYER', 'PRICECHARTING', 'EBAY')
      -- Sealed product is never graded. snapshot-prices.ts writes TCGplayer's
      -- subTypeName into the condition column, so without this guard a
      -- "Normal"/"Holofoil" row could be charted as the sealed price.
      AND condition IS NULL
    ORDER BY "capturedDate" ASC
  `;

  let history: PricePoint[] = [];
  // The series drawn in the chart, which is chosen for continuity rather than
  // for headline accuracy -- it can legitimately differ from the source the
  // headline price comes from (see below).
  let historySource: SealedPriceSource | null = null;

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const lastDateKey = last.capturedDate.toISOString().slice(0, 10);
    const lastDayRows = rows.filter(
      (r) => r.capturedDate.toISOString().slice(0, 10) === lastDateKey
    );
    const chosen = lastDayRows.reduce((best, r) => (betterSource(r.source, best.source) === r.source ? r : best), last);
    historySource = chosen.source;

    history = rows
      .filter((r) => r.source === chosen.source)
      .map((r) => ({
        date: r.capturedDate.toISOString().slice(0, 10),
        price: parseFloat(r.price),
      }));
    // Fill gaps between real monthly captures so short ranges aren't flat
    // (see lib/densify.ts).
    history = densifyHistory(history, id);
  }

  // The headline price always comes from the shared resolver, never from the
  // tail of the charted series. Those two can disagree: the chart follows the
  // freshest capture date, while the resolver follows SEALED_PRICE_SOURCES.
  // When TCGplayer's snapshot is a day older than PriceCharting's, the chart
  // draws PriceCharting while the grid still (correctly) prefers TCGplayer --
  // and the same product then showed two different prices depending on which
  // page you were on. Sourcing the headline here makes that impossible.
  const latest = (await getLatestSealedPrices([id])).get(id);
  const price = latest?.price ?? (history.length > 0 ? history[history.length - 1].price : null);
  const priceSource = latest?.source ?? historySource;

  return {
    id: product.id,
    name: product.name,
    type: product.type as SealedProductType,
    imageUrl: product.imageUrl,
    setName: product.set?.name ?? null,
    setSeries: product.set?.series ?? null,
    price,
    priceSource,
    historySource,
    history,
  };
}

// Preference order for which figure represents "the" price. MARKET is the
// real trade price; MID/LOW only get used for product TCGplayer lists but has
// no sales for yet -- overwhelmingly presale boxes, where the preorder ask is
// far more useful to a reseller than showing "No price yet".
const SEALED_PRICE_TYPES = ["MARKET", "MID", "LOW"] as const;
type SealedPriceType = (typeof SEALED_PRICE_TYPES)[number];

type LatestSealedPriceRow = {
  sealedProductId: string;
  source: SealedPriceSource;
  priceType: SealedPriceType;
  price: string;
};

// Lower is better on both axes; source dominates, price type breaks the tie.
function rank(row: { source: SealedPriceSource; priceType: SealedPriceType }): number {
  return SEALED_PRICE_SOURCES.indexOf(row.source) * 10 + SEALED_PRICE_TYPES.indexOf(row.priceType);
}

export async function getLatestSealedPrices(
  productIds: string[]
): Promise<Map<string, { price: number; source: SealedPriceSource }>> {
  if (productIds.length === 0) return new Map();

  // Latest snapshot per (product, source, type), resolved by `rank`. The
  // source restriction and the condition guard must mirror
  // getSealedProductDetail exactly, or a product's list price and its
  // detail-page price can disagree.
  const rows = await prisma.$queryRaw<LatestSealedPriceRow[]>`
    SELECT DISTINCT ON ("sealedProductId", source, "priceType")
           "sealedProductId", source, "priceType", price::text AS price
    FROM "PriceSnapshot"
    WHERE "sealedProductId" = ANY(${productIds})
      AND "priceType" IN ('MARKET', 'MID', 'LOW')
      AND source IN ('TCGPLAYER', 'PRICECHARTING', 'EBAY')
      AND condition IS NULL
    ORDER BY "sealedProductId", source, "priceType", "capturedDate" DESC
  `;

  const best = new Map<string, LatestSealedPriceRow>();
  for (const row of rows) {
    const existing = best.get(row.sealedProductId);
    if (!existing || rank(row) < rank(existing)) best.set(row.sealedProductId, row);
  }

  const map = new Map<string, { price: number; source: SealedPriceSource }>();
  for (const [id, row] of best) {
    map.set(id, { price: parseFloat(row.price), source: row.source });
  }
  return map;
}
