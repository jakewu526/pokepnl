import "server-only";
import { OAuth2Client } from "arctic";

// eBay's *user-consent* OAuth ("authorization code" grant) for reading a
// seller's own order history -- distinct from lib/ebay.ts's app-level
// client-credentials token, which only grants access to public listing data.
//
// Unlike Google (lib/google-oauth.ts), eBay's `redirect_uri` parameter is not
// a literal URL: it's a "RuName" string you register in the eBay Developer
// Portal, which itself is configured there with a fixed "Your auth accepted
// URL". That means (unlike Google's per-request-origin hub/spoke trick) this
// callback URL can't be derived dynamically per request -- it's whatever
// origin was registered as the RuName's auth-accepted URL, which should be
// the same hub origin AUTH_HUB_ORIGIN/GOOGLE_CLIENT_ID already assume.
export const EBAY_AUTHORIZATION_ENDPOINT = "https://auth.ebay.com/oauth2/authorize";
export const EBAY_TOKEN_ENDPOINT = "https://api.ebay.com/identity/v1/oauth2/token";

export const EBAY_ORDER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances.readonly",
  // Needed to resolve the connecting seller's immutable eBay userId (via the
  // Commerce Identity API, see fetchEbayUserId in the OAuth callback route) --
  // that's the id eBay's account-deletion notifications key on (see
  // app/api/ebay/account-deletion/route.ts), so without it we'd have no way
  // to know whose EbayAccount row a real deletion notification refers to.
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
];

export function getEbayOAuthClient(): OAuth2Client {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RUNAME;
  if (!clientId || !clientSecret || !ruName) {
    throw new Error(
      "eBay account connection is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME."
    );
  }

  // arctic's OAuth2Client sends client credentials as HTTP Basic auth
  // whenever a clientPassword is given, which is what eBay's token endpoint
  // requires. The third constructor arg is normally a literal redirect URI,
  // but here it's the RuName -- arctic just forwards it verbatim as the
  // `redirect_uri` request parameter, which is exactly what eBay expects.
  return new OAuth2Client(clientId, clientSecret, ruName);
}
