import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";
import { searchActiveListings } from "@/lib/ebay";
import { getConditions, getProductSkus, getSkuPrices } from "@/lib/tcgplayer";
import {
  CONDITION_MULTIPLIERS,
  EBAY_CONDITION_ASPECT_NAME,
  EBAY_CONDITION_ASPECT_VALUES,
  type Condition,
} from "@/lib/condition";

const MIN_LISTINGS_FOR_PRICE = 3;

// TCGplayer condition names as returned by /catalog/conditions -- mapped
// from our short codes. UNVERIFIED against the live API (see lib/tcgplayer.ts).
const TCGPLAYER_CONDITION_NAMES: Record<Exclude<Condition, "NM">, string> = {
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function getCachedSnapshot(
  cardId: string,
  condition: Condition
): Promise<number | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = await prisma.priceSnapshot.findMany({
    where: {
      cardId,
      condition,
      source: { in: ["TCGPLAYER", "EBAY"] },
      capturedDate: today,
    },
    select: { source: true, price: true },
  });
  if (rows.length === 0) return null;
  const preferred = rows.find((r) => r.source === "TCGPLAYER") ?? rows[0];
  return parseFloat(preferred.price.toString());
}

async function tryTcgplayer(
  tcgplayerProductId: string | null,
  printingVariant: string | null,
  condition: Exclude<Condition, "NM">
): Promise<number | null> {
  if (!tcgplayerProductId) return null;
  if (!process.env.TCGPLAYER_PUBLIC_KEY || !process.env.TCGPLAYER_PRIVATE_KEY) return null;

  const [skus, conditions] = await Promise.all([
    getProductSkus(Number(tcgplayerProductId)),
    getConditions(),
  ]);
  if (skus.length === 0) return null;

  const targetName = TCGPLAYER_CONDITION_NAMES[condition];
  const conditionMatch = conditions.find(
    (c) => c.name.toLowerCase() === targetName.toLowerCase()
  );
  if (!conditionMatch) return null;

  const candidates = skus.filter((s) => s.conditionId === conditionMatch.conditionId);
  if (candidates.length === 0) return null;

  // Prefer the SKU matching the card's known printing variant (e.g.
  // "holofoil"); fall back to the first matching-condition SKU otherwise.
  const sku =
    (printingVariant &&
      candidates.find((s) => String(s.printingId).includes(printingVariant))) ??
    candidates[0];

  const prices = await getSkuPrices([sku.skuId]);
  const price = prices[0]?.marketPrice;
  return price != null && price > 0 ? price : null;
}

async function tryEbay(
  cardName: string,
  setName: string,
  number: string,
  condition: Exclude<Condition, "NM">
): Promise<number | null> {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) return null;

  const query = `${cardName} ${setName} ${number}`;
  const listings = await searchActiveListings(query, 50, {
    name: EBAY_CONDITION_ASPECT_NAME,
    value: EBAY_CONDITION_ASPECT_VALUES[condition],
  });

  const prices = listings
    .map((item) => (item.price ? parseFloat(item.price.value) : null))
    .filter((p): p is number => p != null && p > 0);

  if (prices.length < MIN_LISTINGS_FOR_PRICE) return null;
  return median(prices);
}

export async function getConditionAdjustedPrice(params: {
  cardId: string;
  cardName: string;
  setName: string;
  number: string;
  tcgplayerProductId: string | null;
  printingVariant: string | null;
  basePrice: number;
  condition: Condition;
}): Promise<{ price: number; estimated: boolean; source?: "TCGPLAYER" | "EBAY" }> {
  const { condition, basePrice } = params;

  if (condition === "NM") {
    return { price: basePrice, estimated: false };
  }

  const cached = await getCachedSnapshot(params.cardId, condition);
  if (cached != null) {
    return { price: cached, estimated: false };
  }

  try {
    const tcgPrice = await tryTcgplayer(
      params.tcgplayerProductId,
      params.printingVariant,
      condition
    );
    if (tcgPrice != null) {
      await capturePriceSnapshot({
        entityId: params.cardId,
        entityField: "cardId",
        source: "TCGPLAYER",
        priceType: "MARKET",
        condition,
        price: tcgPrice,
      });
      return { price: tcgPrice, estimated: false, source: "TCGPLAYER" };
    }
  } catch {
    // fall through to eBay / estimate
  }

  try {
    const ebayPrice = await tryEbay(params.cardName, params.setName, params.number, condition);
    if (ebayPrice != null) {
      await capturePriceSnapshot({
        entityId: params.cardId,
        entityField: "cardId",
        source: "EBAY",
        priceType: "MARKET",
        condition,
        price: ebayPrice,
      });
      return { price: ebayPrice, estimated: false, source: "EBAY" };
    }
  } catch {
    // fall through to estimate
  }

  return { price: basePrice * CONDITION_MULTIPLIERS[condition], estimated: true };
}
