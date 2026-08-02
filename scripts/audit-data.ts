import "dotenv/config";
import { prisma } from "@/lib/prisma";

// Database-level half of TEST-PLAN.md: the DATA-*, PRICE-*, and IMG-* suites.
// Every check prints its case ID, so a run can be pasted straight into the
// plan's run log. Anything that should never happen is asserted as `expect 0`
// and marked FAIL, so a regression is greppable rather than eyeballed.
//
//   npm run audit:data

let failures = 0;

function check(id: string, label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  [${id}] ${label}: ${actual} (expected ${expected})`);
}

// For counts with a legitimate non-zero floor (upstream data gaps we can't
// close), where the point is to catch a systemic regression rather than to
// demand zero.
function checkMax(id: string, label: string, actual: number, ceiling: number) {
  const ok = actual <= ceiling;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  [${id}] ${label}: ${actual} (fails above ${ceiling})`);
}

function info(id: string, label: string, value: unknown) {
  console.log(`  ....  [${id}] ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function q<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}
async function count(sql: string): Promise<number> {
  const rows = await q<{ c: bigint | number }>(sql);
  return Number(rows[0].c);
}

async function main() {
  console.log(`Binder data audit — ${new Date().toISOString()}\n`);

  console.log("== Row counts (DATA-01) ==");
  const counts = await q<Record<string, bigint>>(`
    SELECT (SELECT count(*) FROM "CardSet") AS sets,
           (SELECT count(*) FROM "Card") AS cards,
           (SELECT count(*) FROM "SealedProduct") AS sealed,
           (SELECT count(*) FROM "PriceSnapshot") AS snapshots,
           (SELECT count(*) FROM "User") AS users,
           (SELECT count(*) FROM "CollectionItem") AS collection,
           (SELECT count(*) FROM "WatchlistItem") AS watchlist,
           (SELECT count(*) FROM "Transaction") AS transactions`);
  for (const [k, v] of Object.entries(counts[0])) console.log(`  ....  ${k.padEnd(13)} ${Number(v).toLocaleString()}`);

  console.log("\n== Data integrity ==");
  check("DATA-02", "cards with no set", await count(`SELECT count(*) c FROM "Card" c LEFT JOIN "CardSet" s ON c."setId"=s.id WHERE s.id IS NULL`), 0);
  check("DATA-04", "CollectionItem with both/neither target",
    await count(`SELECT count(*) c FROM "CollectionItem" WHERE ("cardId" IS NULL AND "sealedProductId" IS NULL) OR ("cardId" IS NOT NULL AND "sealedProductId" IS NOT NULL)`), 0);
  check("DATA-05", "WatchlistItem with both/neither target",
    await count(`SELECT count(*) c FROM "WatchlistItem" WHERE ("cardId" IS NULL AND "sealedProductId" IS NULL) OR ("cardId" IS NOT NULL AND "sealedProductId" IS NOT NULL)`), 0);
  check("DATA-07", "users with >1 featured watchlist item",
    await count(`SELECT count(*) c FROM (SELECT "userId" FROM "WatchlistItem" WHERE featured GROUP BY 1 HAVING count(*)>1) t`), 0);
  check("DATA-08", "duplicate (userId, cardId, condition) collection rows",
    await count(`SELECT count(*) c FROM (SELECT "userId","cardId",condition FROM "CollectionItem" WHERE "cardId" IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) t`), 0);
  check("DATA-10", "case-insensitive duplicate emails",
    await count(`SELECT count(*) c FROM (SELECT lower(email) FROM "User" GROUP BY 1 HAVING count(*)>1) t`), 0);
  check("DATA-11", "collection rows with quantity < 1", await count(`SELECT count(*) c FROM "CollectionItem" WHERE quantity < 1`), 0);
  check("DATA-11", "collection rows with negative cost", await count(`SELECT count(*) c FROM "CollectionItem" WHERE "costPerUnit" < 0`), 0);
  check("DATA-11", "transactions with quantity < 1", await count(`SELECT count(*) c FROM "Transaction" WHERE quantity < 1`), 0);
  info("DATA-03", "sets with NULL totalCards", await count(`SELECT count(*) c FROM "CardSet" WHERE "totalCards" IS NULL`));
  info("DATA-03", "sets holding more cards than totalCards",
    await count(`SELECT count(*) c FROM (SELECT s.id FROM "CardSet" s JOIN "Card" c ON c."setId"=s.id GROUP BY s.id, s."totalCards" HAVING s."totalCards" IS NOT NULL AND count(c.id) > s."totalCards") t`));
  info("DATA-09", "google-only users (no passwordHash)", await count(`SELECT count(*) c FROM "User" WHERE "passwordHash" IS NULL`));
  info("DATA-13", "cards with non-numeric numbers", await count(`SELECT count(*) c FROM "Card" WHERE number !~ '^[0-9]+$'`));

  console.log("\n== Prices ==");
  const freshness = await q<{ source: string; newest: string }>(
    `SELECT source::text, max("capturedDate")::text newest FROM "PriceSnapshot" GROUP BY 1 ORDER BY 1`
  );
  const today = new Date().toISOString().slice(0, 10);
  for (const f of freshness) {
    const ageDays = Math.round((Date.parse(today) - Date.parse(f.newest)) / 864e5);
    console.log(`  ${ageDays <= 3 ? "PASS" : "WARN"}  [PRICE-07] ${f.source} newest capture ${f.newest} (${ageDays}d old)`);
  }
  check("PRICE-08", "snapshots priced <= 0", await count(`SELECT count(*) c FROM "PriceSnapshot" WHERE price <= 0`), 0);
  check("PRICE-10", "duplicate snapshots on the same key",
    await count(`SELECT count(*) c FROM (SELECT "cardId",source,"capturedDate",variant,condition,"priceType" FROM "PriceSnapshot" WHERE "cardId" IS NOT NULL GROUP BY 1,2,3,4,5,6 HAVING count(*)>1) t`), 0);
  // Raw priced above PSA 10 is nonsense on its face, but a handful is normal:
  // the graded tiers are backfilled monthly while the raw price moves daily,
  // so a fresh spike outruns a stale PSA 10 quote. Only a large cluster means
  // the grade series has actually been mixed up, so scale the threshold.
  const invertedGrades = await count(`
    WITH latest AS (
      SELECT DISTINCT ON ("cardId", condition) "cardId", condition, price FROM "PriceSnapshot"
      WHERE source='PRICECHARTING' AND "priceType"='MARKET' AND "cardId" IS NOT NULL
      ORDER BY "cardId", condition, "capturedDate" DESC)
    SELECT count(*) c FROM latest u JOIN latest g ON u."cardId"=g."cardId"
    WHERE u.condition IS NULL AND g.condition='PSA 10' AND u.price > g.price`);
  const gradedCards = await count(`SELECT count(DISTINCT "cardId") c FROM "PriceSnapshot" WHERE source='PRICECHARTING' AND condition='PSA 10'`);
  const invertedPct = gradedCards ? (invertedGrades / gradedCards) * 100 : 0;
  const gradesOk = invertedPct < 1;
  if (!gradesOk) failures++;
  console.log(`  ${gradesOk ? "PASS" : "FAIL"}  [PRICE-11] cards priced above their own PSA 10: ${invertedGrades} of ${gradedCards.toLocaleString()} (${invertedPct.toFixed(2)}%, fails at 1%)`);
  // The regression this guards: PriceCharting writes one MARKET/NORMAL row per
  // grade tier on the SAME capturedDate as the raw row, so any "latest price"
  // query without a condition filter can return PSA-10 money for a raw card.
  check("PRICE-05", "cards whose latest raw price resolves to a graded row", await count(`
    WITH latest AS (
      SELECT DISTINCT ON ("cardId") "cardId", condition FROM "PriceSnapshot"
      WHERE source='PRICECHARTING' AND "priceType"='MARKET' AND variant='NORMAL' AND "cardId" IS NOT NULL
        AND condition IS NULL
      ORDER BY "cardId", "capturedDate" DESC)
    SELECT count(*) c FROM latest WHERE condition IS NOT NULL`), 0);
  info("PRICE-05", "card-days where graded and raw rows share a date (the trap)",
    await count(`SELECT count(*) c FROM (SELECT "cardId","capturedDate" FROM "PriceSnapshot"
      WHERE source='PRICECHARTING' AND "priceType"='MARKET' AND variant='NORMAL' AND "cardId" IS NOT NULL
      GROUP BY 1,2 HAVING count(*) FILTER (WHERE condition IS NULL) > 0 AND count(*) FILTER (WHERE condition IS NOT NULL) > 0) t`));
  info("PRICE-06", "cards with no raw MARKET snapshot (show 'No price yet')",
    await count(`SELECT count(*) c FROM "Card" ca WHERE NOT EXISTS (SELECT 1 FROM "PriceSnapshot" ps WHERE ps."cardId"=ca.id AND ps."priceType"='MARKET' AND ps.variant='NORMAL')`));
  info("PRICE-09", "snapshots above $100k", await count(`SELECT count(*) c FROM "PriceSnapshot" WHERE price > 100000`));
  // The sealed equivalent of PRICE-06, matching what lib/sealed.ts actually
  // resolves: MARKET/MID/LOW, condition IS NULL, from a sealed price source.
  // A product failing this renders as "No price yet".
  //
  // The floor is high because TCGplayer carries unreleased product months
  // ahead of release and publishes no price for much of it. Those rows are
  // legitimately priceless until launch, so this guards against a systemic
  // regression (a broken join, a wrong condition filter) rather than
  // demanding full coverage.
  info("PRICE-12", "sealed products with no resolvable price (mostly unreleased presale)",
    await count(`SELECT count(*) c FROM "SealedProduct" sp WHERE NOT EXISTS (
      SELECT 1 FROM "PriceSnapshot" ps WHERE ps."sealedProductId"=sp.id
        AND ps."priceType" IN ('MARKET','MID','LOW') AND ps.condition IS NULL
        AND ps.source IN ('TCGPLAYER','PRICECHARTING','EBAY'))`));
  check("PRICE-12b", "released sealed products (with any snapshot) lacking a resolvable price",
    await count(`SELECT count(*) c FROM "SealedProduct" sp
      WHERE EXISTS (SELECT 1 FROM "PriceSnapshot" ps WHERE ps."sealedProductId"=sp.id)
        AND NOT EXISTS (
          SELECT 1 FROM "PriceSnapshot" ps WHERE ps."sealedProductId"=sp.id
            AND ps."priceType" IN ('MARKET','MID','LOW') AND ps.condition IS NULL
            AND ps.source IN ('TCGPLAYER','PRICECHARTING','EBAY'))`), 0);
  // A sealed row must never be numbered like a single card -- PriceCharting
  // files a few jumbo/oversized cards under the "Sealed Product" genre.
  check("PRICE-13", "sealed products named like a single card (#123)",
    await count(`SELECT count(*) c FROM "SealedProduct" WHERE name ~ '#[A-Za-z0-9]+\\s*$'`), 0);

  console.log("\n== Sealed catalog ==");
  const sealedTotal = await count(`SELECT count(*) c FROM "SealedProduct"`);
  const sealedOk = sealedTotal >= 3500;
  if (!sealedOk) failures++;
  console.log(`  ${sealedOk ? "PASS" : "FAIL"}  [SEAL-20] sealed products: ${sealedTotal.toLocaleString()} (fails below 3,500)`);

  // SEAL-23: retailer exclusives are a headline reason the catalog was rebuilt
  // on TCGplayer -- PriceCharting listed almost none of them.
  for (const [id, retailer, floor] of [["SEAL-23", "Costco", 10], ["SEAL-23", "Sam''s Club", 5]] as const) {
    const n = await count(`SELECT count(*) c FROM "SealedProduct" WHERE name ILIKE '%${retailer}%'`);
    const ok = n >= floor;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  [${id}] ${retailer.replace("''", "'")} products: ${n} (fails below ${floor})`);
  }

  // SEAL-26: the old importer kept one product per type per set, so a set
  // showing a single tin is the signature of that regression returning.
  const variantSets = await q<{ name: string; tins: string }>(`
    SELECT cs.name, count(*)::text tins FROM "SealedProduct" s JOIN "CardSet" cs ON cs.id=s."setId"
    WHERE cs.name IN ('151','Ascended Heroes') AND s.type IN ('TIN','DISPLAY_CASE','COLLECTION_BOX','PREMIUM_COLLECTION')
    GROUP BY cs.name ORDER BY cs.name`);
  for (const v of variantSets) {
    const ok = Number(v.tins) >= 8;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  [SEAL-26] "${v.name}" tin/collection variants: ${v.tins} (fails below 8)`);
  }

  // SEAL-24: a Pokemon Center exclusive must be its own row, not fused onto
  // the base product -- the collision that gave 262 products the wrong price.
  check("SEAL-24", "sets holding a Pokemon Center variant but no base product", await count(`
    SELECT count(*) c FROM "SealedProduct" pc
    WHERE pc.name ILIKE '%pokemon center%' AND pc.type = 'ELITE_TRAINER_BOX'
      AND NOT EXISTS (SELECT 1 FROM "SealedProduct" b WHERE b."setId" = pc."setId"
        AND b.type = 'ELITE_TRAINER_BOX' AND b.name NOT ILIKE '%pokemon center%')`), 0);

  // SEAL-35: two rows for one product, spotted via a shared external id.
  check("SEAL-35", "duplicate sealed rows sharing a tcgplayerProductId",
    await count(`SELECT count(*) c FROM (SELECT "tcgplayerProductId" FROM "SealedProduct"
      WHERE "tcgplayerProductId" IS NOT NULL GROUP BY 1 HAVING count(*)>1) t`), 0);
  info("SEAL-25", "display cases (distinguished from their contents)",
    await count(`SELECT count(*) c FROM "SealedProduct" WHERE type='DISPLAY_CASE'`));
  info("SEAL-28", "Japanese sealed products",
    await count(`SELECT count(*) c FROM "SealedProduct" WHERE language='JA'`));
  info("SEAL-20", "card-less sets holding sealed product (TCGplayer-only groupings)",
    await count(`SELECT count(*) c FROM "CardSet" cs
      WHERE NOT EXISTS (SELECT 1 FROM "Card" c WHERE c."setId"=cs.id)
        AND EXISTS (SELECT 1 FROM "SealedProduct" s WHERE s."setId"=cs.id)`));

  console.log("\n== Images ==");
  info("IMG-01", "cards with no imageUrl", await count(`SELECT count(*) c FROM "Card" WHERE "imageUrl" IS NULL`));
  // ~93% coverage. The rest are products TCGplayer lists with imageCount 0
  // (no photo on their CDN) and no PriceCharting page to scrape instead --
  // those render the type-label placeholder, which is intended. The ceiling
  // guards against a systemic loss, e.g. an ingest storing dead URLs again.
  checkMax("IMG-06", "sealed products with no imageUrl",
    await count(`SELECT count(*) c FROM "SealedProduct" WHERE "imageUrl" IS NULL`), 400);
  info("IMG-07", "sets with no logoUrl", await count(`SELECT count(*) c FROM "CardSet" WHERE "logoUrl" IS NULL`));
  // Every host here must be listed in next.config.ts remotePatterns, or
  // next/image throws at render time and takes the whole page with it.
  const ALLOWED = [
    "images.pokemontcg.io",
    "images.scrydex.com",
    "storage.googleapis.com",
    "tcgplayer-cdn.tcgplayer.com",
  ];
  const hosts = await q<{ host: string; c: string }>(`
    SELECT host, sum(c)::text c FROM (
      SELECT split_part(split_part("imageUrl",'://',2),'/',1) host, count(*) c FROM "Card" WHERE "imageUrl" IS NOT NULL GROUP BY 1
      UNION ALL SELECT split_part(split_part("imageUrl",'://',2),'/',1), count(*) FROM "SealedProduct" WHERE "imageUrl" IS NOT NULL GROUP BY 1
      UNION ALL SELECT split_part(split_part("logoUrl",'://',2),'/',1), count(*) FROM "CardSet" WHERE "logoUrl" IS NOT NULL GROUP BY 1
    ) t GROUP BY host ORDER BY 2 DESC`);
  for (const h of hosts) {
    const ok = ALLOWED.includes(h.host);
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  [IMG-02/03] host ${h.host}: ${Number(h.c).toLocaleString()} images${ok ? "" : " NOT IN next.config.ts remotePatterns"}`);
  }
  check("IMG-03", "image URLs not served over https",
    await count(`SELECT count(*) c FROM (
      SELECT "imageUrl" u FROM "Card" WHERE "imageUrl" IS NOT NULL
      UNION ALL SELECT "imageUrl" FROM "SealedProduct" WHERE "imageUrl" IS NOT NULL
    ) t WHERE u NOT LIKE 'https://%'`), 0);

  console.log(`\n${failures === 0 ? "All hard checks passed." : `${failures} CHECK(S) FAILED.`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
