import "server-only";
import { prisma } from "@/lib/prisma";
import { SEALED_TYPE_LABELS } from "@/lib/sealed-types";

// Below this word_similarity score, treat it as "no confident match" and
// leave the Transaction unlinked rather than guessing -- a wrong link is
// worse than no link, since it'd misattribute cost basis/profit onto the
// wrong catalog item.
//
// Calibrated against ~75 real eBay sold-listing titles during development,
// sorted by score: there is NOT a clean cutoff that separates every correct
// match from every wrong one. Multi-set "combo"/bundle listings (e.g. two
// different sets' products sold together) are the main failure mode --
// they score in the same 0.5-0.65 band as plenty of genuinely correct but
// differently-worded matches (e.g. "Complete Art Set (4x Packs)" vs. the
// catalog's "Art Bundle [Set of 4]"), so raising the threshold to exclude
// the former also silently drops a comparable number of the latter. 0.5
// keeps recall reasonable while still rejecting clearly-nothing-alike
// results (below ~0.4). Expect an occasional wrong match on ambiguous
// listings -- this is a best-effort heuristic, not a guarantee; a periodic
// manual spot-check of imported eBay transactions is worth doing.
const MATCH_THRESHOLD = 0.5;

// eBay listing titles are packed with SEO/marketing/grading boilerplate that
// has nothing to do with the product's catalog name -- stripping it before
// running word_similarity (which already tolerates *some* surrounding noise,
// but not this much) meaningfully improves match confidence.
const NOISE_PATTERN =
  /\b(brand new|factory seal(ed)?|sealed|new|nm|near mint|mint|psa\s*\d*|bgs\s*\d*|cgc\s*\d*|graded|ungraded|free shipping|fast shipping|ships?\s*(free|fast)|authentic|genuine|rare|hot|lot of \d+|\d+x|x\d+|pokemon\s*tcg|pokemon\s*center)\b/gi;

function cleanTitle(title: string): string {
  return title
    .replace(/[[(].*?[\])]/g, " ") // parenthetical/bracketed asides, e.g. "(Read Description)"
    .replace(NOISE_PATTERN, " ")
    .replace(/[-–—|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProductMatch =
  | { kind: "card"; cardId: string; sealedProductId: null }
  | { kind: "sealed"; cardId: null; sealedProductId: string };

type CardCandidate = { id: string; score: number };
type SealedCandidate = { id: string; score: number };

// Matches a raw eBay sold-listing title against the Card/SealedProduct
// catalog using the same pg_trgm word_similarity infrastructure
// getCardNameSuggestion/getSealedNameSuggestion (lib/cards.ts, lib/sealed.ts)
// already use for "did you mean" spelling suggestions -- here used for
// substring-tolerant fuzzy matching instead, since a listing title is a full
// sentence the product name is only a fragment of.
//
// Searches Card and SealedProduct independently (an eBay title alone doesn't
// say which one it is) and returns whichever scores higher, or null if
// neither clears MATCH_THRESHOLD -- callers should treat null the same as
// "no card/sealedProduct linked," not as an error.
export async function matchEbayListingToProduct(title: string): Promise<ProductMatch | null> {
  const cleaned = cleanTitle(title);
  if (!cleaned) return null;

  const [cardRows, sealedRows] = await Promise.all([
    prisma.$queryRaw<CardCandidate[]>`
      SELECT c.id, word_similarity(${cleaned}, COALESCE(cs.series, '') || ' ' || cs.name || ' ' || c.name) AS score
      FROM "Card" c
      JOIN "CardSet" cs ON cs.id = c."setId"
      ORDER BY score DESC
      LIMIT 1
    `,
    prisma.$queryRaw<SealedCandidate[]>`
      SELECT sp.id, word_similarity(
        ${cleaned},
        COALESCE(cs.series, '') || ' ' || COALESCE(cs.name, '') || ' ' || sp.name || ' ' ||
        CASE sp.type
          WHEN 'BOOSTER_BOX' THEN ${SEALED_TYPE_LABELS.BOOSTER_BOX}
          WHEN 'BOOSTER_PACK' THEN ${SEALED_TYPE_LABELS.BOOSTER_PACK}
          WHEN 'ELITE_TRAINER_BOX' THEN ${SEALED_TYPE_LABELS.ELITE_TRAINER_BOX}
          WHEN 'BUNDLE' THEN ${SEALED_TYPE_LABELS.BUNDLE}
          WHEN 'BLISTER' THEN ${SEALED_TYPE_LABELS.BLISTER}
          WHEN 'COLLECTION_BOX' THEN ${SEALED_TYPE_LABELS.COLLECTION_BOX}
          WHEN 'TIN' THEN ${SEALED_TYPE_LABELS.TIN}
          WHEN 'PREMIUM_COLLECTION' THEN ${SEALED_TYPE_LABELS.PREMIUM_COLLECTION}
          WHEN 'DISPLAY_CASE' THEN ${SEALED_TYPE_LABELS.DISPLAY_CASE}
          WHEN 'DECK' THEN ${SEALED_TYPE_LABELS.DECK}
          WHEN 'POSTER_COLLECTION' THEN ${SEALED_TYPE_LABELS.POSTER_COLLECTION}
          WHEN 'PIN_COLLECTION' THEN ${SEALED_TYPE_LABELS.PIN_COLLECTION}
          WHEN 'GIFT_BOX' THEN ${SEALED_TYPE_LABELS.GIFT_BOX}
          WHEN 'BINDER' THEN ${SEALED_TYPE_LABELS.BINDER}
          WHEN 'STARTER_SET' THEN ${SEALED_TYPE_LABELS.STARTER_SET}
          ELSE ${SEALED_TYPE_LABELS.OTHER}
        END
      ) AS score
      FROM "SealedProduct" sp
      LEFT JOIN "CardSet" cs ON cs.id = sp."setId"
      ORDER BY score DESC
      LIMIT 1
    `,
  ]);

  const card = cardRows[0];
  const sealed = sealedRows[0];

  if (!card && !sealed) return null;
  const cardScore = card?.score ?? -1;
  const sealedScore = sealed?.score ?? -1;
  const best = cardScore >= sealedScore ? { kind: "card" as const, row: card } : { kind: "sealed" as const, row: sealed };

  if (!best.row || best.row.score < MATCH_THRESHOLD) return null;

  return best.kind === "card"
    ? { kind: "card", cardId: best.row.id, sealedProductId: null }
    : { kind: "sealed", cardId: null, sealedProductId: best.row.id };
}
