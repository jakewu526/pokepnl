import { prisma } from "@/lib/prisma";
import { getLatestPrices, type CardListItem } from "@/lib/cards";

export type SetDetail = {
  id: string;
  name: string;
  code: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  series: string | null;
  releaseDate: string | null;
  totalCards: number | null;
};

export type SetListItem = {
  id: string;
  name: string;
  code: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  releaseDate: string | null;
  totalCards: number | null;
  ownedCount: number;
  price: number | null;
};

export type EraGroup = {
  era: string;
  sets: SetListItem[];
};

export type SetSearchResult = {
  eras: EraGroup[];
  total: number;
  page: number;
  pageCount: number;
};

export const SETS_PAGE_SIZE = 48;

type SetPriceRow = { setId: string; total: string };
type OwnedCountRow = { setId: string; ownedCount: number };

async function getSetPrices(setIds: string[]): Promise<Map<string, number>> {
  if (setIds.length === 0) return new Map();

  // One market price per card (preferring PriceCharting, then TCGplayer,
  // then Cardmarket -- same cascade as getLatestPrices in lib/cards.ts),
  // summed per set to approximate the cost of a complete raw set. Each
  // source is its own LATERAL join so it's a single index seek against
  // [cardId, priceType, variant, source, capturedDate] (the row is already
  // last-in-order for that group) instead of scanning + sorting every
  // historical snapshot across all sources per card.
  const rows = await prisma.$queryRaw<SetPriceRow[]>`
    SELECT c."setId" AS "setId", SUM(COALESCE(pc.price, tcg.price, cm.price))::text AS total
    FROM "Card" c
    LEFT JOIN LATERAL (
      SELECT price FROM "PriceSnapshot"
      WHERE "cardId" = c.id AND "priceType" = 'MARKET' AND variant = 'NORMAL' AND source = 'PRICECHARTING'
      ORDER BY "capturedDate" DESC LIMIT 1
    ) pc ON true
    LEFT JOIN LATERAL (
      SELECT price FROM "PriceSnapshot"
      WHERE "cardId" = c.id AND "priceType" = 'MARKET' AND variant = 'NORMAL' AND source = 'TCGPLAYER'
      ORDER BY "capturedDate" DESC LIMIT 1
    ) tcg ON true
    LEFT JOIN LATERAL (
      SELECT price FROM "PriceSnapshot"
      WHERE "cardId" = c.id AND "priceType" = 'MARKET' AND variant = 'NORMAL' AND source = 'CARDMARKET'
      ORDER BY "capturedDate" DESC LIMIT 1
    ) cm ON true
    WHERE c."setId" = ANY(${setIds})
    GROUP BY c."setId"
  `;

  return new Map(rows.map((r) => [r.setId, parseFloat(r.total)]));
}

async function getOwnedCounts(userId: string, setIds: string[]): Promise<Map<string, number>> {
  if (setIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<OwnedCountRow[]>`
    SELECT c."setId" AS "setId", COUNT(DISTINCT ci."cardId")::int AS "ownedCount"
    FROM "CollectionItem" ci
    JOIN "Card" c ON c.id = ci."cardId"
    WHERE ci."userId" = ${userId} AND ci."cardId" IS NOT NULL AND c."setId" = ANY(${setIds})
    GROUP BY c."setId"
  `;

  return new Map(rows.map((r) => [r.setId, r.ownedCount]));
}

export async function getSetsByEra(
  query: string,
  userId: string | null,
  page: number
): Promise<SetSearchResult> {
  const where = query.trim()
    ? { name: { contains: query.trim(), mode: "insensitive" as const } }
    : {};

  const [total, sets] = await Promise.all([
    prisma.cardSet.count({ where }),
    prisma.cardSet.findMany({
      where,
      orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      skip: (page - 1) * SETS_PAGE_SIZE,
      take: SETS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        series: true,
        code: true,
        logoUrl: true,
        symbolUrl: true,
        releaseDate: true,
        totalCards: true,
      },
    }),
  ]);

  const setIds = sets.map((s) => s.id);
  const [prices, ownedCounts] = await Promise.all([
    getSetPrices(setIds),
    userId ? getOwnedCounts(userId, setIds) : Promise.resolve(new Map<string, number>()),
  ]);

  const eras = new Map<string, SetListItem[]>();
  for (const set of sets) {
    const era = set.series ?? "Other";
    const list = eras.get(era) ?? [];
    list.push({
      id: set.id,
      name: set.name,
      code: set.code,
      logoUrl: set.logoUrl,
      symbolUrl: set.symbolUrl,
      releaseDate: set.releaseDate ? set.releaseDate.toISOString().slice(0, 10) : null,
      totalCards: set.totalCards,
      ownedCount: ownedCounts.get(set.id) ?? 0,
      price: prices.get(set.id) ?? null,
    });
    eras.set(era, list);
  }

  return {
    eras: Array.from(eras.entries()).map(([era, sets]) => ({ era, sets })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / SETS_PAGE_SIZE)),
  };
}

export async function getSetDetail(id: string): Promise<SetDetail | null> {
  const set = await prisma.cardSet.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      logoUrl: true,
      symbolUrl: true,
      series: true,
      releaseDate: true,
      totalCards: true,
    },
  });
  if (!set) return null;

  return {
    id: set.id,
    name: set.name,
    code: set.code,
    logoUrl: set.logoUrl,
    symbolUrl: set.symbolUrl,
    series: set.series,
    releaseDate: set.releaseDate ? set.releaseDate.toISOString().slice(0, 10) : null,
    totalCards: set.totalCards,
  };
}

type SetCardRow = {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  imageUrl: string | null;
  setName: string;
  setTotal: number | null;
};

export async function getCardsInSet(setId: string): Promise<CardListItem[]> {
  // "number" is a string (e.g. "1", "10a", "SWSH134"), so a plain text sort
  // puts "10" before "2". Sort by any leading letters first (groups plain
  // numbered cards ahead of prefixed promo/secret-rare numbering), then by
  // the numeric run within the number, so sets read 1, 2, 3 ... instead of
  // 1, 10, 100, 101 ...
  const cards = await prisma.$queryRaw<SetCardRow[]>`
    SELECT c.id, c.name, c.number, c.rarity, c."imageUrl",
           s.name AS "setName", s."totalCards" AS "setTotal"
    FROM "Card" c
    JOIN "CardSet" s ON s.id = c."setId"
    WHERE c."setId" = ${setId}
    ORDER BY
      substring(c.number from '^[^0-9]*') ASC,
      NULLIF(regexp_replace(c.number, '[^0-9]', '', 'g'), '')::int ASC NULLS LAST,
      c.number ASC
  `;

  const prices = await getLatestPrices(cards.map((c) => c.id));

  return cards.map((c) => {
    const priceInfo = prices.get(c.id);
    return {
      id: c.id,
      name: c.name,
      number: c.number,
      rarity: c.rarity,
      imageUrl: c.imageUrl,
      setName: c.setName,
      setTotal: c.setTotal,
      price: priceInfo?.price ?? null,
      priceSource: priceInfo?.source ?? null,
    };
  });
}
