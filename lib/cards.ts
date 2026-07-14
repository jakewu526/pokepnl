import { prisma } from "@/lib/prisma";
import { densifyHistory } from "@/lib/densify";

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
  priceSource: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET" | null;
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
  priceSource: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET" | null;
  history: PricePoint[];
};

type HistoryRow = {
  source: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET";
  condition: string | null;
  price: string;
  capturedDate: Date;
};

export async function getCardDetail(id: string): Promise<CardDetail | null> {
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
      set: { select: { name: true, series: true, totalCards: true } },
    },
  });
  if (!card) return null;

  const rows = await prisma.$queryRaw<HistoryRow[]>`
    SELECT source, condition, price::text AS price, "capturedDate"
    FROM "PriceSnapshot"
    WHERE "cardId" = ${id} AND "priceType" = 'MARKET'
      AND source IN ('PRICECHARTING', 'TCGPLAYER', 'CARDMARKET')
    ORDER BY "capturedDate" ASC
  `;

  let history: PricePoint[] = [];
  let priceSource: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET" | null = null;

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    // Prefer PriceCharting, then TCGplayer, if the most recent day has
    // multiple sources; otherwise use whichever source produced the last row.
    const lastDateKey = last.capturedDate.toISOString().slice(0, 10);
    const lastDayRows = rows.filter(
      (r) => r.capturedDate.toISOString().slice(0, 10) === lastDateKey
    );
    const chosen =
      lastDayRows.find((r) => r.source === "PRICECHARTING") ??
      lastDayRows.find((r) => r.source === "TCGPLAYER") ??
      last;
    priceSource = chosen.source;

    history = rows
      .filter((r) => r.source === chosen.source && r.condition === chosen.condition)
      .map((r) => ({
        date: r.capturedDate.toISOString().slice(0, 10),
        price: parseFloat(r.price),
      }));
    // Fill the gaps between real monthly captures with synthetic interpolated
    // points so short ranges render sensibly (see lib/densify.ts).
    history = densifyHistory(history, id);
  }

  const price = history.length > 0 ? history[history.length - 1].price : null;

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
    history,
  };
}

type LatestPriceRow = { cardId: string; source: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET"; price: string };

export async function getLatestPrices(
  cardIds: string[]
): Promise<Map<string, { price: number; source: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET" }>> {
  if (cardIds.length === 0) return new Map();

  // Latest MARKET-type snapshot per (card, source); prefer PriceCharting,
  // then TCGplayer, then Cardmarket when multiple are available for a card.
  const rows = await prisma.$queryRaw<LatestPriceRow[]>`
    SELECT DISTINCT ON ("cardId", source) "cardId", source, price::text AS price
    FROM "PriceSnapshot"
    WHERE "cardId" = ANY(${cardIds}) AND "priceType" = 'MARKET'
    ORDER BY "cardId", source, "capturedDate" DESC
  `;

  const sourceRank: Record<string, number> = { PRICECHARTING: 0, TCGPLAYER: 1, CARDMARKET: 2 };
  const map = new Map<string, { price: number; source: "PRICECHARTING" | "TCGPLAYER" | "CARDMARKET" }>();
  for (const row of rows) {
    const existing = map.get(row.cardId);
    if (!existing || sourceRank[row.source] < sourceRank[existing.source]) {
      map.set(row.cardId, { price: parseFloat(row.price), source: row.source });
    }
  }
  return map;
}

// Matches lib/pricecharting.ts's GRADE_LABELS values, in the order
// PriceCharting itself displays them (raw card up through the highest
// tracked grade tier).
export const GRADE_DISPLAY_ORDER = ["Ungraded", "Grade 7", "Grade 8", "Grade 9", "Grade 9.5", "PSA 10"];

export type GradePriceSeries = {
  grade: string;
  history: PricePoint[];
  currentPrice: number | null;
};

type GradeHistoryRow = { condition: string | null; price: string; capturedDate: Date };

// One series per PriceCharting grade tier (see scripts/backfill-pricecharting-details.ts),
// each capped to its own history -- unlike getCardDetail's single chosen
// series, this powers a multi-line grade-comparison chart, so every
// available grade's full history is returned.
export async function getCardGradeHistories(cardId: string): Promise<GradePriceSeries[]> {
  const rows = await prisma.$queryRaw<GradeHistoryRow[]>`
    SELECT condition, price::text AS price, "capturedDate"
    FROM "PriceSnapshot"
    WHERE "cardId" = ${cardId} AND source = 'PRICECHARTING' AND "priceType" = 'MARKET'
    ORDER BY "capturedDate" ASC
  `;
  if (rows.length === 0) return [];

  const byGrade = new Map<string, PricePoint[]>();
  for (const row of rows) {
    const grade = row.condition ?? "Ungraded";
    const list = byGrade.get(grade) ?? [];
    list.push({ date: row.capturedDate.toISOString().slice(0, 10), price: parseFloat(row.price) });
    byGrade.set(grade, list);
  }

  return GRADE_DISPLAY_ORDER.filter((grade) => byGrade.has(grade)).map((grade) => {
    const raw = byGrade.get(grade)!;
    // Seed per grade so each tier gets its own independent wiggle.
    const history = densifyHistory(raw, `${cardId}:${grade}`);
    return { grade, history, currentPrice: raw[raw.length - 1]?.price ?? null };
  });
}
