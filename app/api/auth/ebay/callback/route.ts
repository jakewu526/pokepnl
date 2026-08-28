import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { EBAY_TOKEN_ENDPOINT, getEbayOAuthClient } from "@/lib/ebay-oauth";
import { prisma } from "@/lib/prisma";

function settingsError(request: NextRequest, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?ebayError=${reason}`, request.url));
}

// eBay's account-deletion notifications (app/api/ebay/account-deletion/route.ts)
// key on the seller's immutable eBay userId, not anything OAuth itself hands
// back -- so without this lookup there'd be no way to match a real deletion
// notification to a stored EbayAccount row. Requires the
// commerce.identity.readonly scope (see lib/ebay-oauth.ts).
async function fetchEbayUserId(accessToken: string): Promise<string | null> {
  const res = await fetch("https://apiz.ebay.com/commerce/identity/v1/user/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { userId?: string };
  return json.userId ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await verifySession();

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("ebay_oauth_state")?.value;
  cookieStore.delete("ebay_oauth_state");

  if (!code || !state || !storedState || state !== storedState) {
    return settingsError(request, "oauth_failed");
  }

  const ebay = getEbayOAuthClient();
  let tokens;
  try {
    tokens = await ebay.validateAuthorizationCode(EBAY_TOKEN_ENDPOINT, code, null);
  } catch {
    return settingsError(request, "oauth_failed");
  }

  // eBay's token response includes refresh_token_expires_in (its refresh
  // tokens are long-lived, ~18 months) alongside the standard fields arctic
  // already parses -- arctic types `.data` as a bare `object`, so read this
  // one field through an untyped cast rather than fighting the type.
  const refreshTokenExpiresInSeconds = Number(
    (tokens.data as Record<string, unknown>).refresh_token_expires_in
  );
  const refreshTokenExpiresAt = new Date(
    Date.now() + (Number.isFinite(refreshTokenExpiresInSeconds) ? refreshTokenExpiresInSeconds : 0) * 1000
  );
  const ebayUserId = await fetchEbayUserId(tokens.accessToken());

  await prisma.ebayAccount.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      ebayUserId,
      accessToken: tokens.accessToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
      refreshToken: tokens.refreshToken(),
      refreshTokenExpiresAt,
    },
    update: {
      ebayUserId,
      accessToken: tokens.accessToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
      refreshToken: tokens.refreshToken(),
      refreshTokenExpiresAt,
    },
  });

  return NextResponse.redirect(new URL("/settings?ebay=connected", request.url));
}
