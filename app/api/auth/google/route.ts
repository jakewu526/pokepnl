import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, getGoogleRedirectUri, getRequestOrigin } from "@/lib/google-oauth";

const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes -- just long enough to complete the redirect round trip.

function normalizeOrigin(candidate: string): string | null {
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const returnOriginParam = url.searchParams.get("returnOrigin");

  // AUTH_HUB_ORIGIN marks this instance as a "spoke": it has no Google
  // client secret of its own, so it bounces the browser to the hub instance
  // (the one device that does), tagging its own origin as returnOrigin so
  // the hub knows where to hand the finished login back to. See
  // app/api/auth/google/callback/route.ts and app/api/auth/handoff/route.ts.
  const hubOrigin = process.env.AUTH_HUB_ORIGIN;
  if (hubOrigin && !returnOriginParam) {
    const ownOrigin = getRequestOrigin(request);
    const hubUrl = new URL("/api/auth/google", hubOrigin);
    hubUrl.searchParams.set("returnOrigin", ownOrigin);
    return NextResponse.redirect(hubUrl);
  }

  const google = getGoogleClient(getGoogleRedirectUri(request));
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authUrl = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: getRequestOrigin(request).startsWith("https://"),
    maxAge: OAUTH_COOKIE_MAX_AGE,
    sameSite: "lax" as const,
    path: "/",
  };
  cookieStore.set("google_oauth_state", state, cookieOptions);
  cookieStore.set("google_code_verifier", codeVerifier, cookieOptions);

  const returnOrigin = returnOriginParam ? normalizeOrigin(returnOriginParam) : null;
  if (returnOrigin) {
    cookieStore.set("google_oauth_return_origin", returnOrigin, cookieOptions);
  }

  return NextResponse.redirect(authUrl);
}
