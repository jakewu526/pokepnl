import "dotenv/config";
import { prisma } from "@/lib/prisma";

const API_BASE = "https://api.pokemontcg.io/v2";

type PokemonTcgSet = {
  id: string;
  ptcgoCode?: string;
  images?: { symbol?: string; logo?: string };
};

function apiHeaders(): HeadersInit {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  return apiKey ? { "X-Api-Key": apiKey } : {};
}

async function fetchJson<T>(url: string, retries = 7): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: apiHeaders() });
    if (res.ok) return res.json() as Promise<T>;

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

async function main() {
  console.log("Fetching sets...");
  const { data: sets } = await fetchJson<{ data: PokemonTcgSet[] }>(`${API_BASE}/sets`);

  let updated = 0;
  for (const set of sets) {
    const result = await prisma.cardSet.updateMany({
      where: { pokemonTcgIoId: set.id },
      data: {
        code: set.ptcgoCode ?? null,
        logoUrl: set.images?.logo ?? null,
        symbolUrl: set.images?.symbol ?? null,
      },
    });
    updated += result.count;
  }
  console.log(`Updated ${updated} sets with branding.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
