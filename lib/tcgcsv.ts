// tcgcsv.com mirrors TCGplayer's public catalog (groups, products, daily
// prices) as plain JSON with no API key. That matters because TCGplayer's own
// catalog API needs an approved partner key we don't have -- see
// lib/tcgplayer.ts, whose scripts have never been runnable. PriceCharting's
// bulk guide only carries ~2,000 sealed rows for all of Pokemon; TCGplayer
// lists roughly twice that in English alone, with a real product image on
// essentially every one, so this is the catalog spine for sealed product.

const BASE_URL = "https://tcgcsv.com/tcgplayer";

export const POKEMON_EN_CATEGORY = 3;
export const POKEMON_JP_CATEGORY = 85;

export type TcgGroup = {
  groupId: number;
  name: string;
  abbreviation?: string | null;
  publishedOn?: string | null;
};

export type TcgExtendedData = { name: string; displayName?: string; value: string };

export type TcgProduct = {
  productId: number;
  name: string;
  cleanName?: string | null;
  imageUrl?: string | null;
  imageCount?: number | null;
  categoryId: number;
  groupId: number;
  url?: string | null;
  extendedData?: TcgExtendedData[] | null;
};

export type TcgPrice = {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
};

// tcgcsv is a static CDN, so failures are transient rather than rate-limit
// driven -- a short flat retry is enough (contrast lib/pricecharting.ts,
// which needs escalating backoff to survive 429s).
async function fetchJson<T>(path: string, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { "User-Agent": "pokemon-tcg-binder/1.0" },
      });
      if (!res.ok) throw new Error(`tcgcsv ${path} failed: ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { results?: T };
      // Every tcgcsv endpoint wraps its payload in { success, errors, results }.
      return (json.results ?? []) as T;
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function fetchGroups(categoryId: number): Promise<TcgGroup[]> {
  return fetchJson<TcgGroup[]>(`/${categoryId}/groups`);
}

export function fetchProducts(categoryId: number, groupId: number): Promise<TcgProduct[]> {
  return fetchJson<TcgProduct[]>(`/${categoryId}/${groupId}/products`);
}

export function fetchPrices(categoryId: number, groupId: number): Promise<TcgPrice[]> {
  return fetchJson<TcgPrice[]>(`/${categoryId}/${groupId}/prices`);
}

// TCGplayer has no explicit "is this sealed" flag, but it does attach card-only
// extendedData to singles. Testing for Number *and* Rarity matters: Japanese
// sets (category 85) frequently omit Number on singles, so a Number-only test
// misfiles cards like "Goldeen" and "Charizard" as sealed product.
export function isCardProduct(product: TcgProduct): boolean {
  const fields = new Set((product.extendedData ?? []).map((d) => d.name));
  return fields.has("Number") || fields.has("Rarity");
}

// Word-boundary matches only -- a bare /tin/i also matches "Victini", and
// /\bset\b/ would swallow "Starter Set" if it ran first. Order is the whole
// design here: the first pattern to match wins, so the list runs from most
// specific to most generic.
const TYPE_PATTERNS: { type: string; pattern: RegExp }[] = [
  // "Case" and "master carton" are unambiguous outer-packaging words: a
  // "Booster Box Case" holds several booster boxes, so this has to outrank
  // the booster-box rule below rather than the other way round.
  { type: "DISPLAY_CASE", pattern: /\b(case|master carton)\b/i },
  { type: "ELITE_TRAINER_BOX", pattern: /\b(elite trainer box|etb)\b/i },
  // A Japanese "Booster Display" is the 30-pack box itself, i.e. the
  // equivalent of an English booster box -- it must be claimed here before
  // the generic /display/ rule below treats it as a case of boxes.
  { type: "BOOSTER_BOX", pattern: /\bbooster (box(es)?|display)\b/i },
  // Any remaining display is a retail case holding many of a smaller product
  // ("Mini Tin Display"). Splitting these out is what stops a $315 case of
  // ten tins from being labelled the same as a $31 single tin.
  { type: "DISPLAY_CASE", pattern: /\bdisplay\b/i },
  { type: "PREMIUM_COLLECTION", pattern: /\b(ultra premium|premium collections?)\b/i },
  { type: "BUNDLE", pattern: /\bbundles?\b/i },
  { type: "BLISTER", pattern: /\b(blisters?|checklane)\b/i },
  // Runs ahead of the booster-pack rule so "2 Booster Packs & Jirachi
  // Collector's Pin" reads as a pin product, but behind BLISTER so a
  // "Collector's Pin Blister" stays a blister.
  { type: "PIN_COLLECTION", pattern: /\b(pin collections?|collector'?s pins?)\b/i },
  { type: "BOOSTER_PACK", pattern: /\b(booster packs?|sleeved booster)\b/i },
  { type: "TIN", pattern: /\btins?\b/i },
  { type: "POSTER_COLLECTION", pattern: /\bposter collections?\b/i },
  { type: "BINDER", pattern: /\b(binders?|portfolios?)\b/i },
  { type: "STARTER_SET", pattern: /\b(starter (set|deck)s?|build ?& ?battle|battle (academy|stadium)|2[- ]player|my first battle|trainer'?s toolkit|toolkit)\b/i },
  { type: "DECK", pattern: /\b(theme decks?|deck build box|battle decks?|decks?)\b/i },
  { type: "GIFT_BOX", pattern: /\b(gift|holiday calendar|advent)\b/i },
  { type: "COLLECTION_BOX", pattern: /\b(collections?|chest|kit|showcase|briefcase|game classic)\b/i },
  // Late fallbacks: a bare "Pack"/"Box"/"Set" only decides the type once every
  // more specific rule has passed, so "5-Pack Mini Tin" is a TIN and
  // "2 Pack Blister" is a BLISTER rather than both landing in BOOSTER_PACK.
  { type: "BOOSTER_PACK", pattern: /\b(packs?|booster)\b/i },
  { type: "COLLECTION_BOX", pattern: /\b(box(es)?|sets?)\b/i },
];

// Returns null for names that match nothing -- callers skip those and log
// them rather than dumping unclassifiable rows into OTHER, which is how
// single cards leaked into the sealed catalog previously.
export function classifySealedType(name: string): string | null {
  return TYPE_PATTERNS.find((t) => t.pattern.test(name))?.type ?? null;
}

// Catalog images come back as the 200px thumbnail. 400w is the largest size
// the CDN serves without auth (1000x1000 returns 403).
//
// A product with imageCount 0 still carries a plausible-looking imageUrl, but
// the CDN 403s it at every size. Storing that URL would render a permanently
// broken image instead of falling back to the tile's type-label placeholder,
// so those resolve to null.
export function productImageUrl(product: TcgProduct): string | null {
  if (!product.imageUrl || product.imageCount === 0) return null;
  return product.imageUrl.replace(/_\d+w\.jpg$/i, "_400w.jpg");
}
