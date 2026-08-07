import { decodeIdToken } from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, getGoogleRedirectUri, getRequestOrigin, type GoogleIdTokenClaims } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";
import { createHandoffToken, createSession } from "@/lib/session";

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
  const returnOrigin = cookieStore.get("google_oauth_return_origin")?.value;
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_code_verifier");
  cookieStore.delete("google_oauth_return_origin");

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

  // This login started on a spoke device with no Google secret of its own --
  // hand a short-lived token back to it instead of finishing the session here.
  if (returnOrigin) {
    const handoffToken = await createHandoffToken(user.id);
    const handoffUrl = new URL("/api/auth/handoff", returnOrigin);
    handoffUrl.searchParams.set("token", handoffToken);
    return NextResponse.redirect(handoffUrl);
  }

  await createSession(user.id);
  return NextResponse.redirect(new URL("/dashboard", getRequestOrigin(request)));
}
