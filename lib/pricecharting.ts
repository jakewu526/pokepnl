import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

// PriceCharting has no self-serve API (PRICECHARTING_API_TOKEN requires a
// paid subscription), but its public search/listing pages are plain
// server-rendered HTML with no login wall -- robots.txt only disallows
// /stripe-connect, /publish-offer, /buy. We scrape those pages instead of
// calling the gated API. Be a good citizen: keep request volume low and
// cache/rate-limit callers (see scripts/ingest-sealed-products-pricecharting.ts).

const BASE_URL = "https://www.pricecharting.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type PriceChartingResult = {
  pricechartingId: string;
  name: string;
  consoleName: string | null;
  price: number | null;
  imageUrl: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string, retriesLeft = 3): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 429 && retriesLeft > 0) {
    const backoffMs = (4 - retriesLeft) * 5000;
    await sleep(backoffMs);
    return fetchHtml(url, retriesLeft - 1);
  }
  if (!res.ok) {
    throw new Error(`PriceCharting request "${url}" failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseProductRow($: CheerioAPI, row: Element): PriceChartingResult | null {
  const id = $(row).attr("data-product");
  if (!id) return null;

  const name = $(row).find("td.title a").first().text().trim();
  // Search-result rows carry a nested console link; console-scoped catalog
  // rows don't need one since the whole page is already one console.
  const consoleNameRaw = $(row).find("td.title .console-in-title a").first().text().trim();
  // The "used_price" column carries the primary market price for sealed
  // TCG product listings (there's no loose/CIB/new distinction for a
  // factory-sealed box the way there is for graded cards or video games).
  const priceText = $(row).find("td.used_price .js-price").first().text().trim();
  const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, "")) : NaN;

  // Listing rows only link a 60px thumbnail, but PriceCharting serves the
  // same image at other sizes from the same path -- swap in a larger one
  // so tiles/detail pages don't have to fetch the per-product page too.
  const thumbSrc = $(row).find("td.image img").first().attr("src");
  const imageUrl = thumbSrc ? thumbSrc.replace(/\/\d+\.jpg$/, "/240.jpg") : null;

  return {
    pricechartingId: id,
    name,
    consoleName: consoleNameRaw || null,
    price: Number.isFinite(price) && price > 0 ? price : null,
    imageUrl,
  };
}

function parseRows($: CheerioAPI): PriceChartingResult[] {
  const results: PriceChartingResult[] = [];
  $("tr[id^='product-']").each((_, row) => {
    const parsed = parseProductRow($, row);
    if (parsed) results.push(parsed);
  });
  return results;
}

/**
 * A generic search like "Pokemon {set} elite trainer box" gets flooded with
 * individual-card results that also match "Pokemon {set}" (PriceCharting's
 * search is fuzzy/OR-based), so the ~100-result page cap can bury the one
 * sealed product we actually want. Resolve the set's console slug once via
 * search, then fetch its full console catalog page instead -- sealed
 * products sort near the top of a console page, ahead of individual cards.
 */
export async function resolveConsoleSlug(setName: string): Promise<string | null> {
  const results = await searchProductsRaw(`Pokemon ${setName}`);
  const target = normalize(`pokemon ${setName}`);
  const match = results.find((r) => r.consoleSlug && normalize(r.consoleName ?? "") === target);
  return match?.consoleSlug ?? null;
}

type RawResult = PriceChartingResult & { consoleSlug: string | null };

async function searchProductsRaw(query: string): Promise<RawResult[]> {
  const url = `${BASE_URL}/search-products?${new URLSearchParams({ type: "prices", q: query })}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const results: RawResult[] = [];
  $("tr[id^='product-']").each((_, row) => {
    const parsed = parseProductRow($, row);
    if (!parsed) return;
    const consoleHref = $(row).find("td.title .console-in-title a").first().attr("href");
    // Slugs can contain characters beyond [a-z0-9-] -- e.g. "Sun & Moon"
    // becomes "pokemon-sun-&-moon" (a literal ampersand in the URL).
    const slugMatch = consoleHref?.match(/\/console\/([^/?#]+)/);
    results.push({ ...parsed, consoleSlug: slugMatch ? slugMatch[1] : null });
  });
  return results;
}

export async function getConsoleCatalog(slug: string): Promise<PriceChartingResult[]> {
  // Slugs can contain characters like "&" that need percent-encoding, but
  // encodeURIComponent would also escape the literal "/" separators if the
  // slug had any -- it doesn't here, so a straight per-segment encode is safe.
  const encodedSlug = slug.split("/").map(encodeURIComponent).join("/");
  const html = await fetchHtml(`${BASE_URL}/console/${encodedSlug}`);
  return parseRows(cheerio.load(html));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
