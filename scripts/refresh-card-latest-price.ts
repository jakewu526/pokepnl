import "dotenv/config";
import { prisma } from "@/lib/prisma";

// Recomputes CardLatestPrice from PriceSnapshot for every card, using the
// same PRICECHARTING > TCGPLAYER > CARDMARKET cascade as getLatestPrices.
// Run daily after price ingestion (see scripts/daily-price-sync.ps1) so the
// price sort in the catalog reads one precomputed row per card instead of
// recomputing the cascade for the whole catalog on every request.
async function main() {
  const result = await prisma.$executeRaw`
    INSERT INTO "CardLatestPrice" ("cardId", price, source, "updatedAt")
    SELECT c.id, COALESCE(pc.price, tcg.price, cm.price),
           CASE
             WHEN pc.price IS NOT NULL THEN 'PRICECHARTING'
             WHEN tcg.price IS NOT NULL THEN 'TCGPLAYER'
             ELSE 'CARDMARKET'
           END::"PriceSource",
           now()
    FROM "Card" c
    LEFT JOIN LATERAL (
      SELECT price FROM "PriceSnapshot"
      WHERE "cardId" = c.id AND "priceType" = 'MARKET' AND variant = 'NORMAL' AND source = 'PRICECHARTING'
        AND condition IS NULL
      ORDER BY "capturedDate" DESC LIMIT 1
    ) pc ON true
    LEFT JOIN LATERAL (
      SELECT price FROM "PriceSnapshot"
      WHERE "cardId" = c.id AND "priceType" = 'MARKET' AND variant = 'NORMAL' AND source = 'TCGPLAYER'
      ORDER BY "capturedDate" DESC LIMIT 1
    ) tcg ON true
    LEFT JOIN LATERAL (
      SELECT price FROM "PriceSnapshot"
      WHERE "cardId" = c.id AND "priceType" = 'MARKET' AND variant = 'NORMAL' AND source = 'CARDMARKET'
      ORDER BY "capturedDate" DESC LIMIT 1
    ) cm ON true
    WHERE COALESCE(pc.price, tcg.price, cm.price) IS NOT NULL
    ON CONFLICT ("cardId") DO UPDATE SET
      price = EXCLUDED.price,
      source = EXCLUDED.source,
      "updatedAt" = EXCLUDED."updatedAt"
  `;

  // Cards that no longer have any price (all their snapshots aged out /
  // were removed) shouldn't keep a stale row around.
  const pruned = await prisma.$executeRaw`
    DELETE FROM "CardLatestPrice" clp
    WHERE NOT EXISTS (
      SELECT 1 FROM "PriceSnapshot" ps
      WHERE ps."cardId" = clp."cardId" AND ps."priceType" = 'MARKET' AND ps.variant = 'NORMAL'
        AND ps.source IN ('PRICECHARTING', 'TCGPLAYER', 'CARDMARKET')
    )
  `;

  console.log(`Upserted ${result} card price rows, pruned ${pruned} stale rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
