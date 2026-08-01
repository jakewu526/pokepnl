# Test run — 2026-07-31 — Production

First full pass of [TEST-PLAN.md](TEST-PLAN.md) against prod (`http://localhost:3000`,
service `PokemonTCGApp`, database `pokemon_tcg`), at commit `c7794d2`.

**Method:** database-level checks over all 6.5M price snapshots and 44k cards;
HTTP sweep of every route in five auth states (signed out, signed in with data,
signed in empty, orphaned session, tampered/expired session); direct fetches of
sampled card, sealed, and set-logo images; source review of the client-only
interaction components.

**Result:** 8 defects found, 4 fixed, 4 reported for a decision.
Fixes are on `master` (`4b3fb58`, `a142db3`) and verified — but **prod is still
running the old build**; see [Deploying the fixes](#deploying-the-fixes).

---

## S1 — Graded prices silently replacing raw card prices

**The bug.** PriceCharting writes one `MARKET`/`NORMAL` snapshot per grade tier
(`condition` = `Grade 7` … `PSA 10`) on the **same `capturedDate`** as the raw
ungraded row (`condition` = `NULL`). Every "latest price" query ordered only by
`capturedDate` therefore had a six-way tie, and Postgres was free to return any
of them. 1,261,202 card-days in prod carry that collision.

**What it did.** On 2026-07-01 — the most recent graded backfill date — 33,339
cards were exposed simultaneously:

| Card | Real raw price | Could have displayed |
|---|---|---|
| Mew | $480.65 | **$150,000** |
| Pikachu ★ | $2,684.47 | **$114,000** |
| Umbreon ★ | $4,250.00 | **$108,881** |
| Shining Charizard | $1,799.99 | **$89,502** |
| Charizard | $4,221.91 | **$83,200** |

Separately, and continuously rather than monthly, the **collection- and
watchlist-value-over-time charts** were affected: they build a per-date series
and keep the last row seen for each date, so graded rows won outright. For
Umbreon VMAX, **60 of 67 dates** in that series were Grade 9.5 money (~$2,971)
instead of the raw price (~$2,225).

Today's totals happened to be correct only because the daily sync writes ungraded
rows and the graded backfill is monthly — so the newest date is currently
ungraded-only. It would have broken again on 2026-08-01.

**Fix.** Scoped the raw-price lookups to ungraded rows in `lib/cards.ts`
(`getLatestPrices`, `getCardDetail`), `lib/portfolio.ts`, `lib/watchlist.ts`, and
`lib/sets.ts`. `getCardGradeHistories` still reads every tier — that one is meant
to. Also pinned the portfolio/watchlist history queries to `variant = 'NORMAL'`
so they match the summary tiles instead of quietly mixing in reverse-holo.

**Verified.** Those five cards now resolve to their ungraded price; Umbreon
VMAX's series is 0/67 graded; live user totals unchanged; `getLatestPrices` over
a 30-card page still runs in 2 ms. Guarded by `PRICE-05` in `npm run audit:data`.

---

## S1 — An orphaned session locks you out of your own account, permanently

**The bug.** The proxy trusts the session JWT alone, while every page-level
lookup checks the database. When a cookie decrypts but names a user this
database doesn't have, the two disagree and the app deadlocks:

- `/` renders "Log in / Sign up" — you look signed out.
- Clicking either one 307s to `/collection` — because the proxy thinks you're
  signed in.
- `/collection` renders an empty, signed-in dashboard.
- There is no logout button, because `AuthNav` also thinks you're signed out.

The only escape is manually clearing a cookie you can't see (it's `httpOnly`).
**I hit this on prod in a real browser during this run** — that browser could not
reach the login page at all.

It is reachable by deleting an account, restoring or switching a database, or by
signing into one environment and then visiting the other: `localhost:3000` and
`localhost:3001` share a single cookie jar, so UAT and prod overwrite each
other's session cookie.

