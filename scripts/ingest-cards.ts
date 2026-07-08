import "dotenv/config";
import { prisma } from "@/lib/prisma";

const API_BASE = "https://api.pokemontcg.io/v2";
const PAGE_SIZE = 250;

type PokemonTcgSet = {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
  total: number;
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
};

function apiHeaders(): HeadersInit {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  return apiKey ? { "X-Api-Key": apiKey } : {};
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
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

      await prisma.card.upsert({
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
