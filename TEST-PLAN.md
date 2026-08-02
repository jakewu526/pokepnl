# Binder — Regression Test Plan

**Living document.** Every feature that ships gets a test case here. Nothing is ever
removed just because it passed last time — the whole point is that a feature which
worked in round N can break in round N+1.

- **Last full run:** 2026-07-31 (against prod)
- **Owner:** Jake
- **Scope:** every user-visible feature, both signed-out and signed-in, plus data
  integrity and price-math correctness at the database level.

---

## How to use this document

1. Pick an environment (normally **UAT** before a promote, **prod** after).
2. Work top to bottom through the suites. Each case has a stable ID (`AUTH-03`) —
   use that ID when reporting a bug so results stay comparable across runs.
3. Record the result in the **Run log** at the bottom: date, environment, pass/fail
   per suite, and a link/line for each defect found.
4. When a bug is fixed, **do not delete the case** — add a new case that covers the
   specific regression, so the bug can never come back silently.
5. When a new feature ships, add its cases to the relevant suite **in the same PR**.

**Severity scale used throughout:**

| Level | Meaning |
|---|---|
| **S1** | Data loss, wrong money figures, auth bypass, page crash (500 / error boundary) |
| **S2** | Feature doesn't work, or works wrongly, but nothing is corrupted |
| **S3** | Visual / copy / polish; wrong-but-harmless |

---

## Environments

| | Prod | UAT | Dev |
|---|---|---|---|
| URL (local) | http://localhost:3000 | http://localhost:3001 | `npm run dev` |
| URL (remote) | https://jakepc.tail593b76.ts.net | https://jakepc.tail593b76.ts.net:8443 | — |
| Service | `PokemonTCGApp` | `PokemonTCGApp-UAT` | — |
| Database | `pokemon_tcg` :5432 | `pokemon_tcg_uat` :5433 | either |
| Branch | `master` | `uat` | any |

**Rule:** UAT always gets the change first and is verified there before prod.

### Environment preflight (run before every suite)

| ID | Check | Expected |
|---|---|---|
| ENV-01 | Service status (`Get-Service PokemonTCGApp`) | `Running` |
| ENV-02 | `docker ps` | both `postgres` and `postgres-uat` up |
| ENV-03 | `npx prisma migrate status` | "Database schema is up to date" |
| ENV-04 | `GET /` returns HTTP 200 | 200, HTML body |
| ENV-05 | Service log tail has no unhandled exceptions since last restart | clean |
| ENV-06 | UAT shows the amber **UAT** badge next to "Binder"; prod does **not** | correct per env |
| ENV-07 | Hard-refresh (Ctrl+Shift+R) after any deploy before judging visual bugs | stale chunks are a known false alarm |

---

## Test accounts / fixtures

Keep these three states available. Several bugs only appear in one of them.

| Fixture | Description |
|---|---|
| **Guest** | Not signed in (use a private window — the `session` and `dash_landed` cookies both matter) |
| **Empty user** | Freshly signed-up account, zero collection, zero watchlist, zero transactions |
| **Power user** | ≥ 50 collection items across cards *and* sealed, multiple conditions of the same card, some items with no cost basis, ≥ 5 transactions incl. one at a loss, ≥ 20 watchlist items |
| **Google user** | Account created via Google sign-in (has no `passwordHash`) |

---

# Suite 1 — Availability & smoke (SMOKE)

| ID | Case | Expected |
|---|---|---|
| SMOKE-01 | Load `/` signed out | 200, catalog renders, no console errors |
| SMOKE-02 | Load `/` signed in (first visit of browser session) | redirects to `/collection` once |
| SMOKE-03 | Load `/sealed`, `/login`, `/signup` signed out | all 200 |
| SMOKE-04 | Load `/collection`, `/watchlist` signed in | both 200 |
| SMOKE-05 | Load a card detail, a set detail, a sealed detail | all 200 |
| SMOKE-06 | Browser console on every page above | zero errors (warnings triaged) |
| SMOKE-07 | Server log during the sweep | zero unhandled rejections / Prisma errors |
| SMOKE-08 | Unknown route `/does-not-exist` | 404 page, not a crash |

---

# Suite 2 — Auth, session & route protection (AUTH)

