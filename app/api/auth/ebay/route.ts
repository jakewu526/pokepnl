import { generateState } from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { EBAY_AUTHORIZATION_ENDPOINT, EBAY_ORDER_SCOPES, getEbayOAuthClient } from "@/lib/ebay-oauth";
import { verifySession } from "@/lib/dal";

const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes -- just long enough to complete the redirect round trip.

export async function GET(request: NextRequest) {
  // Ensures we know *which* app user to attach the eBay connection to once
  // the callback fires -- eBay's response carries no user identity of ours,
  // only the session cookie set here does.
  await verifySession();

  const ebay = getEbayOAuthClient();
  const state = generateState();
  const authUrl = ebay.createAuthorizationURL(EBAY_AUTHORIZATION_ENDPOINT, state, EBAY_ORDER_SCOPES);

  const cookieStore = await cookies();
  cookieStore.set("ebay_oauth_state", state, {
    httpOnly: true,
    secure: request.headers.get("x-forwarded-proto") === "https",
    maxAge: OAUTH_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.redirect(authUrl);
}
