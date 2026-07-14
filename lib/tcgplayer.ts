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
