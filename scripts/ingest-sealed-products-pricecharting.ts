import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { resolveConsoleSlug, getConsoleCatalog, type PriceChartingResult } from "@/lib/pricecharting";
import { capturePriceSnapshot } from "@/lib/price-snapshot";

// PriceCharting has no self-serve API -- see lib/pricecharting.ts for why we
// scrape its public pages instead. Per-type text search ("Pokemon {set}
// elite trainer box") gets flooded with individual-card results that also
// match "Pokemon {set}", burying the actual sealed product past the
// ~100-result cap. Fetching each set's full console catalog page instead
// (one request, after resolving its slug) reliably surfaces every sealed
// product regardless of how PriceCharting's fuzzy search would rank it.

// Word-boundary matches only -- a bare /tin/i also matches "Victini",
// "Latin", etc. as substrings, silently classifying an individual card as
// a Tin. Every pattern here uses \b for the same reason, even ones that
// look safe today (e.g. a card named "Boxer" would match a boundary-less
// "box").
const TYPE_PATTERNS: { type: string; pattern: RegExp }[] = [
  { type: "ELITE_TRAINER_BOX", pattern: /\belite trainer\b/i },
  { type: "BOOSTER_BOX", pattern: /\bbooster box\b/i },
  { type: "BOOSTER_PACK", pattern: /\bbooster pack\b/i },
  { type: "BUNDLE", pattern: /\bbundle\b/i },
  { type: "BLISTER", pattern: /\bblister\b/i },
  { type: "COLLECTION_BOX", pattern: /\bcollection\b/i },
  { type: "TIN", pattern: /\btin\b/i },
];

// Names that match a TYPE_PATTERNS regex but aren't the base sealed product
// for the set (promo variants, exclusive collector's editions, etc.) --
// skip these rather than guessing which one is "the" product for the set.
const EXCLUDE_PATTERNS = [/pokemon center/i, /prerelease/i, /promo/i, /staff/i, /kit/i];

// Individual cards are listed with a card number ("#30", "030/236") --
// a card named e.g. "Tin Cup" would otherwise pass the word-boundary regex
// above and get misclassified as a sealed Tin.
function looksLikeIndividualCard(name: string): boolean {
  return /#\d|\d+\/\d+/.test(name);
}

function classify(name: string): string | null {
  if (looksLikeIndividualCard(name)) return null;
  if (EXCLUDE_PATTERNS.some((p) => p.test(name))) return null;
  const match = TYPE_PATTERNS.find((t) => t.pattern.test(name));
  return match?.type ?? null;
}

const SUFFIX_BY_TYPE: Record<string, string> = {
  BOOSTER_BOX: "Booster Box",
  BOOSTER_PACK: "Booster Pack",
  ELITE_TRAINER_BOX: "Elite Trainer Box",
  BUNDLE: "Booster Bundle",
  BLISTER: "Blister",
  COLLECTION_BOX: "Collection Box",
  TIN: "Tin",
};

const REQUEST_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertSealedProduct(
  setId: string,
  setName: string,
  type: string,
  match: PriceChartingResult
): Promise<boolean> {
  const name = `${setName} ${SUFFIX_BY_TYPE[type]}`;
  try {
    const product = await prisma.sealedProduct.upsert({
      where: { setId_name: { setId, name } },
      create: {
        setId,
        name,
        type: type as never,
        pricechartingId: match.pricechartingId,
        imageUrl: match.imageUrl,
      },
      update: { name, pricechartingId: match.pricechartingId, imageUrl: match.imageUrl },
    });

    await capturePriceSnapshot({
      entityId: product.id,
      entityField: "sealedProductId",
      source: "PRICECHARTING",
      priceType: "MARKET",
      condition: null,
      price: match.price!,
    });

    console.log(`  ${name}: $${match.price!.toFixed(2)}`);
    return true;
  } catch (err) {
    // A pricechartingId can occasionally collide with a product already
    // attached to a different set (e.g. a shared cross-set promo item) --
    // skip it rather than aborting the whole ingestion run.
    console.log(`  Skipping "${name}": ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    return false;
  }
}

async function processSet(setId: string, setName: string): Promise<number> {
  const slug = await resolveConsoleSlug(setName);
  if (!slug) {
    console.log(`  No PriceCharting console match for "${setName}"`);
    return 0;
  }

  const catalog = await getConsoleCatalog(slug);

  // Keep only the first (best) match per type -- a console page can list
  // multiple variants (e.g. "Booster Box" and "Booster Box [24-Pack]").
  const byType = new Map<string, PriceChartingResult>();
  for (const item of catalog) {
    if (item.price == null) continue;
    const type = classify(item.name);
    if (!type || byType.has(type)) continue;
    byType.set(type, item);
  }

  let matched = 0;
  for (const [type, match] of byType) {
    if (await upsertSealedProduct(setId, setName, type, match)) matched += 1;
  }
  if (matched === 0) {
    console.log(`  No sealed products found in "${setName}" console catalog (${catalog.length} rows)`);
  }
  return matched;
}

async function main() {
  const sets = await prisma.cardSet.findMany({
    orderBy: { releaseDate: "desc" },
    select: { id: true, name: true },
  });

  let matched = 0;
  for (const set of sets) {
    console.log(`Searching sealed product for "${set.name}"...`);
    try {
      matched += await processSet(set.id, set.name);
    } catch (err) {
      // A single flaky/rate-limited request shouldn't abort the whole run.
      console.log(`  Request failed: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`Captured prices for ${matched} sealed products.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
