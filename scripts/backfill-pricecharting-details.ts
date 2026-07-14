import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";
import { getProductDetail, mapWithConcurrency, GRADE_LABELS } from "@/lib/pricecharting";

// Stage 2 of the PriceCharting integration: for every Card/SealedProduct
// already linked to a pricechartingId (by ingest-cards-pricecharting.ts /
// ingest-sealed-products-pricecharting.ts), scrape its product page for the
// full-size image and historic price series, and backfill PriceSnapshot rows
// for each historic point. This is the slow part -- 2 HTTP requests per item
// (offers page -> game page, see lib/pricecharting.ts#getProductDetail) --
// so it runs with limited concurrency and is safe to interrupt and rerun.

// A first attempt at concurrency 5 / 1000ms tripped PriceCharting's 429 rate
// limiting almost immediately (and once several workers are all mid-backoff
// at once, the whole run stalls) -- this is deliberately more conservative.
const CONCURRENCY = 2;
const DELAY_MS = 1200;

type Target = {
  id: string;
  pricechartingId: string;
  entityField: "cardId" | "sealedProductId";
  label: string;
};

async function loadTargets(force: boolean): Promise<Target[]> {
  const [cards, sealedProducts] = await Promise.all([
    prisma.card.findMany({
      where: { pricechartingId: { not: null } },
      select: { id: true, pricechartingId: true, name: true, number: true, set: { select: { name: true } } },
    }),
    prisma.sealedProduct.findMany({
      where: { pricechartingId: { not: null } },
      select: { id: true, pricechartingId: true, name: true },
    }),
  ]);

  const cardTargets: Target[] = cards.map((c) => ({
    id: c.id,
    pricechartingId: c.pricechartingId!,
    entityField: "cardId",
    label: `${c.set.name} - ${c.name} #${c.number}`,
  }));
  const sealedTargets: Target[] = sealedProducts.map((p) => ({
    id: p.id,
    pricechartingId: p.pricechartingId!,
    entityField: "sealedProductId",
    label: p.name,
  }));
  const all = [...cardTargets, ...sealedTargets];

  if (force) return all;

  // A genuine historic backfill leaves PRICECHARTING snapshots spanning many
  // months back; stage-1-only items have at most a couple of same-week
  // snapshots (today's current-price capture, plus possibly one earlier
  // capture from before this integration existed for sealed products). A
  // >25-day-old snapshot only exists once the real monthly history has been
  // written, so it's a reliable "already backfilled" signal -- a raw
  // snapshot *count* isn't, since it conflates that with the sealed-product
  // case above.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 25);

  // Sealed products only ever get the ungraded/condition-null series (see
  // processTarget), so any old snapshot means they're done. Cards also get
  // graded-tier series (condition = "Grade 7", "PSA 10", etc.) -- a card
  // that only has old *ungraded* history (e.g. from before this grade-tier
  // support existed) still needs reprocessing to pick up the grade data, so
  // it must specifically have an old *graded* snapshot to count as done.
  const [oldSealedSnapshots, oldGradedCardSnapshots] = await Promise.all([
    prisma.priceSnapshot.findMany({
      where: { source: "PRICECHARTING", capturedDate: { lt: cutoff }, sealedProductId: { not: null } },
      select: { sealedProductId: true },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        source: "PRICECHARTING",
        capturedDate: { lt: cutoff },
        cardId: { not: null },
        condition: { not: null },
      },
      select: { cardId: true },
    }),
  ]);
  const alreadyBackfilled = new Set([
    ...oldSealedSnapshots.map((s) => s.sealedProductId),
    ...oldGradedCardSnapshots.map((s) => s.cardId),
  ]);

  return all.filter((t) => !alreadyBackfilled.has(t.id));
}

async function processTarget(target: Target): Promise<"ok" | "no-match" | "error"> {
  try {
    const detail = await getProductDetail(target.pricechartingId);
    if (!detail) return "no-match";

    if (detail.imageUrl) {
      if (target.entityField === "cardId") {
        await prisma.card.update({ where: { id: target.id }, data: { imageUrl: detail.imageUrl } });
      } else {
        await prisma.sealedProduct.update({ where: { id: target.id }, data: { imageUrl: detail.imageUrl } });
      }
    }

    // Grading (Grade 7 through PSA 10) only makes sense for individual
    // cards -- a sealed box doesn't get graded, so sealed products only
    // ever get the ungraded/"used" series, same as before this feature
    // (and matching how the rest of the app already treats sealed-product
    // prices as condition-less).
    for (const [key, points] of Object.entries(detail.gradeHistories)) {
      if (target.entityField === "sealedProductId" && key !== "used") continue;
      const condition = key === "used" ? null : GRADE_LABELS[key as keyof typeof GRADE_LABELS];
      for (const [timestampMs, priceCents] of points) {
        await capturePriceSnapshot({
          entityId: target.id,
          entityField: target.entityField,
          source: "PRICECHARTING",
          priceType: "MARKET",
          condition,
          price: priceCents / 100,
          capturedAt: new Date(timestampMs),
        });
      }
    }

    return "ok";
  } catch (err) {
    console.log(`  Error on "${target.label}": ${err instanceof Error ? err.message : err}`);
    return "error";
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const targets = await loadTargets(force);
  console.log(`${targets.length} items to back-fill (force=${force}).`);

  let done = 0;
  const counts = { ok: 0, "no-match": 0, error: 0 };

  await mapWithConcurrency(targets, CONCURRENCY, DELAY_MS, async (target) => {
    const result = await processTarget(target);
    counts[result] += 1;
    done += 1;
    if (done % 100 === 0 || done === targets.length) {
      console.log(`${done}/${targets.length} processed (ok=${counts.ok}, no-match=${counts["no-match"]}, error=${counts.error})`);
    }
  });

  console.log(`Done. ok=${counts.ok}, no-match=${counts["no-match"]}, error=${counts.error}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
