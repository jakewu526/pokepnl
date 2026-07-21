import "server-only";
import { Google } from "arctic";
import type { NextRequest } from "next/server";

export function getGoogleClient(redirectUri: string): Google {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    );
  }

  return new Google(clientId, clientSecret, redirectUri);
}

// Derived per-request (rather than a fixed env var) so sign-in works from
// whatever origin the browser actually used -- e.g. localhost on the server
// device, or the server's Tailscale hostname for client devices. Each origin
// used this way must still be added as an Authorized redirect URI in the
// Google Cloud Console OAuth client, since Google requires an exact match.
//
// Built from the `Host` header rather than `request.nextUrl`/`request.url`:
// in this Next.js version those reflect a fixed local origin instead of the
// actual incoming Host header, which breaks for any non-localhost origin.
export function getRequestOrigin(request: NextRequest): string {
  const host = request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}

export function getGoogleRedirectUri(request: NextRequest): string {
  return `${getRequestOrigin(request)}/api/auth/google/callback`;
}

export type GoogleIdTokenClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
};
