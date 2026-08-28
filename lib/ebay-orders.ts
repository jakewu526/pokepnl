import "server-only";
import { prisma } from "@/lib/prisma";
import { EBAY_ORDER_SCOPES, EBAY_TOKEN_ENDPOINT, getEbayOAuthClient } from "@/lib/ebay-oauth";

const FULFILLMENT_API_BASE = "https://api.ebay.com/sell/fulfillment/v1";
const FINANCES_API_BASE = "https://apiz.ebay.com/sell/finances/v1";

// eBay's own Pokemon TCG categories (same ones lib/ebay.ts already searches
// under for price lookups) -- used to auto-filter a seller's *other* items
// (they sell more than just Pokemon) out of the sold-history import.
const POKEMON_CATEGORY_IDS = new Set(["183454", "183456"]);
const POKEMON_TITLE_PATTERN = /pok[eé]mon|\bptcg\b|\betb\b|booster\s*(box|pack)/i;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
// eBay's Fulfillment API hard-rejects any `creationdate` filter whose start
// date is more than 2 years back (confirmed live: errorId 30830, "Start date
// must be within '2' years from present date") -- this is not just a safety
// stop, it's the actual ceiling eBay enforces. A day of slack keeps the last
// window comfortably inside the boundary despite the walk landing on
// slightly different instants than eBay's own "present date" each request.
const BACKFILL_CAP_MS = 2 * 365 * 24 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000;

export type NormalizedOrderLineItem = {
  orderId: string;
  lineItemId: string;
  title: string;
  categoryId: string | null;
  quantity: number;
  salePricePerUnit: number;
  shippingCost: number;
  soldAt: Date;
};

export function isPokemonRelated(item: Pick<NormalizedOrderLineItem, "categoryId" | "title">): boolean {
  if (item.categoryId && POKEMON_CATEGORY_IDS.has(item.categoryId)) return true;
  return POKEMON_TITLE_PATTERN.test(item.title);
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.ebayAccount.findUnique({ where: { userId } });
  if (!account) {
    throw new Error("No eBay account connected for this user.");
  }

  if (account.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return account.accessToken;
  }

  const ebay = getEbayOAuthClient();
  const tokens = await ebay.refreshAccessToken(EBAY_TOKEN_ENDPOINT, account.refreshToken, EBAY_ORDER_SCOPES);

  await prisma.ebayAccount.update({
    where: { userId },
    data: {
      accessToken: tokens.accessToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
      // eBay's refresh grant doesn't reliably return a new refresh token --
      // only update it if one actually came back, otherwise keep the current one.
      ...(tokens.hasRefreshToken() ? { refreshToken: tokens.refreshToken() } : {}),
    },
  });

  return tokens.accessToken();
}

type EbayOrderApiLineItem = {
  lineItemId: string;
  title: string;
  quantity: number;
  categoryId?: string;
  lineItemCost?: { value: string };
  deliveryCost?: { shippingCost?: { value: string } };
};

type EbayOrderApiOrder = {
  orderId: string;
  creationDate: string;
  lineItems: EbayOrderApiLineItem[];
};

type EbayOrderApiResponse = {
  orders?: EbayOrderApiOrder[];
  total?: number;
  next?: string;
};

// eBay rejects any creationdate filter whose start/end appears to be "in the
// future" -- validated against eBay's own clock, not ours. That's a real
// failure mode on a machine whose system clock has drifted (or, as hit
// during development, is deliberately set to a simulated date), since
// `Date.now()` then reads later than eBay's actual present moment. Every
// HTTP response carries a standard `Date` header (RFC 9110 §6.6.1), so this
// calibrates a one-time offset from that rather than trusting the local
// clock for anything sent to eBay. Cached for the process lifetime -- clock
// drift doesn't change fast enough to need re-checking per request.
let cachedClockSkewMs: number | null = null;