### Signed-out behaviour
| ID | Case | Expected |
|---|---|---|
| AUTH-01 | Visit `/collection` signed out | redirect to `/login` |
| AUTH-02 | Visit `/watchlist` signed out | must not 500; either redirect to `/login` or render a signed-out state |
| AUTH-03 | Card tile heart, signed out | visible; clicking sends to signup/login, saves nothing |
| AUTH-04 | Quick add-to-collection button, signed out | visible; clicking sends to signup/login |
| AUTH-05 | Card / sealed detail add form, signed out | visible, prompts sign-in |
| AUTH-06 | Header shows "Log in / Sign up" | yes |

### Sign-up
| ID | Case | Expected |
|---|---|---|
| AUTH-10 | Sign up with valid email + 8+ char password | account created, session set, lands on `/collection` |
| AUTH-11 | Sign up with invalid email | inline field error, no account |
| AUTH-12 | Sign up with 7-char password | "at least 8 characters" error |
| AUTH-13 | Sign up with an email that already exists | "An account with this email already exists." |
| AUTH-14 | Sign up with email differing only by case / trailing space | trimmed; must not create a duplicate account |
| AUTH-15 | Name field left blank | allowed, stored as null |

### Log in
| ID | Case | Expected |
|---|---|---|
| AUTH-20 | Correct credentials | session set, lands on `/collection` |
| AUTH-21 | Wrong password | "Invalid email or password." — must not reveal whether the email exists |
| AUTH-22 | Unknown email | same generic message |
| AUTH-23 | Log in with a Google-only account's email + any password | "This account uses Google sign-in." |
| AUTH-24 | Empty password | validation error, no server round trip failure |

### Google OAuth
| ID | Case | Expected |
|---|---|---|
| AUTH-30 | Google sign-in on prod local (`localhost:3000`) | completes, session set |
| AUTH-31 | Google sign-in on prod remote (Funnel HTTPS host) | completes (redirect URI registered) |
| AUTH-32 | Google sign-in on UAT (`:3001` and `:8443`) | completes |
| AUTH-33 | Cancel at Google's consent screen | returns to app cleanly, no crash, still signed out |
| AUTH-34 | Google account whose email matches an existing password account | links or errors *deliberately* — must not create a second account silently |
| AUTH-35 | `/api/auth/handoff` used from a remote origin | session lands on the correct origin |

### Session lifecycle & the dashboard-landing cookie
| ID | Case | Expected |
|---|---|---|
| AUTH-40 | Signed in, visit `/` for the first time in a browser session | one redirect to `/collection`, `dash_landed` cookie set |
| AUTH-41 | From `/collection`, click "← Binder" | goes to `/`, **stays** there (no bounce back) |
| AUTH-42 | Browser Back from `/collection` after AUTH-40 | no redirect loop |
| AUTH-43 | Reach `/collection` via a direct link/bookmark, then click "← Binder" | works on the first click |
| AUTH-44 | Signed in, visit `/login` or `/signup` directly | redirected to `/collection` |
| AUTH-45 | On `/login`, use the "leave / back" affordance | escapes to the catalog |
| AUTH-46 | Log out | session cleared, redirected to `/login`, `/collection` now inaccessible |
| AUTH-47 | Log out then Back button | must not show a cached signed-in dashboard with live data |
| AUTH-48 | Tamper with the `session` cookie value | treated as signed out, no 500 |
| AUTH-49 | Expired session token | treated as signed out, no 500 |

### Authorization / IDOR — **S1 if any fail**
| ID | Case | Expected |
|---|---|---|
| AUTH-60 | User A calls `removeFromCollection` with User B's `collectionItemId` | no-op, B's data untouched |
| AUTH-61 | User A calls `sellCollectionItem` with B's item id | no-op |
| AUTH-62 | User A calls `setFeaturedWatchlistCard` with B's watchlist item id | rejected |
| AUTH-63 | Any server action invoked with no session | throws/redirects, never writes |

---

# Suite 3 — Navigation & routing (NAV)

| ID | Case | Expected |
|---|---|---|
| NAV-01 | Catalog nav (Cards / Sealed / Watchlist / Collection) highlights the active tab | correct on every page |
| NAV-02 | Back link on card detail returns to the *previous* page (search results, set page, collection) — not always home | correct origin |
| NAV-03 | Back link preserves search query + page number | `?q=…&page=…` intact |
| NAV-04 | Browser Back/Forward across catalog → detail → catalog | no loops, scroll state sane |
| NAV-05 | Deep-link a URL with `?view=sets&page=3&q=base` | renders exactly that state |
| NAV-06 | Nav from Singles → Sets → Singles | fast (< ~1s), no full reload flash |
| NAV-07 | Every internal link on each page returns 200 (link sweep) | no dead links |

