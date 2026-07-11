const AUTH_URL = "https://api.tcgplayer.com/token";
export const TCGPLAYER_API_BASE = "https://api.tcgplayer.com";
export const POKEMON_CATEGORY_ID = 3;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const publicKey = process.env.TCGPLAYER_PUBLIC_KEY;
  const privateKey = process.env.TCGPLAYER_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      "TCGPLAYER_PUBLIC_KEY / TCGPLAYER_PRIVATE_KEY are not set. Apply for API access at https://developer.tcgplayer.com."
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: publicKey,
    client_secret: privateKey,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`TCGplayer auth failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    // refresh a minute early to be safe
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

export async function tcgplayerFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${TCGPLAYER_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`TCGplayer request ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Condition-level pricing lives one layer below the aggregate
// /pricing/product/{ids} endpoint used by scripts/snapshot-prices.ts: every
// product has SKUs (productId x printing x condition x language), each with
// its own market price. UNVERIFIED against the live API (no TCGplayer keys
// yet) -- confirm the /catalog/conditions and /catalog/products/{id}/skus
// response shapes once TCGPLAYER_PUBLIC_KEY/PRIVATE_KEY are obtained.

export type TcgSku = {
  skuId: number;
  productId: number;
  printingId: number;
  conditionId: number;
  languageId: number;
};

export type TcgSkuPrice = {
  skuId: number;
  lowPrice: number | null;
  marketPrice: number | null;
};

export type TcgCondition = {
  conditionId: number;
  name: string;
  abbreviation: string;
};

let cachedConditions: TcgCondition[] | null = null;

export async function getConditions(): Promise<TcgCondition[]> {
  if (cachedConditions) return cachedConditions;
  const res = await tcgplayerFetch<{ results: TcgCondition[] }>("/catalog/conditions");
  cachedConditions = res.results;
  return cachedConditions;
}

export async function getProductSkus(productId: number): Promise<TcgSku[]> {
  const res = await tcgplayerFetch<{ results: TcgSku[] }>(
    `/catalog/products/${productId}/skus`
  );
  return res.results;
}

export async function getSkuPrices(skuIds: number[]): Promise<TcgSkuPrice[]> {
  if (skuIds.length === 0) return [];
  const res = await tcgplayerFetch<{ results: TcgSkuPrice[] }>(
    `/pricing/sku/${skuIds.join(",")}`
  );
  return res.results;
}
