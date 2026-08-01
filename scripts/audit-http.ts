import "dotenv/config";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

// HTTP half of TEST-PLAN.md: sweeps every route in each auth state and checks
// status codes, redirects, timing, and escaping. Point it at whichever
// environment is under test:
//
//   npm run audit:http                                  (prod, :3000)
//   AUDIT_BASE=http://localhost:3001 npm run audit:http (uat)
//
// Signed-in states are exercised by minting a session JWT with the same
// SESSION_SECRET the app uses, so no browser or password is needed.

const BASE = process.env.AUDIT_BASE ?? "http://localhost:3000";
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

let failures = 0;

function mint(userId: string) {
  return new SignJWT({ userId, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

function strip(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    // Names carry entities ("Scarlet &amp; Violet") and React splits text at
    // interpolation boundaries ("44,082 result</!-- -->s"), so decode and
    // close the gaps before matching on expected copy.
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

type Expect = { status?: number; location?: string; bodyIncludes?: string; bodyExcludes?: string; maxMs?: number };

async function hit(id: string, path: string, expect: Expect = {}, cookie = "") {
  const t0 = Date.now();
  let res: Response;
  let body = "";
  try {
    res = await fetch(BASE + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
    body = res.status < 300 ? await res.text() : "";
  } catch (e) {
    failures++;
    console.log(`  FAIL  [${id}] ${path} — request threw: ${(e as Error).message}`);
    return "";
  }
  const ms = Date.now() - t0;
  const loc = res.headers.get("location");
  const problems: string[] = [];
  if (expect.status != null && res.status !== expect.status) problems.push(`status ${res.status} != ${expect.status}`);
  if (expect.location != null && loc !== expect.location) problems.push(`location ${loc} != ${expect.location}`);
  if (expect.bodyIncludes && !strip(body).includes(expect.bodyIncludes)) problems.push(`body missing "${expect.bodyIncludes}"`);
  if (expect.bodyExcludes && body.includes(expect.bodyExcludes)) problems.push(`body contains "${expect.bodyExcludes}"`);
  if (expect.maxMs && ms > expect.maxMs) problems.push(`${ms}ms > ${expect.maxMs}ms`);
  if (problems.length) failures++;
  const tag = problems.length ? "FAIL" : "PASS";
  console.log(`  ${tag}  [${id}] ${String(res.status).padStart(3)} ${String(ms).padStart(5)}ms ${path.slice(0, 62).padEnd(62)}${loc ? ` -> ${loc}` : ""}${problems.length ? "  << " + problems.join("; ") : ""}`);
  return body;
}

async function main() {
  console.log(`Binder HTTP audit — ${BASE} — ${new Date().toISOString()}\n`);

  console.log("== SMOKE: signed out ==");
  await hit("SMOKE-01", "/", { status: 200, bodyIncludes: "result" });
  await hit("SETS-01", "/?view=sets", { status: 200 });
  await hit("SEAL-01", "/sealed", { status: 200 });
  await hit("AUTH-06", "/login", { status: 200, bodyIncludes: "Log in" });
  await hit("AUTH-06", "/signup", { status: 200, bodyIncludes: "Sign up" });
  await hit("AUTH-01", "/collection", { status: 307, location: "/login" });
  await hit("AUTH-02", "/watchlist", { status: 307, location: "/login" });
  await hit("SMOKE-08", "/does-not-exist", { status: 404 });

  console.log("\n== Pagination edges ==");
  await hit("CAT-32", "/?page=0", { status: 200 });
  await hit("CAT-32", "/?page=-5", { status: 200 });
  await hit("CAT-32", "/?page=abc", { status: 200 });
  await hit("CAT-33", "/?page=999999", { status: 200 });
  await hit("SETS-08", "/?view=sets&page=99", { status: 200 });
  await hit("SEAL-02", "/sealed?page=999999", { status: 200 });

  console.log("\n== Search: matching ==");
  for (const [id, q] of [["CAT-10", "charizard"], ["CAT-11", "base charizard"], ["CAT-13", "rare holo"],
                         ["CAT-14", "VMAX"], ["CAT-14", "gx"], ["CAT-14", "Basic"], ["CAT-15", "sword"]] as const) {
    await hit(id, `/?q=${encodeURIComponent(q)}`, { status: 200, bodyIncludes: "result" });
  }
  await hit("CAT-16", "/?q=zzzzzzzzz", { status: 200, bodyIncludes: "No cards found" });

  console.log("\n== Search: hostile input ==");
  for (const [id, q, note] of [
    ["CAT-17", "%", "percent"], ["CAT-17", "_", "underscore"], ["CAT-17", "'", "quote"],
    ["CAT-17", '"', "dquote"], ["CAT-17", "\\", "backslash"], ["SEC-01", "' OR 1=1 --", "sqli"],
    ["CAT-18", "ピカチュウ", "japanese"], ["CAT-18", "Pokémon", "accent"], ["CAT-18", "🔥", "emoji"],
    ["CAT-19", "a".repeat(500), "500 chars"], ["CAT-20", "   charizard   ", "whitespace"],
  ] as const) {
    await hit(`${id} ${note}`, `/?q=${encodeURIComponent(q)}`, { status: 200 });
  }
  await hit("CAT-21/SEC-02 xss", `/?q=${encodeURIComponent("<script>alert(1)</script>")}`, {
    status: 200,
    bodyExcludes: "<script>alert(1)</script>",
  });

  console.log("\n== Suggestions API ==");
  await hit("CAT-22", "/api/card-suggestions?q=char", { status: 200 });
  await hit("CAT-22", "/api/card-suggestions?q=", { status: 200 });
  await hit("CAT-22", "/api/card-suggestions", { status: 200 });
  await hit("SEC-01", `/api/card-suggestions?q=${encodeURIComponent("' OR 1=1--")}`, { status: 200 });

  console.log("\n== Detail pages ==");
  const pick = async (sql: string) => prisma.$queryRawUnsafe<Record<string, string>[]>(sql);
  const [withImg] = await pick(`SELECT id, name FROM "Card" WHERE "imageUrl" IS NOT NULL LIMIT 1`);
  const [noImg] = await pick(`SELECT id, name FROM "Card" WHERE "imageUrl" IS NULL LIMIT 1`);
  const [noPrice] = await pick(`SELECT c.id, c.name FROM "Card" c WHERE NOT EXISTS
    (SELECT 1 FROM "PriceSnapshot" p WHERE p."cardId"=c.id AND p."priceType"='MARKET' AND p.variant='NORMAL') LIMIT 1`);
  await hit("CARD-01", `/cards/${withImg.id}`, { status: 200, bodyIncludes: withImg.name });
  await hit("CAT-06", `/cards/${noImg.id}`, { status: 200, bodyIncludes: noImg.name });
  await hit("CARD-03", `/cards/${noPrice.id}`, { status: 200 });
  await hit("CARD-16", "/cards/not-a-real-id", { status: 404, bodyIncludes: "couldn" });

  const [bigSet] = await pick(`SELECT s.id, s.name FROM "CardSet" s JOIN "Card" c ON c."setId"=s.id GROUP BY s.id, s.name ORDER BY count(c.id) DESC LIMIT 1`);
  await hit("SETD-05", `/sets/${bigSet.id}`, { status: 200, maxMs: 4000 });
  await hit("SETD-07", "/sets/not-a-real-id", { status: 404, bodyIncludes: "couldn" });
  const [emptySet] = await pick(`SELECT s.id FROM "CardSet" s LEFT JOIN "Card" c ON c."setId"=s.id WHERE c.id IS NULL LIMIT 1`);
  if (emptySet) await hit("SETD-01", `/sets/${emptySet.id}`, { status: 200 });

  const [sealed] = await pick(`SELECT id, name FROM "SealedProduct" WHERE "imageUrl" IS NOT NULL LIMIT 1`);
  await hit("SEAL-06", `/sealed/${sealed.id}`, { status: 200, bodyIncludes: sealed.name });
  await hit("SEAL-11", "/sealed/not-a-real-id", { status: 404, bodyIncludes: "couldn" });

  console.log("\n== Image pipeline ==");
  const [img] = await pick(`SELECT "imageUrl" u FROM "Card" WHERE "imageUrl" IS NOT NULL LIMIT 1`);
  await hit("IMG-04", `/_next/image?url=${encodeURIComponent(img.u)}&w=256&q=75`, { status: 200, maxMs: 8000 });
  await hit("IMG-03", `/_next/image?url=${encodeURIComponent("https://evil.example.com/x.png")}&w=256&q=75`, { status: 400 });

  console.log("\n== Auth states ==");
  const user = await prisma.user.findFirst({
    where: { collectionItems: { some: {} } },
    select: { id: true, email: true },
  });
  if (user) {
    const c = `session=${await mint(user.id)}; dash_landed=1`;
    console.log(`  (signed in as ${user.email})`);
    await hit("SMOKE-04", "/collection", { status: 200, bodyIncludes: "My Collection" }, c);
    await hit("WATCH-06", "/watchlist", { status: 200, bodyIncludes: "Watchlist" }, c);
    await hit("AUTH-44", "/login", { status: 307, location: "/collection" }, c);
    await hit("AUTH-44", "/signup", { status: 307, location: "/collection" }, c);
    await hit("AUTH-41", "/", { status: 200 }, c);
    await hit("AUTH-40", "/", { status: 307, location: "/collection" }, `session=${await mint(user.id)}`);
  }

  // A JWT that verifies but names a user this database doesn't have: deleted
  // account, restored database, or a session minted on the other environment
  // (localhost:3000 and :3001 share one cookie jar). Must not lock the user
  // out of /login -- see app/api/auth/reset/route.ts.
  const ghost = `session=${await mint("cl000000000000000000000000")}; dash_landed=1`;
  console.log("  (orphaned session)");
  await hit("AUTH-48", "/collection", { status: 307, location: "/api/auth/reset" }, ghost);
  await hit("AUTH-48", "/api/auth/reset", { status: 307, location: "/login" }, ghost);
  await hit("AUTH-48", "/", { status: 200 }, ghost);

  console.log("  (tampered / expired session)");
  await hit("AUTH-48", "/collection", { status: 307, location: "/login" }, "session=garbage.garbage.garbage");
  await hit("AUTH-49", "/collection", { status: 307, location: "/login" },
    `session=${await new SignJWT({ userId: "x", expiresAt: "2020-01-01" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
      .sign(key)}`);

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} CHECK(S) FAILED.`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
