import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// eBay requires every production keyset using Sell APIs to subscribe to
// "Marketplace Account Deletion/Closure Notifications" -- a GDPR-driven
// compliance requirement, separate from the RuName/OAuth setup in
// lib/ebay-oauth.ts. Configured in the Developer Portal's "Notifications"
// page: give eBay this endpoint's URL and the EBAY_VERIFICATION_TOKEN below,
// and eBay verifies ownership with the GET challenge handled here before
// it'll start sending real POST notifications.
//
// The challenge hash below must be computed over the *exact* URL string
// registered with eBay -- deliberately NOT derived from the incoming request
// (via request.url/nextUrl or Host/x-forwarded-proto headers) the way
// lib/google-oauth.ts's getRequestOrigin does for the Google flow. Unlike
// Google's per-origin redirect URIs, eBay only ever has ONE registered
// endpoint URL, and this app sits behind a proxy (tailscale serve, or
// whatever fronts prod) that can rewrite/strip those headers before they
// reach Next.js -- getting the origin wrong here silently breaks the
// checksum with no useful error, so it's safer to just pin the exact
// registered string via env var and fail loudly if it's missing.
function verificationToken(): string {
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  if (!token) {
    throw new Error("EBAY_VERIFICATION_TOKEN is not set.");
  }
  return token;
}

function registeredEndpointUrl(): string {
  const url = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT_URL;
  if (!url) {
    throw new Error(
      "EBAY_ACCOUNT_DELETION_ENDPOINT_URL is not set -- must exactly match the notification endpoint URL registered in the eBay Developer Portal."
    );
  }
  return url;
}

// eBay's challenge-response scheme: hash(challengeCode + verificationToken +
// endpointUrl) as a hex-encoded SHA-256 digest, returned as JSON. Proves this
// server controls both the endpoint and the token before eBay will send real
// notifications here.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const challengeCode = new URL(request.url).searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ error: "Missing challenge_code" }, { status: 400 });
  }

  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(verificationToken());
  hash.update(registeredEndpointUrl());

  return NextResponse.json({ challengeResponse: hash.digest("hex") });
}

type EbayAccountDeletionNotification = {
  notification?: {
    data?: {
      userId?: string;
    };
  };
};

// Real notification: an eBay seller deleted/closed their eBay account, so we
// purge any of our own data tied to it. Always acknowledge with 200 quickly
// (eBay resends for 24h and eventually marks the endpoint "down" if it never
// gets acknowledged) even if we don't recognize the eBay user id -- there's
// nothing to clean up in that case, not an error.
//
// NOT IMPLEMENTED: eBay's guide recommends verifying the X-EBAY-SIGNATURE
// header (via their Event Notification SDK, or a manual public-key lookup
// against the Notification API's getPublicKey) before trusting a POST body
// as genuinely from eBay, rather than acting on it purely because it parsed.
// Since the only action taken here is deleting our OWN copy of that eBay
// account's tokens/connection (Transaction rows imported from it are left
// alone), a forged request is low-blast-radius -- worst case, a legitimate
// user's EbayAccount connection gets dropped and they have to reconnect --
// but this should still be added before this endpoint carries anything more
// sensitive.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as EbayAccountDeletionNotification;
  const ebayUserId = body.notification?.data?.userId;

  if (ebayUserId) {
    await prisma.ebayAccount.deleteMany({ where: { ebayUserId } });
  }

  return NextResponse.json({ status: "received" });
}
