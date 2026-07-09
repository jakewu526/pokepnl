import { prisma } from "@/lib/prisma";

export const CARDS_PAGE_SIZE = 30;

export type CardListItem = {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  imageUrl: string | null;
  setName: string;
  setTotal: number | null;
  price: number | null;
  priceSource: "TCGPLAYER" | "CARDMARKET" | null;
};

export type CardSearchResult = {
  cards: CardListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export async function getCatalogStats(): Promise<{ cardCount: number; setCount: number }> {
  const [cardCount, setCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardSet.count(),
  ]);
  return { cardCount, setCount };
}

export async function searchCards(query: string, page: number): Promise<CardSearchResult> {
  const where = query.trim()
    ? { name: { contains: query.trim(), mode: "insensitive" as const } }
    : {};

  const [total, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      orderBy: [{ name: "asc" }, { number: "asc" }],
      skip: (page - 1) * CARDS_PAGE_SIZE,
      take: CARDS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        number: true,
        rarity: true,
        imageUrl: true,
        set: { select: { name: true, totalCards: true } },
      },
    }),
  ]);

  const prices = await getLatestPrices(cards.map((c) => c.id));

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CARDS_PAGE_SIZE)),
    cards: cards.map((c) => {
      const priceInfo = prices.get(c.id);
      return {
        id: c.id,
        name: c.name,
        number: c.number,
        rarity: c.rarity,
        imageUrl: c.imageUrl,
        setName: c.set.name,
        setTotal: c.set.totalCards,
        price: priceInfo?.price ?? null,
        priceSource: priceInfo?.source ?? null,
      };
    }),
  };
}

type LatestPriceRow = { cardId: string; source: "TCGPLAYER" | "CARDMARKET"; price: string };

async function getLatestPrices(
  cardIds: string[]
): Promise<Map<string, { price: number; source: "TCGPLAYER" | "CARDMARKET" }>> {
  if (cardIds.length === 0) return new Map();

  // Latest MARKET-type snapshot per (card, source); prefer TCGplayer over
  // Cardmarket when both are available for a card.
  const rows = await prisma.$queryRaw<LatestPriceRow[]>`
    SELECT DISTINCT ON ("cardId", source) "cardId", source, price::text AS price
    FROM "PriceSnapshot"
    WHERE "cardId" = ANY(${cardIds}) AND "priceType" = 'MARKET'
    ORDER BY "cardId", source, "capturedDate" DESC
  `;

  const map = new Map<string, { price: number; source: "TCGPLAYER" | "CARDMARKET" }>();
  for (const row of rows) {
    const existing = map.get(row.cardId);
    if (!existing || row.source === "TCGPLAYER") {
      map.set(row.cardId, { price: parseFloat(row.price), source: row.source });
    }
  }
  return map;
}
