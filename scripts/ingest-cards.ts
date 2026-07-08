import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";

const API_BASE = "https://api.pokemontcg.io/v2";
const PAGE_SIZE = 250;

type PokemonTcgSet = {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
  total: number;
};

// pokemontcg.io mirrors TCGplayer and Cardmarket pricing on every card for
// free (no API key from either marketplace required) -- see
// https://docs.pokemontcg.io/api-reference/cards/card-object
type TcgplayerPriceEntry = {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  directLow?: number;
};

type CardmarketPrices = {
  trendPrice?: number;
  lowPrice?: number;
  averageSellPrice?: number;
  reverseHoloTrend?: number;
  reverseHoloLow?: number;
};

type PokemonTcgCard = {
  id: string;
  name: string;
  number: string;
  supertype: string;
  subtypes?: string[];
  rarity?: string;
  images?: { large?: string; small?: string };
  set: { id: string };
  tcgplayer?: { prices?: Record<string, TcgplayerPriceEntry> };
  cardmarket?: { prices?: CardmarketPrices };
};

async function captureCardPrices(cardId: string, card: PokemonTcgCard): Promise<void> {
  const capturedAt = new Date();

  for (const [variant, entry] of Object.entries(card.tcgplayer?.prices ?? {})) {
    const fields: [keyof TcgplayerPriceEntry, "MARKET" | "LOW" | "MID" | "HIGH" | "DIRECT_LOW"][] = [
      ["market", "MARKET"],
      ["low", "LOW"],
      ["mid", "MID"],
      ["high", "HIGH"],
      ["directLow", "DIRECT_LOW"],
    ];
    for (const [field, priceType] of fields) {
      const price = entry[field];
      if (price == null) continue;
      await capturePriceSnapshot({
        entityId: cardId,
        entityField: "cardId",
        source: "TCGPLAYER",
        priceType,
        condition: variant,
        price,
        capturedAt,
      });
    }
  }

  const cardmarket = card.cardmarket?.prices;
  if (cardmarket) {
    const entries: [number | undefined, "MARKET" | "LOW", string][] = [
      [cardmarket.trendPrice, "MARKET", "normal"],
      [cardmarket.lowPrice, "LOW", "normal"],
      [cardmarket.reverseHoloTrend, "MARKET", "reverseHolo"],
      [cardmarket.reverseHoloLow, "LOW", "reverseHolo"],
    ];
    for (const [price, priceType, condition] of entries) {
      if (price == null) continue;
      await capturePriceSnapshot({
        entityId: cardId,
        entityField: "cardId",
        source: "CARDMARKET",
        priceType,
        condition,
        price,
        capturedAt,
      });
    }
  }
}

function apiHeaders(): HeadersInit {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  return apiKey ? { "X-Api-Key": apiKey } : {};
}

async function fetchJson<T>(url: string, retries = 7): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: apiHeaders() });
    if (res.ok) return res.json() as Promise<T>;

    // The free/unauthenticated pokemontcg.io tier is heavily rate-limited
    // and returns spurious 404s/504s under load rather than clean 429s.
    const retryable = [404, 429, 502, 503, 504].includes(res.status);
    if (!retryable || attempt === retries) {
      throw new Error(`Request to ${url} failed: ${res.status} ${res.statusText}`);
    }
    const delayMs = 1000 * 2 ** attempt;
    console.warn(`  ${res.status} on ${url}, retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("unreachable");
}

async function ingestSets(): Promise<void> {
  console.log("Fetching sets...");
  const { data: sets } = await fetchJson<{ data: PokemonTcgSet[] }>(`${API_BASE}/sets`);

  for (const set of sets) {
    await prisma.cardSet.upsert({
      where: { pokemonTcgIoId: set.id },
      create: {
        pokemonTcgIoId: set.id,
        name: set.name,
        series: set.series,
        releaseDate: set.releaseDate ? new Date(set.releaseDate) : null,
        totalCards: set.total,
      },
      update: {
        name: set.name,
        series: set.series,
        releaseDate: set.releaseDate ? new Date(set.releaseDate) : null,
        totalCards: set.total,
      },
    });
  }
  console.log(`Upserted ${sets.length} sets.`);
}

async function ingestCards(): Promise<void> {
  let page = 1;
  let totalIngested = 0;

  while (true) {
    console.log(`Fetching cards page ${page}...`);
    const { data: cards } = await fetchJson<{ data: PokemonTcgCard[] }>(
      `${API_BASE}/cards?page=${page}&pageSize=${PAGE_SIZE}`
    );

    if (cards.length === 0) break;

    for (const card of cards) {
      const set = await prisma.cardSet.findUnique({
        where: { pokemonTcgIoId: card.set.id },
      });
      if (!set) {
        console.warn(`Skipping card ${card.id}: set ${card.set.id} not found`);
        continue;
      }

      const dbCard = await prisma.card.upsert({
        where: { pokemonTcgIoId: card.id },
        create: {
          pokemonTcgIoId: card.id,
          setId: set.id,
          number: card.number,
          name: card.name,
          rarity: card.rarity,
          supertype: card.supertype,
          subtypes: card.subtypes ?? [],
          imageUrl: card.images?.large ?? card.images?.small,
        },
        update: {
          name: card.name,
          rarity: card.rarity,
          supertype: card.supertype,
          subtypes: card.subtypes ?? [],
          imageUrl: card.images?.large ?? card.images?.small,
        },
      });

      await captureCardPrices(dbCard.id, card);
    }

    totalIngested += cards.length;
    if (cards.length < PAGE_SIZE) break;
    page += 1;
  }

  console.log(`Upserted ${totalIngested} cards.`);
}

async function main() {
  await ingestSets();
  await ingestCards();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