---

# Suite 4 — Catalog: Singles (CAT)

| ID | Case | Expected |
|---|---|---|
| CAT-01 | Default `/` | 30 cards, result count matches `Card` table count |
| CAT-02 | Header stat "N cards · M sets" | matches DB counts |
| CAT-03 | Grid responsive: 2 cols mobile / 3 tablet / 5 desktop | correct |
| CAT-04 | Card tile shows name, set, number `007/102`, rarity chip, price | correct formatting |
| CAT-05 | Card with no price | "No price yet", not `$0.00`, not blank |
| CAT-06 | Card with no image | "No image" placeholder, tile keeps its shape |
| CAT-07 | Rarity chip absent when rarity is null | no empty chip |

### Search
| ID | Case | Expected |
|---|---|---|
| CAT-10 | Search `charizard` | only Charizards; count matches DB |
| CAT-11 | Multi-token `base charizard` | AND semantics — Charizard cards from Base-ish sets |
| CAT-12 | Search by card number `25` | matches numbers, not just names |
| CAT-13 | Search by rarity `rare holo` | matches |
| CAT-14 | Search by subtype `VMAX`, `gx`, `Basic` (mixed casing) | all three casings work |
| CAT-15 | Search by set name / era `sword` | matches via set relation |
| CAT-16 | Nonsense query `zzzzzz` | empty state message, no crash |
| CAT-17 | Query with `%`, `_`, `'`, `"`, `\` | treated literally, no SQL error |
| CAT-18 | Query with emoji / Japanese / accents | no crash; sensible results |
| CAT-19 | Very long query (500 chars) | no crash, no timeout |
| CAT-20 | Query with leading/trailing whitespace | trimmed |
| CAT-21 | XSS attempt `<script>alert(1)</script>` | rendered as text in the "No cards found for …" message, never executed |
| CAT-22 | Autocomplete dropdown appears while typing | ≤ 8 suggestions, exact/prefix matches ranked first |
| CAT-23 | Click a suggestion | navigates to that card |
| CAT-24 | Keyboard: ↑/↓/Enter/Escape in the suggestion list | works, Escape closes |
| CAT-25 | Submit search on mobile | keyboard dismisses |
| CAT-26 | Rapid typing / stale responses | dropdown never shows results for an earlier keystroke |
| CAT-27 | Search then clear | returns to full catalog |

### Pagination
| ID | Case | Expected |
|---|---|---|
| CAT-30 | Page 1 has no "Previous"; last page has no "Next" | correct |
| CAT-31 | Last page (`page = ceil(total/30)`) | renders remainder, no crash |
| CAT-32 | `?page=0`, `?page=-5`, `?page=abc` | clamps to page 1 |
| CAT-33 | `?page=999999` (beyond the end) | empty state, no crash |
| CAT-34 | Page number preserved when toggling view / going back | preserved |
| CAT-35 | Search + page > 1, then refine search | resets to page 1 (no empty page) |

---

# Suite 5 — Catalog: Sets (SETS)

| ID | Case | Expected |
|---|---|---|
| SETS-01 | `?view=sets` | sets grouped by era, most recent era first |
| SETS-02 | Set tile: logo (or text code fallback), release date, market value, progress bar | correct |
| SETS-03 | Progress bar signed out | shows 0 / total or hides — must not error |
| SETS-04 | Progress bar signed in | owned count matches actual distinct cards owned from that set |
| SETS-05 | Owned count with duplicates (qty 3 of one card) | counts distinct cards, not quantity |
| SETS-06 | Set with `totalCards = null` | no `x/null`, no NaN% |
| SETS-07 | Set market value | plausible; not $0 for a major set |
| SETS-08 | Sets pagination | works; page/query preserved |
| SETS-09 | Search within Sets view | filters sets, empty state has correct copy |
| SETS-10 | Sets view load time | < ~2s (it was the known slow path — LATERAL joins) |
| SETS-11 | Japanese sets appear and are labelled distinctly | present |

---

# Suite 6 — Set detail (SETD)

| ID | Case | Expected |
|---|---|---|
| SETD-01 | `/sets/[id]` renders all cards in the set | count matches DB |
| SETD-02 | Numeric ordering | 1, 2, 3 … 10, 11 — **never** 1, 10, 100, 11 |
| SETD-03 | Non-numeric numbers (`SWSH134`, `10a`, `TG05`) | sorted sensibly, displayed correctly |
| SETD-04 | Header: set name, era, logo, total, release date | correct |
| SETD-05 | Very large set (250+ cards) | renders without timeout |
| SETD-06 | Heart / quick-add on cards inside a set | work, watched state accurate |
| SETD-07 | Invalid set id | 404, not 500 |

---

# Suite 7 — Card detail & price charts (CARD)

| ID | Case | Expected |
|---|---|---|
| CARD-01 | `/cards/[id]` shows image, name, set, number, rarity, supertype/subtypes | correct |
| CARD-02 | Current price + source label | matches the tile price for the same card |
| CARD-03 | Card with zero price history | chart area shows an empty state, not a broken axis |
| CARD-04 | Card with one data point | no crash |
| CARD-05 | Price history chart renders | line visible, axes labelled |
| CARD-06 | Range toggle 7d / 30d / 90d / all | each re-renders correctly; 7d on sparse data doesn't go blank |
| CARD-07 | Custom date range control | accepts a range, respects it |
| CARD-08 | Single-day lookup | returns that day's price (or nearest prior), stated clearly |
| CARD-09 | Invalid custom range (end before start) | handled, no crash |
| CARD-10 | Future date range | empty/handled |
| CARD-11 | Drag-to-zoom on the chart | zooms; double-click resets |
| CARD-12 | Grade chart (Ungraded → PSA 10) | series in display order; PSA 10 ≥ Grade 9 ≥ Ungraded for the same date on most cards |
| CARD-13 | Reverse-holo toggle | shows a distinct series; absent when the card has no reverse-holo data |
| CARD-14 | Densified/interpolated points | look smooth, don't invent implausible spikes |
| CARD-15 | Chart with 300+ points | renders in a reasonable time |
| CARD-16 | Invalid card id | 404, not 500 |
| CARD-17 | Add-to-collection form on detail page | see COLL suite |
| CARD-18 | Loading skeleton (`loading.tsx`) appears on slow nav | yes, no layout jump |

---

# Suite 8 — Sealed products (SEAL)

| ID | Case | Expected |
|---|---|---|
| SEAL-01 | `/sealed` lists products with images, type label, price | correct |
| SEAL-02 | Sealed pagination | works |
| SEAL-03 | Sealed search/filter (if present) | works |
| SEAL-04 | Product with no image | type-label placeholder, tile intact |
| SEAL-05 | Product with no price | "No price yet" |
| SEAL-06 | `/sealed/[id]` detail | image, type, set link (if any), price history |
| SEAL-07 | Sealed price chart | renders; empty state handled |
| SEAL-08 | Heart on sealed tile / detail | adds to watchlist, state persists |
| SEAL-09 | Add sealed to collection with cost + qty | appears in collection |
| SEAL-10 | Sealed condition options (`Mint` default) | stored and displayed |
| SEAL-11 | Invalid sealed id | 404 |
| SEAL-12 | Japanese sealed products | present, priced |

### Catalog completeness & correctness (added 2026-08-02)

The sealed catalog is sourced primarily from TCGplayer via the keyless
tcgcsv.com mirror (`lib/tcgcsv.ts`), with PriceCharting supplying price history
and the products TCGplayer doesn't list. Both sources describe the same product
under different names, so identity bugs are the main regression risk here.

| ID | Case | Expected |
|---|---|---|
| SEAL-20 | Total sealed count | ≥ 3,800; a large drop means a merge phase over-matched |
| SEAL-21 | Product name matches the product its `pricechartingId` points at | 0 mismatches (`npm run repair:sealed` reports 0 renames on a clean DB) |
| SEAL-22 | No sealed row is named like a single card (`#205`) | audit PRICE-13 = 0 |
| SEAL-23 | Retailer exclusives present | Costco and Sam's Club products searchable (e.g. "Sam's Club" returns ≥ 8) |
| SEAL-24 | Pokémon Center exclusives distinct from the base product | e.g. `151 Elite Trainer Box` and the Pokémon Center ETB are separate rows with different prices/images |
| SEAL-25 | Display cases distinguished from their contents | `Ascended Heroes Mini Tin Display` is `DISPLAY_CASE` (~$326) and separate from `Mini Tin [Pikachu & Tepig]` (~$34) |
| SEAL-26 | Every tin/collection variant of a set is listed, not one per type | 151 and Ascended Heroes both list all variants |
| SEAL-27 | Type filter pills (`?type=`) | filter correctly; selection survives paging |
| SEAL-28 | Language filter (`?lang=EN` / `JA`) | filters; JP tiles show the `JP` badge |
| SEAL-29 | Type badge on tile | shows for every product, not just imageless ones |
| SEAL-30 | List price == detail price for the same product | always equal (shared resolver in `lib/sealed.ts`) |
| SEAL-31 | Price source cascade | TCGplayer market preferred over PriceCharting over eBay |
| SEAL-32 | Presale product with no market price | shows its preorder MID/LOW price, not "No price yet" |
| SEAL-33 | Released product lacking a resolvable price | audit PRICE-12b = 0 |
| SEAL-34 | Sealed images load from `tcgplayer-cdn.tcgplayer.com` | host listed in `next.config.ts` remotePatterns; no 4xx in console |
| SEAL-35 | Re-running the ingest/repair scripts | idempotent — no duplicates created, no names flip-flopping between runs |
| SEAL-36 | Collection/transaction rows survive a repair run | the repair never deletes a product carrying user data |

