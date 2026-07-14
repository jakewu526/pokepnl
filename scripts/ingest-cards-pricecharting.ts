import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";
import {
  downloadPriceGuide,
  buildConsoleIndex,
  matchSetConsole,
  parseCardNumber,
  normalizeNumber,
  isEnglishCardGenre,
  isForeignConsole,
  tightNormalize,
  resolveOrCreateSet,
  firstErrorLine,
  FLAT_PROMO_CONSOLE,
  SUBSET_NUMBER_PREFIX,
  ANY_SUBSET_NUMBER_PATTERN,
  type PriceGuideRow,
  type ConsoleIndex,
} from "@/lib/pricecharting-api";

// Stage 1 of the PriceCharting integration: one bulk price-guide download
// linked/created against every Card via number-within-set matching, no
// per-product scraping. Fast (single HTTP request, <1 min to run) -- images
// and historic price series are a separate, much slower job
// (scripts/backfill-pricecharting-details.ts) since those require scraping
// each product's page individually.

// Prefer the row with no bracketed print-variant qualifier ("Abra #43" over
// "Abra [1st Edition] #43") since our schema doesn't model those separately;
// among ties, prefer higher sales-volume as the better signal of "the"
// canonical listing.
function pickCanonicalRow(rows: PriceGuideRow[]): PriceGuideRow {
  const parsed = rows.map((row) => ({ row, parsed: parseCardNumber(row.productName)! }));
  const unqualified = parsed.filter((p) => !p.parsed.hasVariantQualifier);
  const pool = unqualified.length > 0 ? unqualified : parsed;
  return pool.reduce((best, cur) => (cur.row.salesVolume > best.row.salesVolume ? cur : best)).row;
}

// Exact match first; falling back to a zero-padding-insensitive comparison
// ("SV001" vs PriceCharting's "SV1", "004" vs "4") over the set's existing
// cards catches the rest without guessing a single padding convention.
async function findExistingCardId(setId: string, number: string): Promise<string | null> {
  const exact = await prisma.card.findFirst({ where: { setId, number }, select: { id: true } });
  if (exact) return exact.id;

  const normalized = normalizeNumber(number);
  const candidates = await prisma.card.findMany({ where: { setId }, select: { id: true, number: true } });
  return candidates.find((c) => normalizeNumber(c.number) === normalized)?.id ?? null;
}

async function linkOrCreateCard(
  setId: string,
  number: string,
  name: string,
  row: PriceGuideRow
): Promise<"linked" | "created" | "skipped"> {
  if (row.loosePrice == null) return "skipped";

  try {
    const existingId = await findExistingCardId(setId, number);
    const card = existingId
      ? await prisma.card.update({
          where: { id: existingId },
          data: { pricechartingId: row.pricechartingId },
        })
      : await prisma.card.create({
          data: {
            setId,
            number,
            name,
            pricechartingId: row.pricechartingId,
            tcgplayerProductId: row.tcgId,
          },
        });

    await capturePriceSnapshot({
      entityId: card.id,
      entityField: "cardId",
      source: "PRICECHARTING",
      priceType: "MARKET",
      condition: null,
      price: row.loosePrice,
    });

    return existingId ? "linked" : "created";
  } catch (err) {
    // pricechartingId/tcgplayerProductId can collide with a card already
    // linked from a different console (rare cross-set promo duplicates) --
    // skip rather than abort the whole run.
    console.log(
      `    Skipping "${name} #${number}": ${firstErrorLine(err)}`,
    );
    return "skipped";
  }
}

// "Trainer Gallery"/"Shiny Vault"/"Galarian Gallery" subsets share their
// parent set's PriceCharting console (see SUBSET_NUMBER_PREFIX) -- without
// this, both the subset and its parent would independently claim every row
// in that console and create duplicate cards for whichever numbers don't
// belong to them.
function filterRowsForSet(setName: string, rows: PriceGuideRow[]): PriceGuideRow[] {
  const subsetPattern = SUBSET_NUMBER_PREFIX[setName];
  return rows.filter((row) => {
    const parsed = parseCardNumber(row.productName);
    if (!parsed) return false;
    return subsetPattern ? subsetPattern.test(parsed.number) : !ANY_SUBSET_NUMBER_PATTERN.test(parsed.number);
  });
}

