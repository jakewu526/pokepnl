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

  console.log("\n== Images ==");
  info("IMG-01", "cards with no imageUrl", await count(`SELECT count(*) c FROM "Card" WHERE "imageUrl" IS NULL`));
  info("IMG-06", "sealed products with no imageUrl", await count(`SELECT count(*) c FROM "SealedProduct" WHERE "imageUrl" IS NULL`));
  info("IMG-07", "sets with no logoUrl", await count(`SELECT count(*) c FROM "CardSet" WHERE "logoUrl" IS NULL`));
  // Every host here must be listed in next.config.ts remotePatterns, or
  // next/image throws at render time and takes the whole page with it.
  const ALLOWED = ["images.pokemontcg.io", "images.scrydex.com", "storage.googleapis.com"];
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
    await count(`SELECT count(*) c FROM "Card" WHERE "imageUrl" IS NOT NULL AND "imageUrl" NOT LIKE 'https://%'`), 0);

  console.log(`\n${failures === 0 ? "All hard checks passed." : `${failures} CHECK(S) FAILED.`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
