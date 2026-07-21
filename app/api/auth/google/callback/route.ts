import { decodeIdToken } from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, getGoogleRedirectUri, getRequestOrigin, type GoogleIdTokenClaims } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

function loginError(request: NextRequest, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, getRequestOrigin(request)));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value;
  const codeVerifier = cookieStore.get("google_code_verifier")?.value;
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_code_verifier");

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return loginError(request, "oauth_failed");
  }

  const google = getGoogleClient(getGoogleRedirectUri(request));
  let tokens;
  try {
    tokens = await google.validateAuthorizationCode(code, codeVerifier);
  } catch {
    return loginError(request, "oauth_failed");
  }

  const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;
  if (!claims.email_verified) {
    return loginError(request, "email_not_verified");
  }

  let user = await prisma.user.findUnique({ where: { googleId: claims.sub } });
  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: claims.email } });
    user = existingByEmail
      ? await prisma.user.update({ where: { id: existingByEmail.id }, data: { googleId: claims.sub } })
      : await prisma.user.create({
          data: { email: claims.email, googleId: claims.sub, name: claims.name ?? null },
        });
  }

  await createSession(user.id);
  return NextResponse.redirect(new URL("/collection", getRequestOrigin(request)));
}