async function processConsoleCards(setId: string, rows: PriceGuideRow[]) {
  const byNumber = new Map<string, PriceGuideRow[]>();
  for (const row of rows) {
    if (!isEnglishCardGenre(row.genre)) continue;
    const parsed = parseCardNumber(row.productName);
    if (!parsed) continue;
    const list = byNumber.get(parsed.number) ?? [];
    list.push(row);
    byNumber.set(parsed.number, list);
  }

  const counts = { linked: 0, created: 0, skipped: 0 };
  for (const [number, candidates] of byNumber) {
    const row = pickCanonicalRow(candidates);
    const parsed = parseCardNumber(row.productName)!;
    const result = await linkOrCreateCard(setId, number, parsed.name, row);
    counts[result] += 1;
  }
  return counts;
}

// PriceCharting bundles every English promo era into one flat "Pokemon
// Promo" console instead of splitting by era like our CardSets do. Only
// era-prefixed numbers ("XY01", "SM244", "SWSH083") are safe to match
// cross-set this way -- bare numeric promo numbers ("1", "2") are ambiguous
// across multiple eras (Wizards/Nintendo/Scarlet & Violet promos all use
// small bare numbers) and are skipped rather than guessed.
async function processFlatPromoConsole(rows: PriceGuideRow[]) {
  const promoSets = await prisma.cardSet.findMany({
    where: { name: { contains: "Promo", mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const counts = { linked: 0, created: 0, skipped: 0, ambiguous: 0 };
  for (const row of rows) {
    if (!isEnglishCardGenre(row.genre)) continue;
    const parsed = parseCardNumber(row.productName);
    if (!parsed) continue;
    if (!/^[A-Za-z]+\d+$/.test(parsed.number)) {
      counts.ambiguous += 1;
      continue;
    }

    let linkedToAnySet = false;
    for (const set of promoSets) {
      const card = await prisma.card.findFirst({ where: { setId: set.id, number: parsed.number } });
      if (!card) continue;
      // A pre-existing card was found by number, so linkOrCreateCard always
      // takes its "update" branch here (never "created").
      const result = await linkOrCreateCard(set.id, parsed.number, parsed.name, row);
      counts[result] += 1;
      linkedToAnySet = true;
      break;
    }
    if (!linkedToAnySet) counts.skipped += 1;
  }
  return counts;
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
    if (key === tightNormalize(FLAT_PROMO_CONSOLE)) continue; // handled separately below

    const counts = await processConsoleCards(set.id, filterRowsForSet(set.name, consoleRows));
    totals.linked += counts.linked;
    totals.created += counts.created;
    totals.skipped += counts.skipped;
    if (counts.linked || counts.created) {
      console.log(`${set.name}: linked ${counts.linked}, created ${counts.created}`);
    }
  }

  // Anything left unclaimed with card rows and not the flat promo bucket is
  // a set we don't have at all yet (KFC/Topps promos, regional exclusives,
  // etc.) -- create it and pull in its cards.
  for (const [key, entry] of index) {
    if (claimedKeys.has(key)) continue;
    if (key === tightNormalize(FLAT_PROMO_CONSOLE)) continue;
    if (isForeignConsole(entry.consoleName)) continue;
    if (!entry.rows.some((r) => isEnglishCardGenre(r.genre))) continue;

    const { id, created } = await resolveOrCreateSet(entry.consoleName);
    if (created) totals.newSets += 1;
    const counts = await processConsoleCards(id, entry.rows);
    totals.linked += counts.linked;
    totals.created += counts.created;
    totals.skipped += counts.skipped;
    if (counts.linked || counts.created) {
      console.log(
        `${entry.consoleName}${created ? " (new set)" : ""}: linked ${counts.linked}, created ${counts.created}`
      );
    }
  }

  const promoEntry = index.get(tightNormalize(FLAT_PROMO_CONSOLE));
  if (promoEntry) {
    console.log(`\nProcessing flat "${FLAT_PROMO_CONSOLE}" console (${promoEntry.rows.length} rows)...`);
    const promoCounts = await processFlatPromoConsole(promoEntry.rows);
    totals.linked += promoCounts.linked;
    totals.created += promoCounts.created;
    totals.skipped += promoCounts.skipped;
    console.log(
      `Promo: linked ${promoCounts.linked}, skipped ${promoCounts.skipped} (${promoCounts.ambiguous} bare-numbered rows skipped as era-ambiguous)`
    );
  }

  console.log(
    `\nDone. Linked ${totals.linked} existing cards, created ${totals.created} new cards across ${totals.newSets} new sets (${totals.skipped} skipped).`
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
