import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, getGoogleRedirectUri } from "@/lib/google-oauth";

const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes -- just long enough to complete the redirect round trip.

export async function GET(request: NextRequest) {
  const google = getGoogleClient(getGoogleRedirectUri(request));
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: OAUTH_COOKIE_MAX_AGE,
    sameSite: "lax" as const,
    path: "/",
  };
  cookieStore.set("google_oauth_state", state, cookieOptions);
  cookieStore.set("google_code_verifier", codeVerifier, cookieOptions);

  return NextResponse.redirect(url);
}
