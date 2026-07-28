import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/google-oauth";
import { createSession, verifyHandoffToken } from "@/lib/session";

// Receives the token the auth hub hands back after finishing a Google login
// on this device's behalf (see app/api/auth/google/callback/route.ts). Only
// needs SESSION_SECRET, which every device already shares -- no Google
// client secret required here.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  const userId = token ? await verifyHandoffToken(token) : null;

  if (!userId) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", getRequestOrigin(request)));
  }

  await createSession(userId);
  return NextResponse.redirect(new URL("/collection", getRequestOrigin(request)));
}
