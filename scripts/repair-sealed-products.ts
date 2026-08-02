import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  downloadPriceGuide,
  isSealedGenre,
  firstErrorLine,
  setNameKeys,
  isCardLikeProductName,
  sealedProductName,
  EMPTY_NUMBER_SUFFIX,
} from "@/lib/pricecharting-api";

// One-off repair for sealed products left mislabelled by the old
// one-product-per-type-per-set ingestion, plus the buildName bug that let
// "Elite Trainer Box [Pokemon Center]" collapse onto the plain "Elite Trainer
// Box" name. Both produced rows whose stored name describes one product while
// their pricechartingId points at a different one -- so the name, the scraped
// image and the price all disagreed (e.g. "151 Elite Trainer Box" showing the
// $1,180 Pokemon Center box).
//
// Idempotent and safe to re-run. Defaults to a dry run; pass --apply to write.

type Row = { id: string; name: string; setId: string | null; setName: string | null;
  pricechartingId: string; tcgplayerProductId: string | null; imageUrl: string | null };

type Counts = {
  checked: number; renamed: number; detached: number; merged: number;
  deleted: number; kept: number; unchanged: number; failed: number;
};

async function userDataCounts(id: string) {
  const [collection, watchlist, transactions, snapshots] = await Promise.all([
    prisma.collectionItem.count({ where: { sealedProductId: id } }),
    prisma.watchlistItem.count({ where: { sealedProductId: id } }),
    prisma.transaction.count({ where: { sealedProductId: id } }),
    prisma.priceSnapshot.count({ where: { sealedProductId: id } }),
  ]);
  return { collection, watchlist, transactions, snapshots,
    hasUserData: collection + watchlist + transactions > 0 };
}