**Fix.** `verifySession` now confirms the account exists and, when it doesn't,
redirects to a new `GET /api/auth/reset` handler that clears the cookie and
sends you to `/login`. (Clearing a cookie is a mutation, which a Server
Component can't do mid-render — hence the route handler.)

**Verified.** `/collection` with a ghost session → `/api/auth/reset` →
`set-cookie: session=; Expires=1970` → `/login` renders normally.

---

## S2 — `/watchlist` showed signed-out visitors a blank page

`/watchlist` was not in the proxy's `protectedRoutes`, so it rendered far enough
to flush the page shell before `verifySession()` fired. Once streaming has
started, `redirect()` can only reach the browser as
`<meta http-equiv="refresh" content="1;url=/login">` — a full second of blank
white page before the login form appears.

**Fix.** Added `/watchlist` to `protectedRoutes`, so it 307s immediately like
`/collection`. The one-time dashboard-landing cookie is now keyed to
`/collection` alone, so visiting the watchlist doesn't consume the redirect.

---

## S2 — A bad card, set, or product id rendered nothing at all

`notFound()` was called correctly, but with no `app/not-found.tsx` the fallback
was an empty document inside our own `<body>` — a header and blank space.

**Fix.** Added `app/not-found.tsx` in the app's own design language, with links
back to the catalog. Confirmed rendering in a real browser.

Note: the HTTP status stays **200** rather than 404 for these, and that is not
fixable without giving up streaming — Next has already flushed the response head
by the time `notFound()` runs. Cosmetic for users; it does mean search engines
won't see a 404 for dead card URLs.

---

## Reported, not fixed — these need your call

### 1. TCGplayer and Cardmarket prices are 20 days stale

`scripts/daily-price-sync.ps1` only runs the two PriceCharting ingests. Newest
capture by source, as of this run:

| Source | Newest | Age |
|---|---|---|
| PriceCharting | 2026-07-31 | 1 day |
| TCGplayer | 2026-07-12 | 20 days |
| Cardmarket | 2026-07-12 | 20 days |

PriceCharting is preferred, so most cards are fine — but any card priced only by
TCGplayer or Cardmarket is showing a three-week-old number with no indication of
that. The footer's claim that prices are "captured daily" is true only of
PriceCharting. Either add those ingests to the daily job or surface a staleness
badge (already on your backlog as "price stale warnings").

### 2. A stray dev server has been running against the production database

`npm run dev` from the **prod checkout** has been up since 2026-07-30 23:50,
serving on port 3002 (it fell back from 3000, which the real service holds) and
connected to the prod database with its own connection pool. Harmless today,
but it's a live process that can write to prod. Worth killing unless it's
deliberate:

```bash
npx kill-port 3002
```

### 3. `npm run lint` has been failing on `master`

Seven pre-existing errors, none introduced by this work, so `OPS-04` in the plan
cannot currently pass:

- `app/collection/page.tsx:64` — `Math.random()` called during render to pick the
  featured watchlist card. React's purity rule; it can produce a different card
  on re-render than the one that was rendered.
- `components/useAnimatedDomain.ts:45,56` — ref written during render, and
  `setState` called synchronously in an effect.
- `components/GradePriceChart.tsx:131`, `lib/pricecharting.ts:216` — `prefer-const`.

I left these alone: they're outside this task's scope and the `Math.random` one
is a deliberate-looking feature ("Random on load"), so the right fix is a
judgment call about that feature, not a mechanical lint change.

### 4. Smaller interaction gaps (found by review — see caveat below)

- **Quick-add popup doesn't close on Escape** (`QuickAddToCollectionButton.tsx`).
  Only an outside click or Cancel dismisses it. It also has no `role="dialog"`
  and no focus trap, and its position uses a hardcoded 300px height estimate that
  will overflow the viewport if the real popup is taller.
- **"Confirm sale" silently does nothing** when the price field is empty or
  invalid (`SellOrDeleteButton.tsx:45` returns with no message).
- **Cost basis is overstated** when a card is first added with no cost and later
  re-added with one: `mergeCost` treats the new price as the basis for the whole
  stack. Add 1 free + 1 at $100 → quantity 2 at $100/unit, implying $200 spent.
  The reverse case is handled deliberately; this direction looks unintended.
- **"Delete" only removes one unit per click**, so clearing a quantity of 50
  takes 50 clicks, and deleting the last one is immediate with no confirmation.

---

## What passed

- **Data integrity** — all hard checks clean: no orphaned rows, no
  both/neither-target collection or watchlist rows, no duplicate
  `(user, card, condition)` rows, no case-duplicate emails, no negative
  quantities or costs, no duplicate price snapshots, no non-positive prices.
- **Prices** — tile price matches detail price matches chart endpoint; source
  cascade (PriceCharting → TCGplayer → Cardmarket) correct; the $200k outliers
  in the data are all `HIGH`/`MID`/`LOW` rows that never reach the UI.
- **Portfolio and P&L math** — hand-recomputed for all three users with data.
  Totals, condition multipliers (NM 1.0 → DMG 0.3), per-item unrealized, and the
  "don't backdate value you didn't own" rule all check out. The >5× jumps in the
  value charts are items being added, not price errors.
- **Images** — every image host in the database is covered by
  `next.config.ts`; 46 sampled images across all four hosts returned real bytes;
  the optimizer serves ~180 ms cold and ~15 ms warm, and correctly rejects
  unlisted hosts with a 400.
- **Search** — quotes, `%`, `_`, backslash, SQL injection attempts, emoji,
  Japanese, accents, and a 500-character query all handled; the XSS payload is
  escaped in the "no results" message.
- **Pagination** — `page=0`, `-5`, `abc`, and `999999` all clamp or empty-state
  cleanly on all three paginated views.
- **Sessions** — tampered and expired cookies are correctly treated as signed
  out; auth routes redirect properly for a genuinely signed-in user.
- **Performance** — every page under 330 ms, including a 628-card set detail.

## Known data gaps (not defects)

| Finding | Count | Effect |
|---|---|---|
| Cards with no image | 1,658 of 44,082 (3.8%) | "No image" placeholder. Worst sets are Japanese VS (130/142) and Japanese Challenge from the Darkness (73/73) |
| Sets with no logo | 508 of 681 | Text code badge fallback |
| Sets with no `totalCards` | 508 of 681 | Card numbers show bare (`185`) instead of `185/294` |
| Sets holding more cards than `totalCards` | 24 | Set progress can exceed 100% |
| Cards with no price at all | 104 | "No price yet" |
| Upstream image 404s | McDonald's promos, a few PriceCharting | Logged on the server, placeholder shown |

---

## Deploying the fixes

Both commits are on `origin/master` and `origin/uat`, and both checkouts are
built. The service restarts need an **elevated** PowerShell (nssm returns
`Access is denied` otherwise), so they're yours to run:

```powershell
nssm restart PokemonTCGApp-UAT
```

Verify UAT, then:

```powershell
nssm restart PokemonTCGApp
```

Then re-run both suites against each environment:

```bash
npm run audit:data
```

```bash
npm run audit:http
```

I verified the built artifact by running it on a scratch port (3007) against the
UAT database: **all HTTP checks pass, all data checks pass.** No migration is
needed — nothing in this change touches the schema.

## Caveat on coverage

The browser pane available in this session never composited a frame, so every
element measured 0×0 and coordinate clicks landed at (0,0). That makes
**click-driven verification unreliable**, and I did not fake it. Specifically
untested by interaction, and left as manual checks in the plan:

- Quick-add popup: opening, positioning, edge-of-grid clipping, submit
- Heart toggle: optimistic update, double-click, persistence
- Sell dialog: partial quantity, "Market" button, confirm
- Chart zoom/drag, range toggles, custom date range
- Dark mode, responsive breakpoints, keyboard navigation

Everything those flows *write* was verified server-side instead: the collection
merge and weighted-average cost logic, sell/profit arithmetic, and the resulting
portfolio and P&L figures were all recomputed against the live database and
matched. The gap is in the UI layer, not the money.
