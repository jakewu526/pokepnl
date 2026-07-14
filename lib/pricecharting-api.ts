import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";

// PriceCharting's official token-based API (PRICECHARTING_API_TOKEN). Unlike
// the free scraping in lib/pricecharting.ts, this requires a paid
// subscription -- the bulk "download-custom" endpoint returns every product
// in a category (current prices only, no image, no history) in one request,
// which is what stage-1 ingestion uses to link/create cards and sealed
// products cheaply before the slower per-product scrape in lib/pricecharting.ts
// backfills images and historical price series.

const BASE_URL = "https://www.pricecharting.com";

export type PriceGuideRow = {
  pricechartingId: string;
  consoleName: string;
  productName: string;
  loosePrice: number | null;
  genre: string;
  tcgId: string | null;
  releaseDate: string | null;
  salesVolume: number;
};

function requireToken(): string {
  const token = process.env.PRICECHARTING_API_TOKEN;
  if (!token) throw new Error("PRICECHARTING_API_TOKEN is not set");
  return token;
}

function parseDollars(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function downloadPriceGuide(category: string): Promise<PriceGuideRow[]> {
  const token = requireToken();
  const url = `${BASE_URL}/price-guide/download-custom?${new URLSearchParams({ t: token, category })}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PriceCharting price guide download failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const records: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });

  return records.map((r) => ({
    pricechartingId: r.id,
    consoleName: r["console-name"],
    productName: r["product-name"],
    loosePrice: parseDollars(r["loose-price"]),
    genre: r.genre,
    tcgId: r["tcg-id"] || null,
    releaseDate: r["release-date"] || null,
    salesVolume: Number(r["sales-volume"]) || 0,
  }));
}

// The bulk category download mixes individual cards (genre "Pokemon Card" /
// "Pokemon Cards" -- PriceCharting is inconsistent about the plural) and
// sealed products (genre "Sealed Product") together with foreign-language
// card genres and a handful of unrelated sports-card spillover. We only
// handle English-market product here -- there's no language field on our
// Card/CardSet models, so foreign cards would collide with English cards of
// the same name/number.
export function isEnglishCardGenre(genre: string): boolean {
  return genre === "Pokemon Card" || genre === "Pokemon Cards";
}

export function isSealedGenre(genre: string): boolean {
  return genre === "Sealed Product";
}

// console-name itself (not just genre) carries the language for
// Japanese/Chinese/Korean product, e.g. "Pokemon Japanese Scarlet & Violet
// 151" is genre "Pokemon Card" like any English console.
export function isForeignConsole(consoleName: string): boolean {
  return /\b(japanese|chinese|korean)\b/i.test(consoleName);
}

// Tight, punctuation/diacritic/whitespace-insensitive key for matching our
// CardSet.name against PriceCharting's console-name -- e.g. "HS—Unleashed"
// and "Unleashed" both normalize to "unleashed". Word-order differences
// ("FireRed & LeafGreen" vs "Fire Red & Leaf Green") also collapse together
// since spaces are stripped entirely rather than just collapsed.
export function tightNormalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^pokemon\s+/i, "")
    .replace(/[^a-z0-9]/g, "");
}

// Manual aliases for CardSet names whose vocabulary differs from
// PriceCharting's console-name beyond what tight-normalizing can bridge --
// built by diffing our 173 CardSet names against PriceCharting's ~250
// distinct English Pokemon consoles. Values are PriceCharting console names
// (with or without the "Pokemon " prefix; both are tight-normalized before
// comparison). Trainer Gallery / Shiny Vault / Galarian Gallery subsets are
// listed under their parent set's console since PriceCharting doesn't split
// those out -- card-number matching (distinct "TGxx"/"SVxxx"/"GGxx" formats)
// disambiguates within the shared console.
export const SET_NAME_ALIASES: Record<string, string> = {
  Base: "Pokemon Base Set",
  "Expedition Base Set": "Pokemon Expedition",
  "HS—Unleashed": "Pokemon Unleashed",
  "HS—Undaunted": "Pokemon Undaunted",
  "HS—Triumphant": "Pokemon Triumphant",
  "Team Magma vs Team Aqua": "Pokemon Team Magma & Team Aqua",
  "Kalos Starter Set": "Pokemon Kalos Starter",
  "151": "Pokemon Scarlet & Violet 151",
  "Scarlet & Violet Energies": "Pokemon Scarlet & Violet Energy",
  "Hidden Fates Shiny Vault": "Pokemon Hidden Fates",
  "Shining Fates Shiny Vault": "Pokemon Shining Fates",
  "Brilliant Stars Trainer Gallery": "Pokemon Brilliant Stars",
  "Lost Origin Trainer Gallery": "Pokemon Lost Origin",
  "Silver Tempest Trainer Gallery": "Pokemon Silver Tempest",
  "Astral Radiance Trainer Gallery": "Pokemon Astral Radiance",
  "Crown Zenith Galarian Gallery": "Pokemon Crown Zenith",
  "Celebrations: Classic Collection": "Pokemon Celebrations",
};

// PriceCharting dumps every English promo card (Wizards through
// Scarlet & Violet Black Star Promos) into one flat "Pokemon Promo" console
// instead of splitting by era like our CardSets do. Rather than guess a
// single era to alias it to, callers should match promo rows by number
// against every CardSet whose name contains "Promo" -- most eras bake the
// era prefix into the number itself (e.g. "XY01", "SM244", "SWSH083"), which
// keeps cross-era collisions rare.
export const FLAT_PROMO_CONSOLE = "Pokemon Promo";

export type ConsoleIndex = Map<string, { consoleName: string; rows: PriceGuideRow[] }>;

export function buildConsoleIndex(rows: PriceGuideRow[]): ConsoleIndex {
  const index: ConsoleIndex = new Map();
  for (const row of rows) {
    if (isForeignConsole(row.consoleName)) continue;
    const key = tightNormalize(row.consoleName);
    let entry = index.get(key);
    if (!entry) {
      entry = { consoleName: row.consoleName, rows: [] };
      index.set(key, entry);
    }
    entry.rows.push(row);
  }
  return index;
}

export function matchSetConsole(setName: string, index: ConsoleIndex): PriceGuideRow[] | null {
  const alias = SET_NAME_ALIASES[setName];
  const key = tightNormalize(alias ?? setName);
  return index.get(key)?.rows ?? null;
}

export type ParsedCardName = { name: string; number: string; hasVariantQualifier: boolean };

// Individual-card rows end in "#<number>" where <number> is either bare
// digits ("43") or an era-prefixed promo code ("XY01", "SM244", "SWSH083").
// PriceCharting also lists separate rows per print variant of the same card
// ("Abra #43", "Abra [1st Edition] #43", "Abra [Shadowless] #43") that our
// schema doesn't model separately -- `hasVariantQualifier` flags those so
// callers can prefer the unqualified row when several share a number.
export function parseCardNumber(productName: string): ParsedCardName | null {
  const match = productName.match(/#(\w+)\s*$/);
  if (!match) return null;
  const name = productName
    .slice(0, match.index)
    .replace(/\[.*?\]/g, "")
    .trim();
  if (!name) return null;
  return {
    name,
    number: match[1],
    hasVariantQualifier: /\[.*?\]/.test(productName),
  };
}

// Zero-padding varies between our data and PriceCharting's for the same
// card (our "SV001" vs PriceCharting's "SV1", or "004" vs "4") -- comparing
// on this normalized form (letter prefix + de-padded digits) avoids treating
// those as different cards.
export function normalizeNumber(number: string): string {
  const match = number.match(/^([A-Za-z]*)0*(\d+)$/);
  if (!match) return number.toUpperCase();
  return `${match[1].toUpperCase()}${match[2]}`;
}

// PriceCharting doesn't split "Trainer Gallery" / "Shiny Vault" / "Galarian
// Gallery" subsets into their own console the way our CardSets do -- they're
// numbered within their parent set's console (e.g. Astral Radiance's console
// has both plain-numbered main-set cards and "TG01"-style gallery cards).
// SET_NAME_ALIASES points these subsets at their parent's console; this map
// is how callers tell which numbers within that shared console actually
// belong to the subset (vs. the parent) so the two don't create duplicates
// of each other's cards.
export const SUBSET_NUMBER_PREFIX: Record<string, RegExp> = {
  "Hidden Fates Shiny Vault": /^SV\d+$/i,
  "Shining Fates Shiny Vault": /^SV\d+$/i,
  "Brilliant Stars Trainer Gallery": /^TG\d+$/i,
  "Lost Origin Trainer Gallery": /^TG\d+$/i,
  "Silver Tempest Trainer Gallery": /^TG\d+$/i,
  "Astral Radiance Trainer Gallery": /^TG\d+$/i,
  "Crown Zenith Galarian Gallery": /^GG\d+$/i,
};

// Any number matching one of the SUBSET_NUMBER_PREFIX patterns above,
// regardless of which specific subset it is -- used to exclude those rows
// when processing a *parent* set sharing the same console (a normal set's
// cards never use a "TG"/"SV"/"GG" prefix, so this exclusion is safe).
export const ANY_SUBSET_NUMBER_PATTERN = /^(TG|SV|GG)\d+$/i;

// Prisma error messages conventionally start with a leading newline before
// the actual text (e.g. "\nInvalid `prisma.card.create()` invocation:\n...")
// -- a plain `.split("\n")[0]` on those yields an empty string, which is
// what motivated this helper.
export function firstErrorLine(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.message.split("\n").find((line) => line.trim().length > 0) ?? err.message;
}

// Shared by both ingest-cards-pricecharting.ts and
// ingest-sealed-products-pricecharting.ts: a PriceCharting console with no
// matching CardSet becomes a new one (name = console-name minus the leading
// "Pokemon " prefix) so its cards/sealed products have somewhere to attach.
export async function resolveOrCreateSet(consoleName: string): Promise<{ id: string; created: boolean }> {
  const name = consoleName.replace(/^Pokemon\s+/i, "");
  const existing = await prisma.cardSet.findFirst({ where: { name } });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.cardSet.create({ data: { name } });
  return { id: created.id, created: true };
}
