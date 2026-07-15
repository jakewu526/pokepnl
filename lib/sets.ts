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

type SetPriceRow = { setId: string; total: string };
type OwnedCountRow = { setId: string; ownedCount: number };

async function getSetPrices(setIds: string[]): Promise<Map<string, number>> {
  if (setIds.length === 0) return new Map();

  // One market price per card (preferring PriceCharting, then TCGplayer,
  // then Cardmarket -- same cascade as getLatestPrices in lib/cards.ts),
  // summed per set to approximate the cost of a complete raw set.
  const rows = await prisma.$queryRaw<SetPriceRow[]>`
    WITH best AS (
      SELECT DISTINCT ON (ps."cardId") ps."cardId", c."setId" AS "setId", ps.price
      FROM "PriceSnapshot" ps
      JOIN "Card" c ON c.id = ps."cardId"
      WHERE ps."priceType" = 'MARKET' AND ps."cardId" IS NOT NULL AND c."setId" = ANY(${setIds})
      ORDER BY ps."cardId",
        CASE ps.source WHEN 'PRICECHARTING' THEN 0 WHEN 'TCGPLAYER' THEN 1 ELSE 2 END,
        ps."capturedDate" DESC
    )
    SELECT "setId", SUM(price)::text AS total
    FROM best
    GROUP BY "setId"
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

export async function getSetsByEra(query: string, userId: string | null): Promise<EraGroup[]> {
  const where = query.trim()
    ? { name: { contains: query.trim(), mode: "insensitive" as const } }
    : {};

  const sets = await prisma.cardSet.findMany({
    where,
    orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { name: "asc" }],
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
  });

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

  return Array.from(eras.entries()).map(([era, sets]) => ({ era, sets }));
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
