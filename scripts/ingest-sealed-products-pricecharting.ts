import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";
import {
  downloadPriceGuide,
  buildConsoleIndex,
  matchSetConsole,
  isSealedGenre,
  isForeignConsole,
  isJapaneseConsole,
  tightNormalize,
  resolveOrCreateSet,
  firstErrorLine,
  FLAT_PROMO_CONSOLE,
  type PriceGuideRow,
  type ConsoleIndex,
} from "@/lib/pricecharting-api";

// Sources sealed products from the same bulk price-guide download used by
// ingest-cards-pricecharting.ts instead of scraping each set's console page
// individually -- one HTTP request instead of ~173, and it catches sets the
// old per-console `resolveConsoleSlug` search missed (its exact-normalized-
// match requirement failed on classic-era sets like "Base" vs PriceCharting's
// "Pokemon Base Set").

// Word-boundary matches only -- a bare /tin/i also matches "Victini",
// "Latin", etc. as substrings, silently classifying an individual card as
// a Tin. Every pattern here uses \b for the same reason, even ones that
// look safe today (e.g. a card named "Boxer" would match a boundary-less
// "box").
//
// Every sealed row gets a bucket -- unmatched names fall through to OTHER
// (see classify) rather than being dropped. Order matters: more specific
// patterns (booster box/pack) must come before the generic collection/box
// catch-alls.
const TYPE_PATTERNS: { type: string; pattern: RegExp }[] = [
  { type: "ELITE_TRAINER_BOX", pattern: /\belite trainer\b/i },
  { type: "BOOSTER_BOX", pattern: /\bbooster (box|display)\b/i },
  { type: "BOOSTER_PACK", pattern: /\bbooster pack\b/i },
  { type: "BUNDLE", pattern: /\bbundle\b/i },
  { type: "BLISTER", pattern: /\bblister\b/i },
  { type: "TIN", pattern: /\btin\b/i },
  { type: "COLLECTION_BOX", pattern: /\b(collection|premium collection|pin collection)\b/i },
];