---

# Suite 9 — Watchlist (WATCH)

| ID | Case | Expected |
|---|---|---|
| WATCH-01 | Heart a card from the catalog | fills instantly (optimistic), persists after refresh |
| WATCH-02 | Unheart | removes; gone from `/watchlist` after refresh |
| WATCH-03 | Heart the same card twice fast (double-click) | no duplicate row, no error (upsert) |
| WATCH-04 | Heart state correct on return to catalog | filled hearts match the watchlist |
| WATCH-05 | `/watchlist` empty state | friendly copy, no charts |
| WATCH-06 | Watchlist summary: total / cards / sealed | totals = sum of latest prices; total = card + sealed exactly |
| WATCH-07 | Watchlist value-over-time chart | renders; monotone gaps handled |
| WATCH-08 | Item on the watchlist with no price data | excluded from totals rather than counted as 0 — verify the stated behaviour is the actual one |
| WATCH-09 | Watchlist with 100+ items | loads in reasonable time |
| WATCH-10 | Heart a card, then delete it from the collection | watchlist unaffected (independent features) |
| WATCH-11 | Rotating 3D watchlist card on `/collection` | renders, animates, doesn't error with 0 or 1 watchlist items |
| WATCH-12 | Pin a featured watchlist card | pinned card is the one shown, survives refresh |
| WATCH-13 | Unpin | falls back to random rotation |
| WATCH-14 | Pinned card removed from watchlist | dashboard falls back gracefully, no crash |