// Move every reference off `loserId` and onto `winnerId`, then drop the loser.
// Snapshots are re-pointed with a raw update that ignores conflicts: the
// unique key includes capturedDate, so a day both rows already covered would
// otherwise abort the whole merge.
async function mergeInto(winnerId: string, loserId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "PriceSnapshot" s SET "sealedProductId" = ${winnerId}
    WHERE s."sealedProductId" = ${loserId}
      AND NOT EXISTS (
        SELECT 1 FROM "PriceSnapshot" w
        WHERE w."sealedProductId" = ${winnerId}
          AND w.source = s.source AND w."priceType" = s."priceType"
          AND w.variant = s.variant AND w."capturedDate" = s."capturedDate"
          AND w.condition IS NOT DISTINCT FROM s.condition
      )`;
  await prisma.priceSnapshot.deleteMany({ where: { sealedProductId: loserId } });
  await prisma.collectionItem.updateMany({ where: { sealedProductId: loserId }, data: { sealedProductId: winnerId } });
  await prisma.watchlistItem.updateMany({ where: { sealedProductId: loserId }, data: { sealedProductId: winnerId } });
  await prisma.transaction.updateMany({ where: { sealedProductId: loserId }, data: { sealedProductId: winnerId } });
  await prisma.sealedProduct.delete({ where: { id: loserId } });
}

// PriceCharting and TCGplayer each created their own row for the same real
// product whenever the two sources spell its name differently. The guide's
// tcg-id column identifies those pairs exactly, so they can be folded
// together: TCGplayer's row wins (better name, real image, market price) and
// inherits the pricechartingId, which is what unlocks the historic backfill.
// Without this the PriceCharting ingest can't attach its id at all -- the
// duplicate already holds it, and pricechartingId is unique.
async function mergeCrossSourceDuplicates(
  guide: Awaited<ReturnType<typeof downloadPriceGuide>>,
  apply: boolean
): Promise<number> {
  let merged = 0;
  for (const row of guide) {
    if (!isSealedGenre(row.genre) || !row.tcgId) continue;

    const [pcProduct, tcgProduct] = await Promise.all([
      prisma.sealedProduct.findUnique({ where: { pricechartingId: row.pricechartingId } }),
      prisma.sealedProduct.findUnique({ where: { tcgplayerProductId: row.tcgId } }),
    ]);
    if (!pcProduct || !tcgProduct || pcProduct.id === tcgProduct.id) continue;

    console.log(`  MERGE   "${pcProduct.name}"\n            into "${tcgProduct.name}"`);
    if (!apply) { merged += 1; continue; }

    try {
      const pricechartingId = pcProduct.pricechartingId;
      await mergeInto(tcgProduct.id, pcProduct.id);
      await prisma.sealedProduct.update({
        where: { id: tcgProduct.id },
        data: { pricechartingId },
      });
      merged += 1;
    } catch (err) {
      console.log(`    failed: ${firstErrorLine(err)}`);
    }
  }
  return merged;
}

// Sealed rows created before the ingest learned to reject card-shaped names.
// Jumbo/oversized singles get removed outright (they are cards); the "#None"
// suffix PriceCharting appends to some genuine products is just trimmed.
async function cleanCardLikeNames(apply: boolean): Promise<{ deleted: number; trimmed: number }> {
  const suspects = await prisma.sealedProduct.findMany({
    where: { name: { contains: "#" } },
    select: { id: true, name: true, setId: true },
  });

  let deleted = 0;
  let trimmed = 0;
  for (const row of suspects) {
    if (EMPTY_NUMBER_SUFFIX.test(row.name)) {
      const clean = row.name.replace(EMPTY_NUMBER_SUFFIX, "").trim();
      if (!clean || clean === row.name) continue;
      const clash = await prisma.sealedProduct.findFirst({
        where: { setId: row.setId, name: clean, NOT: { id: row.id } },
      });
      if (clash) continue;
      console.log(`  TRIM    "${row.name}" -> "${clean}"`);
      if (apply) await prisma.sealedProduct.update({ where: { id: row.id }, data: { name: clean } });
      trimmed += 1;
      continue;
    }

    if (!isCardLikeProductName(row.name)) continue;
    const usage = await userDataCounts(row.id);
    if (usage.hasUserData) {
      console.log(`  KEEP    "${row.name}" (card-shaped but has user data)`);
      continue;
    }
    console.log(`  DELETE  "${row.name}" (single card, not sealed product)`);
    if (apply) {
      await prisma.priceSnapshot.deleteMany({ where: { sealedProductId: row.id } });
      await prisma.sealedProduct.delete({ where: { id: row.id } });
    }
    deleted += 1;
  }
  return { deleted, trimmed };
}

// TCGplayer names a set "Scarlet & Violet 151" where pokemontcg.io (our card
// source) calls it "151", so an earlier ingest created a second, card-less
// CardSet and split that set's sealed product across the two. This folds the
// card-less duplicate back into the real set, using the same alias table the
// importers now match on.
async function mergeDuplicateSets(apply: boolean): Promise<{ merged: number; unmatched: string[] }> {
  const sets = await prisma.cardSet.findMany({
    select: { id: true, name: true, _count: { select: { cards: true, sealedProducts: true } } },
  });

  const realByKey = new Map<string, { id: string; name: string }>();
  for (const s of sets) {
    if (s._count.cards === 0) continue;
    for (const key of setNameKeys(s.name)) realByKey.set(key, { id: s.id, name: s.name });
  }

  let merged = 0;
  const unmatched: string[] = [];

  for (const dup of sets) {
    if (dup._count.cards > 0 || dup._count.sealedProducts === 0) continue;

    const target = setNameKeys(dup.name)
      .map((k) => realByKey.get(k))
      .find((t) => t && t.id !== dup.id);
    if (!target) { unmatched.push(dup.name); continue; }

    console.log(`  SET     "${dup.name}" (${dup._count.sealedProducts} sealed) -> "${target.name}"`);
    if (!apply) { merged += 1; continue; }

    const products = await prisma.sealedProduct.findMany({ where: { setId: dup.id } });
    for (const p of products) {
      const clash = await prisma.sealedProduct.findFirst({
        where: { setId: target.id, name: p.name },
      });
      if (clash) {
        // Same product reached the two sets from different sources -- fold
        // them together rather than leaving a renamed near-duplicate.
        const [mine, theirs] = await Promise.all([userDataCounts(p.id), userDataCounts(clash.id)]);
        const winner = mine.hasUserData && !theirs.hasUserData ? p.id : clash.id;
        const loser = winner === p.id ? clash.id : p.id;
        if (winner === p.id) {
          await prisma.sealedProduct.update({ where: { id: p.id }, data: { setId: target.id } });
        }
        await mergeInto(winner, loser);
      } else {
        await prisma.sealedProduct.update({ where: { id: p.id }, data: { setId: target.id } });
      }
    }
    await prisma.cardSet.delete({ where: { id: dup.id } });
    merged += 1;
  }
  return { merged, unmatched };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Repair sealed products -- ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);

  console.log("Downloading PriceCharting price guide...");
  const guide = await downloadPriceGuide("pokemon-cards");
  const byId = new Map(guide.filter((r) => isSealedGenre(r.genre)).map((r) => [r.pricechartingId, r]));
  console.log(`  ${byId.size} sealed rows indexed by pricechartingId\n`);

  console.log("Phase 0: folding card-less duplicate sets into the real set...");
  const setMerge = await mergeDuplicateSets(apply);
  console.log(`  ${setMerge.merged} duplicate sets merged, ${setMerge.unmatched.length} left unmatched
`);

  console.log("Phase 1: folding together products both sources created separately...");
  const crossMerged = await mergeCrossSourceDuplicates(guide, apply);
  console.log(`  ${crossMerged} cross-source duplicates merged\n`);
  console.log("Phase 2: removing card-shaped rows from the sealed catalog...");
  const cardLike = await cleanCardLikeNames(apply);
  console.log(`  ${cardLike.deleted} deleted, ${cardLike.trimmed} name suffixes trimmed\n`);

  console.log("Phase 3: correcting names against their pricechartingId...");

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s.id, s.name, s."setId", cs.name AS "setName", s."pricechartingId",
           s."tcgplayerProductId", s."imageUrl"
    FROM "SealedProduct" s LEFT JOIN "CardSet" cs ON cs.id = s."setId"
    WHERE s."pricechartingId" IS NOT NULL`;

  const c: Counts = { checked: 0, renamed: 0, detached: 0, merged: 0, deleted: 0, kept: 0, unchanged: 0, failed: 0 };
  const preserved: string[] = [];

  for (const row of rows) {
    c.checked += 1;
    const guideRow = byId.get(row.pricechartingId);

    // The id no longer exists in PriceCharting's catalog at all.
    if (!guideRow) {
      const usage = await userDataCounts(row.id);
      if (usage.hasUserData || usage.snapshots > 0) {
        c.kept += 1;
        if (usage.hasUserData) preserved.push(`${row.name} (stale id, has user data)`);
        continue;
      }
      console.log(`  DELETE orphan "${row.name}" (id ${row.pricechartingId} gone from catalog)`);
      if (apply) await prisma.sealedProduct.delete({ where: { id: row.id } });
      c.deleted += 1;
      continue;
    }

    // Strip the same "#None" junk phase 2 trims, or the two phases fight over
    // the name and the repair never converges.
    const productName = guideRow.productName.replace(EMPTY_NUMBER_SUFFIX, "").trim();
    const trueName = sealedProductName(row.setName, productName);
    if (row.name === trueName) { c.unchanged += 1; continue; }

    // TCGplayer-sourced products keep their own (cleaner, already
    // variant-qualified) name. If the attached pricechartingId belongs to a
    // different product, drop the link rather than the name -- a wrong id
    // would otherwise feed this row the wrong image and price history. The
    // next PriceCharting run re-links it correctly via tcg-id.
    if (row.tcgplayerProductId) {
      if (guideRow.tcgId === row.tcgplayerProductId) { c.unchanged += 1; continue; }
      console.log(`  DETACH  "${row.name}"\n            pcId ${row.pricechartingId} is really "${guideRow.productName}"`);
      if (apply) {
        await prisma.sealedProduct.update({ where: { id: row.id }, data: { pricechartingId: null } });
      }
      c.detached += 1;
      continue;
    }

    // PriceCharting-only product with the wrong name: rename to the truth and
    // clear the image so the detail backfill re-scrapes the correct one.
    const clash = await prisma.sealedProduct.findFirst({
      where: { setId: row.setId, name: trueName, NOT: { id: row.id } },
    });

    console.log(`  RENAME  "${row.name}"\n            -> "${trueName}"${clash ? "  [merges into existing row]" : ""}`);
    if (!apply) { c.renamed += 1; continue; }

    try {
      if (clash) {
        // The correctly-named row already exists. Keep whichever side carries
        // user data (falling back to the incumbent) and fold the other in.
        const [mine, theirs] = await Promise.all([userDataCounts(row.id), userDataCounts(clash.id)]);
        const winner = mine.hasUserData && !theirs.hasUserData ? row.id : clash.id;
        const loser = winner === row.id ? clash.id : row.id;
        if (winner === row.id) {
          await prisma.sealedProduct.update({ where: { id: clash.id }, data: { pricechartingId: null } });
          await prisma.sealedProduct.update({ where: { id: row.id }, data: { name: trueName, imageUrl: null } });
        }
        await mergeInto(winner, loser);
        if (mine.hasUserData || theirs.hasUserData) preserved.push(`${trueName} (merged, user data kept)`);
        c.merged += 1;
      } else {
        await prisma.sealedProduct.update({
          where: { id: row.id },
          data: { name: trueName, imageUrl: null },
        });
        c.renamed += 1;
      }
    } catch (err) {
      console.log(`    failed: ${firstErrorLine(err)}`);
      c.failed += 1;
    }
  }

  console.log(`\n=== summary${apply ? "" : " (dry run)"} ===`);
  console.log(`  checked            : ${c.checked}`);
  console.log(`  renamed            : ${c.renamed}`);
  console.log(`  pricechartingId detached from TCGplayer row: ${c.detached}`);
  console.log(`  merged into existing: ${c.merged}`);
  console.log(`  deleted orphans    : ${c.deleted}`);
  console.log(`  kept (stale id but has data): ${c.kept}`);
  console.log(`  already correct    : ${c.unchanged}`);
  console.log(`  failed             : ${c.failed}`);
  if (preserved.length) {
    console.log(`\n  preserved rows carrying user data:`);
    for (const p of preserved) console.log(`    ${p}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
