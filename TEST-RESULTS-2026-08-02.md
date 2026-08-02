# Test run — 2026-08-02 — UAT

Verification pass of [TEST-PLAN.md](TEST-PLAN.md) against UAT
(`http://localhost:3001`, service `PokemonTCGApp-UAT`, database
`pokemon_tcg_uat`) at commit `af9186d`, covering the sealed-catalog rebuild
onto TCGplayer data.

**Method:** `npm run audit:data` (30 assertions over 3,840 sealed products and
6.4M price snapshots) and `AUDIT_BASE=http://localhost:3001 npm run audit:http`
(76 assertions sweeping every route in five auth states), both run from the UAT
checkout so the database and the HTTP target are the same environment. Visual
and interaction cases were checked in a live browser against UAT.

**Result: 0 failures across 106 automated assertions.** Two apparent anomalies
during the browser pass turned out to be artifacts of the test harness, not
defects — see [Investigated and cleared](#investigated-and-cleared).

---

## What the run covers

The sealed catalog was rebuilt this round: TCGplayer (via the keyless
tcgcsv.com mirror) is now the catalog spine, with PriceCharting supplying price
history and the products TCGplayer doesn't list. New cases **SEAL-20…36** were
added to the plan for that work and are now automated rather than manual.

| Area | Cases | Result |
|---|---|---|
| Sealed catalog size & sources | SEAL-20, 23, 25, 28 | PASS |
| Product identity & dedup | SEAL-21, 22, 24, 35 | PASS |
| Type taxonomy | SEAL-25, 26, 29 | PASS |
| Filters & pagination | SEAL-27, 28, 03 | PASS |
| Price resolution | SEAL-30, 31, 32, 33 | PASS |
| Images | SEAL-34, IMG-02/03/04/06 | PASS |
| Idempotency | SEAL-35, 36 | PASS |
| Everything else in the plan | AUTH, CAT, CARD, SETD, SEC, UI, PORT | PASS |

---

## Sealed catalog after the rebuild

| Metric | Before (2026-07-31) | Now |
|---|---|---|
| Sealed products | 997 | **3,840** |
| With a working image | — | 92.3% |
| Japanese | ~0 tracked separately | 307 |
| Costco products | 0 | 17 |
| Sam's Club products | 0 | 9 |
| Display cases (distinct from their contents) | 0 | 374 |
| Products whose name disagrees with their `pricechartingId` | 262 | **0** |
| Single cards mis-filed as sealed | 11 | **0** |

The four issues raised against the old catalog all verify clean on UAT:

- **`151 Elite Trainer Box`** — correct image, $609.42, and the Pokémon Center
  ETB is a separate row rather than overwriting it.
- **`Ascended Heroes`** — 32 tin/collection variants listed individually
  ($29–$70), with `Mini Tin Display` correctly typed `DISPLAY_CASE` (~$326)
  instead of reading as a plain tin.
- **`151`** — 27 tin/collection variants, consistent with Ascended Heroes
  (was 3, because the set's product was split across two `CardSet` rows).
- **`151 Mew ex [Jumbo] #205`** — gone; jumbo singles are rejected at ingest and
  asserted absent by PRICE-13.
- **`151 Sam's Club 4-Pack Mini Tin`** — present with an image, alongside 8 more
  Sam's Club exclusives.

---

## Investigated and cleared

Two things looked wrong during the browser pass and were chased down before
signing off. Both are harness artifacts; no app change was needed.

**Tiles appearing to have no name or type badge.** Fetching a page and parsing
it with `DOMParser` leaves React's streaming boundaries (`<template id="P:2">`)
unresolved, because the deferred content arrives later in the stream and is
relocated by client script that `DOMParser` never runs. Re-checked against the
live DOM: 0 of 9 tiles missing a badge, 0 missing a name.

**`audit:http` reporting sealed detail pages with no price.** The script picks
target ids from the database and then requests them over HTTP; it had been run
from the prod checkout (dev database) while pointed at UAT, so it was asking
UAT for ids that only exist in dev. The script now proves the database and
`AUDIT_BASE` are the same environment before the sweep and fails with one clear
`[ENV]` message instead of a wall of misleading detail-page failures.

---

## Known gaps (not defects)

- **603 sealed products show "No price yet."** These are unreleased presale
  boxes; TCGplayer lists them months ahead of release with no market price.
  Where a preorder MID/LOW price exists it is shown instead of hiding the
  product. PRICE-12b asserts that *released* product always resolves a price.
- **295 sealed products have no image.** TCGplayer reports `imageCount: 0` for
  them (its CDN 403s the URL at every size) and they have no PriceCharting page
  to scrape instead. These render the type-label placeholder, which is intended.
  IMG-06 fails above 400 to catch a systemic loss.
- **132 card-less sets hold sealed product.** These are genuine TCGplayer-only
  groupings with no card-set equivalent — "Miscellaneous Cards & Products" (633
  products), "World Championship Decks", "30th Celebration". Not duplicates; the
  26 that *were* duplicates have been merged.
- **CARDMARKET price data is 21 days stale** (WARN, pre-existing). Unrelated to
  this round — Cardmarket is not a sealed source and no card price depends on it
  alone.
- **Chinese and Korean sealed product is excluded** by choice; PriceCharting is
  the only source for it and it is thinly traded.

---

## Coverage caveat

Click-driven interactions (watchlist heart, add-to-collection popup, chart
zoom/drag) were exercised only as far as their server routes and rendered
markup. The browser pane does not composite frames in this environment, so
screenshots time out and every element measures 0×0 — the same limitation noted
in the 2026-07-31 run. Filters, badges, prices and image URLs were verified
through the live DOM and direct HTTP, which does cover the sealed work in this
round; genuine pointer-interaction testing still needs a human or a headed
browser.