---

# Suite 10 — Collection: adding (COLL)

| ID | Case | Expected |
|---|---|---|
| COLL-01 | Quick-add popup from a card tile | portals above the tile, centred, closes on Escape/outside click |
| COLL-02 | Quick-add with price + condition + quantity | item created with exactly those values |
| COLL-03 | Quick-add popup near the grid edge / bottom row | stays on screen, not clipped |
| COLL-04 | Quick-add while scrolled | popup positioned over the right tile |
| COLL-05 | Add from card detail form | same result as quick add |
| COLL-06 | Add the *same card, same condition* twice | one row, quantity summed |
| COLL-07 | Cost basis on repeat add | weighted average: `(c1*q1 + c2*q2)/(q1+q2)` — verify arithmetic |
| COLL-08 | Repeat add with **no** cost entered | previous cost basis preserved (not zeroed, not overwritten) |
| COLL-09 | First add with no cost, second add **with** cost | cost becomes the new cost (documented behaviour) |
| COLL-10 | Same card, *different* condition | separate rows |
| COLL-11 | Quantity 0 / negative / blank / `abc` | coerced to 1, never 0 or negative |
| COLL-12 | Quantity 1.5 | floored to 1 |
| COLL-13 | Quantity 10000 | accepted or rejected deliberately; totals stay finite and correct |
| COLL-14 | Cost `-50` | rejected, or handled deliberately — must not produce nonsense P&L |
| COLL-15 | Cost `1e9` / very large | no overflow, formatting stays readable |
| COLL-16 | Cost with 3+ decimals (`1.005`) | rounded consistently with the Decimal column |
| COLL-17 | Cost blank | stored null, shown as "—", counted in "items missing cost" |
| COLL-18 | Add 60+ distinct items | collection page still loads; grid, charts, totals all correct |
| COLL-19 | Rapid double-submit of the add form | one item added, not two |
| COLL-20 | UI updates without a manual refresh after add (`revalidatePath`) | yes |

---

# Suite 11 — Collection dashboard & portfolio value (PORT)