function classify(name: string): string {
  const match = TYPE_PATTERNS.find((t) => t.pattern.test(name));
  return match?.type ?? "OTHER";
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

// A row's raw productName is the only thing that distinguishes real
// variants of the same type within one set/console -- a plain "Booster Box"
// gets the clean "<set> Booster Box" name, but "Elite Trainer Box [Pokemon
// Center]" or "Costco 2-Pack Trainer Box & Booster Bundle" must keep their
// distinguishing text or they'd collide with (and silently overwrite) the
// base product under the old one-row-per-type scheme.
function buildName(setName: string | null, type: string, row: PriceGuideRow): string {
  const suffix = SUFFIX_BY_TYPE[type];
  const bare = row.productName.replace(/\s*\[.*?\]\s*/g, "").trim();
  const label = suffix && bare.toLowerCase() === suffix.toLowerCase() ? suffix : row.productName;
  return setName ? `${setName} ${label}` : label;
}

async function upsertSealedProduct(
  setId: string | null,
  name: string,
  type: string,
  row: PriceGuideRow
): Promise<"linked" | "created" | "skipped"> {
  try {
    // Prisma's typed compound-unique `where` rejects `null` for a component
    // field, so setId_name can't be used via upsert() when setId is null
    // (flat-promo-console sealed items with no set) -- findFirst + create/
    // update works for both cases.
    const existing = await prisma.sealedProduct.findFirst({ where: { setId, name } });
    if (existing) {
      await prisma.sealedProduct.update({
        where: { id: existing.id },
        data: { pricechartingId: row.pricechartingId, type: type as never },
      });
    } else {
      await prisma.sealedProduct.create({
        data: { setId, name, type: type as never, pricechartingId: row.pricechartingId },
      });
    }

    const product = existing ?? (await prisma.sealedProduct.findFirst({ where: { setId, name } }))!;
    await capturePriceSnapshot({
      entityId: product.id,
      entityField: "sealedProductId",
      source: "PRICECHARTING",
      priceType: "MARKET",
      condition: null,
      price: row.loosePrice,
    });

    console.log(`  ${name}: $${row.loosePrice.toFixed(2)}`);
    return existing ? "linked" : "created";
  } catch (err) {
    // A pricechartingId can occasionally collide with a product already
    // attached to a different set (e.g. a shared cross-set promo item) --
    // skip it rather than aborting the whole ingestion run.
    console.log(`  Skipping "${name}": ${firstErrorLine(err)}`);
    return "skipped";
  }
}

// Every priced sealed row for a console becomes its own product -- retailer
// exclusives (Costco, Sam's Club), Pokemon Center variants, theme/battle
// decks, premium collections, etc. are each genuinely distinct product a
// collector can buy and resell, not noise to collapse away. The only
// dedup is exact-productName repeats (shouldn't occur in PriceCharting's
// export, but guards against double-processing all the same).
function sealedRowsForConsole(rows: PriceGuideRow[]): PriceGuideRow[] {
  const seen = new Set<string>();
  const result: PriceGuideRow[] = [];
  for (const row of rows) {
    if (!isSealedGenre(row.genre) || row.loosePrice == null) continue;
    if (seen.has(row.productName)) continue;
    seen.add(row.productName);
    result.push(row);
  }
  return result;
}

async function main() {
  console.log("Downloading PriceCharting price guide (pokemon-cards)...");
  const rows = await downloadPriceGuide("pokemon-cards");
  console.log(`Downloaded ${rows.length} rows.`);

  const index: ConsoleIndex = buildConsoleIndex(rows);
  const sets = await prisma.cardSet.findMany({ select: { id: true, name: true } });

  const claimedKeys = new Set<string>();
  const totals = { linked: 0, created: 0, skipped: 0, newSets: 0 };

  for (const set of sets) {
    const consoleRows = matchSetConsole(set.name, index);
    if (!consoleRows) continue;

    const key = tightNormalize(consoleRows[0].consoleName);
    claimedKeys.add(key);
    if (key === tightNormalize(FLAT_PROMO_CONSOLE)) continue; // no single set to attach these to

    const sealedRows = sealedRowsForConsole(consoleRows);
    if (sealedRows.length === 0) continue;
    console.log(`${set.name}:`);
    for (const row of sealedRows) {
      const type = classify(row.productName);
      const name = buildName(set.name, type, row);
      const result = await upsertSealedProduct(set.id, name, type, row);
      totals[result] += 1;
    }
  }

  // Consoles with sealed rows but no matching CardSet -- create a set for
  // them (unless it's the flat promo bucket, which has no natural set).
  for (const [key, entry] of index) {
    if (claimedKeys.has(key)) continue;
    if (key === tightNormalize(FLAT_PROMO_CONSOLE)) continue;
    if (isForeignConsole(entry.consoleName) && !isJapaneseConsole(entry.consoleName)) continue;

    const sealedRows = sealedRowsForConsole(entry.rows);
    if (sealedRows.length === 0) continue;

    const { id, created } = await resolveOrCreateSet(entry.consoleName);
    if (created) totals.newSets += 1;
    const setName = entry.consoleName.replace(/^Pokemon\s+/i, "");
    console.log(`${setName}${created ? " (new set)" : ""}:`);
    for (const row of sealedRows) {
      const type = classify(row.productName);
      const name = buildName(setName, type, row);
      const result = await upsertSealedProduct(id, name, type, row);
      totals[result] += 1;
    }
  }

  // Flat promo-console sealed items (boxes/blisters sold as standalone
  // promos, not tied to a numbered set) get no CardSet -- store them under
  // their raw PriceCharting product name instead of a "<set> <type>" name.
  const promoEntry = index.get(tightNormalize(FLAT_PROMO_CONSOLE));
  if (promoEntry) {
    const sealedPromoRows = sealedRowsForConsole(promoEntry.rows);
    console.log(`\nProcessing flat "${FLAT_PROMO_CONSOLE}" sealed items (${sealedPromoRows.length} rows)...`);
    for (const row of sealedPromoRows) {
      const type = classify(row.productName);
      const name = buildName(null, type, row);
      const result = await upsertSealedProduct(null, name, type, row);
      totals[result] += 1;
    }
  }

  console.log(
    `\nDone. Linked ${totals.linked} existing sealed products, created ${totals.created} new ones across ${totals.newSets} new sets (${totals.skipped} skipped).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