async function getEbayNow(accessToken: string): Promise<Date> {
  if (cachedClockSkewMs != null) {
    return new Date(Date.now() + cachedClockSkewMs);
  }

  // Filter-less request purely to read a trustworthy `Date` response header
  // -- can't hit the future-date validation since it sends no date filter.
  const res = await fetch(`${FULFILLMENT_API_BASE}/order?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const dateHeader = res.headers.get("date");
  const serverNowMs = dateHeader ? new Date(dateHeader).getTime() : NaN;

  cachedClockSkewMs = Number.isFinite(serverNowMs) ? serverNowMs - Date.now() : 0;
  return new Date(Date.now() + cachedClockSkewMs);
}

async function fetchOrdersWindow(
  accessToken: string,
  fromIso: string,
  toIso: string
): Promise<NormalizedOrderLineItem[]> {
  const items: NormalizedOrderLineItem[] = [];
  let offset = 0;
  const limit = 200;

  for (;;) {
    const params = new URLSearchParams({
      filter: `creationdate:[${fromIso}..${toIso}]`,
      limit: String(limit),
      offset: String(offset),
    });
    const res = await fetch(`${FULFILLMENT_API_BASE}/order?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`eBay getOrders failed: ${res.status} ${res.statusText} -- ${body}`);
    }

    const json = (await res.json()) as EbayOrderApiResponse;
    const orders = json.orders ?? [];
    for (const order of orders) {
      for (const lineItem of order.lineItems ?? []) {
        items.push({
          orderId: order.orderId,
          lineItemId: lineItem.lineItemId,
          title: lineItem.title,
          categoryId: lineItem.categoryId ?? null,
          quantity: lineItem.quantity,
          salePricePerUnit: lineItem.lineItemCost ? parseFloat(lineItem.lineItemCost.value) : 0,
          shippingCost: lineItem.deliveryCost?.shippingCost ? parseFloat(lineItem.deliveryCost.shippingCost.value) : 0,
          soldAt: new Date(order.creationDate),
        });
      }
    }

    const total = json.total ?? orders.length;
    offset += orders.length;
    if (orders.length === 0 || offset >= total) break;
  }

  return items;
}

// Fetches sold order line items for a connected seller.
//
// - Incremental sync (`sinceIso` set): a single request for the range
//   [sinceIso..now].
// - First-ever sync (`sinceIso` undefined, i.e. "all available history"):
//   eBay's `creationdate` filter only accepts ~90-day ranges per request, so
//   this walks backward in 90-day windows from now until eBay returns an
//   empty window (their order retention has ended) or BACKFILL_CAP_MS is hit.
export async function fetchSoldOrders(userId: string, sinceIso?: string): Promise<NormalizedOrderLineItem[]> {
  const accessToken = await getValidAccessToken(userId);
  const ebayNowMs = (await getEbayNow(accessToken)).getTime();

  if (sinceIso) {
    return fetchOrdersWindow(accessToken, sinceIso, new Date(ebayNowMs).toISOString());
  }

  const all: NormalizedOrderLineItem[] = [];
  let windowEnd = ebayNowMs;
  const backfillFloor = ebayNowMs - BACKFILL_CAP_MS;

  while (windowEnd > backfillFloor) {
    const windowStart = Math.max(windowEnd - NINETY_DAYS_MS, backfillFloor);
    const windowItems = await fetchOrdersWindow(
      accessToken,
      new Date(windowStart).toISOString(),
      new Date(windowEnd).toISOString()
    );
    if (windowItems.length === 0) break;
    all.push(...windowItems);
    windowEnd = windowStart;
  }

  return all;
}

type EbayFinancesTransaction = {
  orderId?: string;
  totalFeeBasisAmount?: { value: string };
  feeType?: string;
  amount?: { value: string };
  transactionType?: string;
};

type EbayFinancesResponse = {
  transactions?: EbayFinancesTransaction[];
};

// Marketplace fees live in the Finances API, not the Fulfillment API used
// above -- returns the total fee amount eBay charged for a given order (all
// line items combined; the Finances API doesn't break fees out per line
// item), or null if the lookup fails so a sync never aborts over missing fee
// data (the user can still see/edit the sale, just without a fee figure).
//
// UNVERIFIED against a live Finances API response -- the exact transaction
// shape (transactionType/feeType/amount fields) is a best-effort guess from
// eBay's docs; confirm once EBAY_CLIENT_ID/SECRET/RUNAME are populated and
// adjust the filter in fetchOrderFees/the fields read above if real responses
// differ. Same caveat lib/ebay.ts already carries for its aspect_filter guess.
export async function fetchOrderFees(userId: string, orderId: string): Promise<number | null> {
  try {
    const accessToken = await getValidAccessToken(userId);
    const params = new URLSearchParams({ filter: `orderId:{${orderId}}` });
    const res = await fetch(`${FINANCES_API_BASE}/transaction?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as EbayFinancesResponse;
    const feeTransactions = (json.transactions ?? []).filter((t) => t.transactionType === "NON_SALE_CHARGE" || t.feeType);
    if (feeTransactions.length === 0) return null;

    return feeTransactions.reduce((sum, t) => sum + (t.amount ? Math.abs(parseFloat(t.amount.value)) : 0), 0);
  } catch {
    return null;
  }
}