| ID | Case | Expected |
|---|---|---|
| PORT-01 | Empty collection | "Your collection is empty", no value cards, no charts, no NaN |
| PORT-02 | Total / Cards / Sealed tiles | `total == cards + sealed` exactly |
| PORT-03 | Card counts | counts sum **quantity**, and the label matches what's counted |
| PORT-04 | Item value = latest price × condition multiplier × qty | NM 1.0, LP 0.85, MP 0.7, HP 0.5, DMG 0.3 — spot-check by hand |
| PORT-05 | Sealed value = price × qty (no condition multiplier) | correct |
| PORT-06 | Item with no price data | contributes 0 to value; not NaN, not `$NaN` |
| PORT-07 | Per-item unrealized `(market − cost) × qty` | matches hand calculation |
| PORT-08 | Negative unrealized is amber, positive emerald, sign prefix `+`/`-` | correct |
| PORT-09 | "Collection value over time" chart | starts no earlier than the earliest item's added date |
| PORT-10 | Item added today | today's point includes it; yesterday's does not |
| PORT-11 | Chart when all items were added today | single point / sensible degenerate case |
| PORT-12 | **Summary vs. tiles consistency** | the sum of the per-tile market values equals the "Total value" tile (both must use the same "latest price" definition) |
| PORT-13 | Chart's last point vs. Total value tile | equal, or the difference is understood and documented |
| PORT-14 | Condition multiplier applied in *both* the tile and the total | consistent |
| PORT-15 | Currency formatting | `$1,234.56`, no floating-point tails like `$12.340000000001` |
| PORT-16 | Timezone: an item added late at night | doesn't land on the wrong day in the chart (UTC date keys) |

---

# Suite 12 — Selling, P&L, transactions (PNL)

| ID | Case | Expected |
|---|---|---|
| PNL-01 | Sell full quantity | item removed from collection, transaction created |
| PNL-02 | Sell partial quantity | quantity decremented by exactly that amount, transaction records the sold qty |
| PNL-03 | Sell more than owned | clamped to owned quantity |
| PNL-04 | Sell 0 or negative | clamped to 1 or rejected — never creates a bogus row |
| PNL-05 | Profit = `(salePrice − cost) × qty` | hand-verified |
| PNL-06 | Sell an item with **no** cost basis | profit null → shown as "—", excluded from realized total |
| PNL-07 | Sale below cost | negative profit, amber styling |
| PNL-08 | Realized profit tile = sum of all transaction profits | exact |
| PNL-09 | Unrealized profit tile = Σ over items with cost of `(market×mult − cost)×qty` | exact |
| PNL-10 | "N items missing cost" counter | matches the number of collection rows with null cost |
| PNL-11 | Realized-profit-over-time chart is **cumulative** | running total, not per-day |
| PNL-12 | Two sales on the same day | aggregated into one point |
| PNL-13 | Transaction table: date, item, qty, cost, sold for, profit | all correct, newest first |
| PNL-14 | Deleting the collection item after a sale | historic transaction remains |
| PNL-15 | Remove (not sell) an item | decrements by 1 / deletes at qty 1; **no** transaction created |
| PNL-16 | Sell price field validation (blank, letters, huge) | handled, no NaN in the table |
| PNL-17 | P&L section hidden when there is nothing to show | hidden for a fresh account |
| PNL-18 | Sold item's name persists even if the card is later removed from the catalog | `itemName` snapshot used |

---

# Suite 13 — Price-data correctness (PRICE)

These are SQL / arithmetic checks, not clicking.

| ID | Case | Expected |
|---|---|---|
| PRICE-01 | Tile price == detail-page price for the same card | equal (both prefer PRICECHARTING → TCGPLAYER → CARDMARKET) |
| PRICE-02 | Detail price == last point of the detail chart | equal |
| PRICE-03 | Source label matches the source actually used | yes |
| PRICE-04 | `getLatestPrices` returns the *newest* snapshot per card | verify against a manual `ORDER BY capturedDate DESC LIMIT 1` |
| PRICE-05 | Only `priceType = MARKET`, `variant = NORMAL` feeds the headline price | reverse-holo never leaks into the main price |
| PRICE-06 | Cards with prices only from CARDMARKET | still show a price, labelled correctly |
| PRICE-07 | Price staleness | report the newest `capturedDate` in the DB; flag if > 3 days old |
| PRICE-08 | Any negative or zero prices in `PriceSnapshot` | none (or understood) |
| PRICE-09 | Absurd prices (> $500k) | none unexplained |
| PRICE-10 | Duplicate snapshots (same card/source/date/variant/condition) | none |
| PRICE-11 | Graded tiers ordered sanely (PSA 10 ≥ Grade 9 ≥ Ungraded) | overwhelmingly true |
| PRICE-12 | Densify never changes the real endpoints | first/last real points preserved |
| PRICE-13 | Densify is deterministic for a given card (seeded) | same chart on reload |

