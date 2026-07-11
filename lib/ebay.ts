// eBay's Buy Browse API is self-serve (instant developer registration at
// https://developer.ebay.com, no partner approval like TCGplayer). The
// client-credentials grant below only grants access to public browsing
// data (active listings), which is what we use as a sealed-product price
// proxy since we don't have a paid PriceCharting subscription.

const AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_API_BASE = "https://api.ebay.com/buy/browse/v1";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set. Register a free app at https://developer.ebay.com/my/keys."
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`eBay auth failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

export type EbayItemSummary = {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
};

export async function searchActiveListings(
  query: string,
  limit = 50,
  aspectFilter?: { name: string; value: string }
): Promise<EbayItemSummary[]> {
  const token = await getAccessToken();
  const categoryId = "183454"; // eBay's "CCG Individual Cards" parent category; Pokemon sealed product mostly lives under 183456 (CCG Sealed Product)
  const params = new URLSearchParams({
    q: query,
    category_ids: categoryId,
    limit: String(limit),
  });
  // UNVERIFIED against the live Taxonomy API -- the exact aspect name/value
  // strings for "Card Condition" on this category are a best-effort guess;
  // confirm once EBAY_CLIENT_ID/SECRET are populated. See lib/condition.ts.
  if (aspectFilter) {
    params.set(
      "aspect_filter",
      `categoryId:${categoryId},${aspectFilter.name}:{${aspectFilter.value}}`
    );
  }

  const res = await fetch(`${BROWSE_API_BASE}/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!res.ok) {
    throw new Error(`eBay search "${query}" failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
  return json.itemSummaries ?? [];
}
