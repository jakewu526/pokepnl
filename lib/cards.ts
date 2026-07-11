import { prisma } from "@/lib/prisma";
import { CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import { getConditionAdjustedPrice } from "@/lib/condition-price";

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
  priceEstimated: boolean;
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

export async function searchCards(
  query: string,
  page: number,
  condition: Condition = "NM"
): Promise<CardSearchResult> {
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
      // Grid listing always uses the fast multiplier estimate for non-NM
      // conditions -- no live API calls per row (30 cards/page).
      const price =
        priceInfo?.price != null && condition !== "NM"
          ? priceInfo.price * CONDITION_MULTIPLIERS[condition]
          : priceInfo?.price ?? null;
      return {
        id: c.id,
        name: c.name,
        number: c.number,
        rarity: c.rarity,
        imageUrl: c.imageUrl,
        setName: c.set.name,
        setTotal: c.set.totalCards,
        price,
        priceSource: priceInfo?.source ?? null,
        priceEstimated: condition !== "NM" && priceInfo?.price != null,
      };
    }),
  };
}

export type PricePoint = { date: string; price: number };

export type CardDetail = {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[];
  imageUrl: string | null;
  setName: string;
  setSeries: string | null;
  setTotal: number | null;
  price: number | null;
  priceSource: "TCGPLAYER" | "CARDMARKET" | null;
  priceEstimated: boolean;
  priceRealSource: "TCGPLAYER" | "EBAY" | null;
  history: PricePoint[];
};

type HistoryRow = {
  source: "TCGPLAYER" | "CARDMARKET";
  condition: string | null;
  price: string;
  capturedDate: Date;
};

export async function getCardDetail(
  id: string,
  condition: Condition = "NM"
): Promise<CardDetail | null> {
  const card = await prisma.card.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      number: true,
      rarity: true,
      supertype: true,
      subtypes: true,
      imageUrl: true,
      tcgplayerProductId: true,
      set: { select: { name: true, series: true, totalCards: true } },
    },
  });
  if (!card) return null;

  const rows = await prisma.$queryRaw<HistoryRow[]>`
    SELECT source, condition, price::text AS price, "capturedDate"
    FROM "PriceSnapshot"
    WHERE "cardId" = ${id} AND "priceType" = 'MARKET'
      AND source IN ('TCGPLAYER', 'CARDMARKET')
    ORDER BY "capturedDate" ASC
  `;

  let history: PricePoint[] = [];
  let priceSource: "TCGPLAYER" | "CARDMARKET" | null = null;
  let printingVariant: string | null = null;

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    // Prefer TCGplayer if the most recent day has both sources; otherwise
    // use whichever source produced the last row.
    const lastDateKey = last.capturedDate.toISOString().slice(0, 10);
    const lastDayRows = rows.filter(
      (r) => r.capturedDate.toISOString().slice(0, 10) === lastDateKey
    );
    const chosen = lastDayRows.find((r) => r.source === "TCGPLAYER") ?? last;
    priceSource = chosen.source;
    printingVariant = chosen.condition;

    history = rows
      .filter((r) => r.source === chosen.source && r.condition === chosen.condition)
      .map((r) => ({
        date: r.capturedDate.toISOString().slice(0, 10),
        price: parseFloat(r.price),
      }));
  }

  let price = history.length > 0 ? history[history.length - 1].price : null;
  let priceEstimated = false;
  let priceRealSource: "TCGPLAYER" | "EBAY" | null = null;

  if (condition !== "NM" && price != null) {
    const adjusted = await getConditionAdjustedPrice({
      cardId: card.id,
      cardName: card.name,
      setName: card.set.name,
      number: card.number,
      tcgplayerProductId: card.tcgplayerProductId,
      printingVariant,
      basePrice: price,
      condition,
    });
    const ratio = adjusted.price / price;
    history = history.map((p) => ({ date: p.date, price: p.price * ratio }));
    price = adjusted.price;
    priceEstimated = adjusted.estimated;
    priceRealSource = adjusted.source ?? null;
  }

  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    supertype: card.supertype,
    subtypes: card.subtypes,
    imageUrl: card.imageUrl,
    setName: card.set.name,
    setSeries: card.set.series,
    setTotal: card.set.totalCards,
    price,
    priceSource,
    priceEstimated,
    priceRealSource,
    history,
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