---

# Suite 14 — Images & media (IMG)

| ID | Case | Expected |
|---|---|---|
| IMG-01 | Count of cards with `imageUrl IS NULL` | known number; those tiles show "No image" |
| IMG-02 | Distinct image hosts in the DB | every host is covered by `next.config.ts` `remotePatterns` |
| IMG-03 | Any host **not** in `remotePatterns` | **S1-ish** — Next/Image throws and can break the whole page |
| IMG-04 | Sample of ~50 card image URLs fetched directly | all 200 + `image/*` |
| IMG-05 | Known-bad sets (McDonald's promos etc.) | 404s are contained to a placeholder, no page error |
| IMG-06 | Sealed product images | load; missing ones fall back to the type label |
| IMG-07 | Set logos | load; missing ones fall back to a text code badge |
| IMG-08 | Images after a fresh deploy | hard-refresh first; a stale-chunk blank is a known false alarm (ENV-07) |
| IMG-09 | Broken image at runtime (host 404s) | placeholder/alt text, layout doesn't collapse |
| IMG-10 | Image `alt` text present and meaningful | yes |

---

# Suite 15 — Data integrity (DATA)

| ID | Case | Expected |
|---|---|---|
| DATA-01 | Row counts: Card, CardSet, SealedProduct, PriceSnapshot, User, CollectionItem, WatchlistItem, Transaction | recorded each run; no unexplained drops |
| DATA-02 | Cards with no set | none |
| DATA-03 | Sets with `totalCards` null or less than actual card count | listed; UI must tolerate |
| DATA-04 | CollectionItem with **both** cardId and sealedProductId, or **neither** | none |
| DATA-05 | Same for WatchlistItem and Transaction | none |
| DATA-06 | Orphaned collection/watchlist rows pointing at deleted cards | none |
| DATA-07 | More than one `featured = true` watchlist item per user | none |
| DATA-08 | Duplicate `(userId, cardId, condition)` collection rows | none (unique constraint) |
| DATA-09 | Users with neither `passwordHash` nor a Google link | none |
| DATA-10 | Duplicate emails differing only by case | none |
| DATA-11 | Negative quantities anywhere | none |
| DATA-12 | Rarity strings normalized (no raw enum junk like `RARE_HOLO`) | normalized |
| DATA-13 | Cards with non-numeric numbers | count recorded; sorting still correct |
| DATA-14 | Prisma migration status | up to date on both DBs |

---

# Suite 16 — Scale & limits (SCALE)

| ID | Case | Expected |
|---|---|---|
| SCALE-01 | Collection with 100 items | page loads < ~3s, all totals correct |
| SCALE-02 | Collection with 500 items | loads; if slow, record the time — this is the "does adding too many cards break it" case |
| SCALE-03 | One item with quantity 9999 | totals stay correct, no overflow, formatting fine |
| SCALE-04 | Watchlist with 200 items | loads, chart still renders |
| SCALE-05 | Portfolio chart across many years of history | no timeout; point count reasonable |
| SCALE-06 | Search returning 20k+ results | count + first page fast |
| SCALE-07 | Set with the most cards in the DB | detail page loads |
| SCALE-08 | Concurrent adds from two tabs | no lost updates (transactional) |
| SCALE-09 | Postgres connection pool under repeated fast navigation | no "too many connections" errors |

---

# Suite 17 — Input validation & abuse (SEC)

| ID | Case | Expected |
|---|---|---|
| SEC-01 | SQL metacharacters in search | parameterized, no error (Prisma `$queryRaw` uses bound params — confirm no template interpolation of user input) |
| SEC-02 | XSS in every free-text field (name at signup, search) | escaped on render |
| SEC-03 | Server action called with a non-existent card id | fails cleanly (FK error handled), no 500 page |
| SEC-04 | Server action called with `cardId` of the wrong shape | handled |
| SEC-05 | Password is never returned to the client / logged | confirmed |
| SEC-06 | Session cookie flags: `httpOnly`, `sameSite`, `secure` on HTTPS origins | correct |
| SEC-07 | Signed-out POST to a server action | rejected |
| SEC-08 | Error messages don't leak stack traces in prod | clean |

---

# Suite 18 — Presentation: responsive, theme, a11y (UI)

| ID | Case | Expected |
|---|---|---|
| UI-01 | 375px wide (mobile) | no horizontal scroll on any page |
| UI-02 | 768px (tablet) | grid = 3 cols |
| UI-03 | 1280px+ (desktop) | grid = 5 cols |
| UI-04 | Light mode | readable contrast throughout |
| UI-05 | Dark mode (`prefers-color-scheme: dark`) | every surface flips; no black-on-black or white-on-white |
| UI-06 | Charts in dark mode | axes/labels/lines visible |
| UI-07 | Quick-add popup on mobile | fits on screen, dismissible |
| UI-08 | Sticky header doesn't cover content when scrolling to an anchor | ok |
| UI-09 | Transactions table on mobile | scrolls horizontally inside its container, page doesn't |
| UI-10 | Keyboard-only navigation of the main flows | focus visible, all controls reachable |
| UI-11 | Long card names | truncate/wrap without breaking the tile |
| UI-12 | Loading skeletons | no layout shift when content arrives |
| UI-13 | Rotating watchlist card on mobile | doesn't overflow or trap scroll |
| UI-14 | **Every `/_next/static` asset the page references returns 200** | 0 broken. A rebuild against a live checkout renames content-hashed chunks under the running server, so the HTML asks for files that no longer exist — the page returns 200 with full markup and *no CSS or JS*. Automated in `audit:http` |
| UI-15 | Stylesheet payload is a real size (>5 KB) | catches a tree-shaken or empty sheet |
| UI-16 | `<meta name="viewport">` present | `width=device-width, initial-scale=1` |
| UI-17 | Served CSS contains all breakpoints + dark block | `40rem`, `48rem`, `64rem`, `prefers-color-scheme` |
| UI-18 | **Check on a real phone, over the Funnel URL**, not just a resized desktop window | iOS Safari and Android Chrome differ from devtools emulation |
| UI-19 | Hard-refresh the phone after every deploy before judging a visual bug | phones cache HTML and chunks aggressively (see ENV-07) |

---

# Suite 19 — Deploy & operations (OPS)

| ID | Case | Expected |
|---|---|---|
| OPS-01 | UAT verified before every prod promote | enforced |
| OPS-02 | `npm run build` clean (no type/lint errors) | clean |
| OPS-03 | `npx tsc --noEmit` | clean |
| OPS-04 | `npm run lint` | clean |
| OPS-05 | Migrations applied to both DBs before restart | yes |
| OPS-05b | **Never leave a checkout built-but-not-restarted.** `npm run build` replaces content-hashed chunks under the live server; until it restarts, the running service serves HTML pointing at files that no longer exist | build and restart back to back, then run UI-14 |
| OPS-06 | Service restarts cleanly, log shows no startup errors | yes |
| OPS-07 | Daily price sync ran (check newest `capturedDate`) | within 24–48h |
| OPS-08 | Google OAuth redirect URIs still registered for all four origins | yes |
| OPS-09 | Tailscale Funnel (prod) and Serve (UAT) still up | yes |

---

## Run log

| Date | Env | Suites run | Result | Notes |
|---|---|---|---|---|
| 2026-07-31 | prod | All suites at DB + HTTP level; UI suites by review only | 8 defects — see [TEST-RESULTS-2026-07-31.md](TEST-RESULTS-2026-07-31.md) | First formal run. 4 fixed (graded-price leak, orphaned-session lockout, blank `/watchlist`, missing 404 page), 4 reported. Click-driven cases unverified: the browser pane never composited, so all elements measured 0×0. |

### Automated coverage

Two suites are executable; run both against each environment before signing off:

```bash
npm run audit:data
```

```bash
npm run audit:http
```

`audit:data` covers DATA-*, PRICE-*, and IMG-* against the database.
`audit:http` covers SMOKE-*, CAT-*, SETS-*, SETD-*, CARD-*, SEAL-*, SEC-*, and
AUTH-* by sweeping every route in five auth states (it mints session JWTs with
`SESSION_SECRET`, so it needs no browser or password). Point it at another
environment with `AUDIT_BASE=http://localhost:3001`. Both exit non-zero on
failure. Everything else in this document is still a manual check.

---

## Change log for this plan

| Date | Change |
|---|---|
| 2026-07-31 | Created. Covers every feature through commit `c7794d2`. |
| 2026-08-02 | Added SEAL-20…36 for the TCGplayer-sourced sealed catalog (identity, dedup, type taxonomy, price cascade, filters). |
