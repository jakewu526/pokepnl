# Mobile batch — implementation plan

**Status:** planned, not started. **Target:** phones only (`< md`, 768px). Desktop must
look and behave exactly as it does today unless a step says otherwise.

`md` is the mobile/desktop line for this whole batch, matching `MobileTabBar`'s existing
`md:hidden`. Do not introduce a second breakpoint convention.

## Decisions already made (do not re-litigate)

| Question | Answer |
|---|---|
| Mobile top bar | Brand/back link on the left + avatar circle on the right. Page controls (search, toggles, filters) stay. |
| Portfolio tile price | **Per-unit market price** — same meaning as the Cards section. |
| More Info popup | **Read-only.** No Sell/Delete inside it. |
| Sell/Delete on mobile | Move to the item page, which means **building** a holding block there (step 7). |
| Dashboard one-screen | Hero is **removed on mobile**. Four numbers + value chart + allocation chart fit one screen. Timeline drops below the fold. |
| Zoom lock | Fix the overflow. **No `user-scalable=no`** — pinch-zoom-in stays. |

---

## Step 1 — Lock the mobile viewport

**The bug:** there is no `viewport` export anywhere in the app, and `AuthNav` renders six
text links + the user's name + "Log out" in a non-wrapping flex row. At 375px that row is
~600px wide, so `document.scrollWidth > clientWidth` on every signed-in page. A phone
browser lets you pinch *below* 1.0 exactly when the document is wider than the viewport —
that is the de-centering in the screenshots. Step 2 removes the cause; this step adds the
declaration and a guard.

**`app/layout.tsx`**

- Add `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }`.
  Import `type { Viewport }` from `next`. (Next 16 — see
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`.)
  `viewportFit: "cover"` is required for the `env(safe-area-inset-bottom)` the tab bar
  already uses to resolve to a non-zero value.
- Body padding is currently `pb-24`, which is 96px against an 80px tab bar plus up to 34px
  of home-indicator inset. Change to `pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0`.

**`app/globals.css`**

- Add `html, body { overflow-x: clip; }`.
  **`clip`, not `hidden`** — `overflow-x: hidden` on `html`/`body` turns it into a scroll
  container, which silently breaks every `position: sticky` header in the app and the
  dashboard's `lg:snap-y` container. `clip` creates no scroll container.
- This is a net, not the fix. Anything still overflowing gets found by the check below.

**Do NOT add** `maximum-scale=1` or `user-scalable=no`. Once `scrollWidth === clientWidth`
the browser will not zoom below 1.0 on its own — which is exactly the requested behavior —
and zoom-in stays available.

**Acceptance:** at 375×812 (`resize_window` preset `mobile`), on `/`, `/sealed`,
`/dashboard`, `/portfolio`, `/transactions`, `/watchlist`, `/settings`, `/cards/[id]`,
`/sealed/[id]`:

```js
[document.documentElement.scrollWidth, document.documentElement.clientWidth]
```

must return two equal numbers. If they differ, find the offender with:

```js
[...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map((e) => e.className)
```

Known-safe exception: the Portfolio table view's `min-w-[880px]` table sits inside an
`overflow-x-auto` wrapper, so it is contained — leave it alone.

---

## Step 2 — Avatar replaces the nav on mobile

**New `components/UserMenuButton.tsx`** (server component, reads `getCurrentUser()`):

- Signed in → a `<Link href="/settings">` rendering a 36px circle:
  `size-9 rounded-full bg-emerald text-paper-raised flex items-center justify-center`,
  containing a placeholder person-silhouette SVG (head circle + shoulders arc,
  `stroke="currentColor"`). Give it `aria-label="Account settings"`. This is the
  placeholder pfp — swappable for a real uploaded avatar later without touching callers.
- Signed out → the existing compact "Log in / Sign up" pair, so signed-out phones still
  have a way in.

**`components/AuthNav.tsx`** — this is the *only* file that changes for the header. All
nine pages import `AuthNav`, so they all inherit the fix. Do not edit the page headers
individually.

- Signed-in branch returns a fragment:
  - the existing link row, wrapped in `hidden md:flex` (Dashboard / My Portfolio / My
    Transactions / Watchlist / Settings / name / Log out — unchanged on desktop);
  - `<div className="md:hidden"><UserMenuButton /></div>`.
- Signed-out branch: unchanged, it already fits at 375px.

**Left side stays** (brand or back link), per the decision above — no page edits needed.

**Header height:** on the dashboard header only, change `py-4` → `py-2.5 sm:py-4` to buy
back vertical space for step 4. Leave the other pages' `py-5` alone.

**Acceptance:** at 375px no page shows any of the six nav words; a green circle sits at the
top right; tapping it lands on `/settings`. At 768px+ the header is pixel-identical to
today.

---

## Step 3 — Log out moves into Settings

**`app/settings/page.tsx`** — append a final `<section>` after "Preferences":

```
Account
  {user.name} · {user.email}
  [ Log out ]   <- <form action={logout}> with a full-width outlined button
```

Import `logout` from `@/app/actions/auth`, and get the user via `getCurrentUser()`
(`verifySession()` is already called on this page). Show it at **all** widths — harmless on
desktop, and it is the only logout path on mobile. Button styling:
`w-full rounded-card border border-line px-4 py-3 font-body text-sm font-medium text-ink-muted hover:text-ink sm:w-auto`.

**Acceptance:** `/settings` on a phone ends with an Account block; tapping Log out returns
you to a signed-out state.

---

## Step 4 — Dashboard fits one mobile screen

### 4a. Hide the hero on mobile

`app/dashboard/page.tsx`: the `<section>` wrapping `<CollectionHero>` becomes
`className="hidden md:block lg:min-h-full lg:snap-start"`. Nothing else about the hero
changes; it is untouched on desktop.

### 4b. Shrink `components/StatTile.tsx`

Every change is a mobile-first base with an `sm:` restoration, so desktop is unaffected:

| Element | Today | Change to |
|---|---|---|
| card padding | `px-4 py-4` | `px-3 py-2.5 sm:px-4 sm:py-4` |
| label | `text-sm` | `text-xs sm:text-sm` |
| value | `text-3xl` | `text-xl sm:text-3xl` |
| delta line | `text-xs` | `text-[10px] sm:text-xs` |
| `deltaLabel` ("this week") | always shown | wrap in `<span className="hidden sm:inline">` |

That last one matters: at half-width the delta line wraps to two rows, which is most of why
image 3's tiles are so tall.

### 4c. `components/DashboardOverview.tsx` — the fitted mobile block

- Stat grid: `grid-cols-1` → **`grid-cols-2`** at base (`sm:grid-cols-2 lg:grid-cols-4`
  stay). Four numbers as a 2×2 on a phone.
- Root container: on mobile becomes a fixed-height flex column, so the charts flex into
  whatever is left rather than stacking past the fold:
  `flex h-[calc(100dvh-11rem)] flex-col gap-2 px-3 py-3 md:h-auto md:min-h-full md:gap-4 md:px-4 md:py-6`
  (11rem ≈ header 2.9rem + tab bar 5rem + safe area + slack). Stat grid gets `shrink-0`;
  the two chart cards get `min-h-0 flex-1`.
- Timeline: wrap `<CollectionTimeline>` in `<div className="hidden md:block">`. Then in
  `app/dashboard/page.tsx`, render a second `<CollectionTimeline timeline={timeline} />`
  inside the normal-flow section (above `<TopMovers>`), wrapped in
  `<div className="md:hidden">`. Two complementary-visibility mounts beats plumbing a new
  prop through.

### 4d. `components/ValueBars.tsx` — mobile chrome + shorter canvas

- Add a `compact?: boolean` prop, passed `true` from `DashboardOverview` (this component is
  only used on the dashboard).
- When compact: `HEIGHT` 320 → **260**, `PAD_LEFT` 52 → **38**, and draw at most **3**
  x-axis tick labels. At 375px wide the `viewBox` then scales to ~135px tall.
- Card chrome on mobile: `p-4` → `p-3 sm:p-5`; title `text-xl` → `text-base sm:text-xl`;
  hide the "Every point is a real day…" description below `sm`; range-toggle pills stay but
  shrink to `text-[11px]`.

### 4e. `components/AllocationDonut.tsx` — responsive size, side-by-side legend

- The `<svg>` currently hard-codes `width={SIZE} height={SIZE}` (240px) and the legend
  stacks *below* it on mobile — together ~340px tall, the single biggest space hog.
- Drop the `width`/`height` attributes (keep `viewBox`), give the svg
  `className="h-full w-full"`, and put it in a box sized `size-[120px] sm:size-[240px]`.
- Change the wrapper from `flex-col … sm:flex-row` to **`flex-row`** at all widths with
  `gap-3 sm:gap-8`, so the legend sits beside the rings.
- Centre readout `text-2xl` → `text-base sm:text-2xl`; centre caption `max-w-[110px]` →
  `max-w-[70px] sm:max-w-[110px]`.
- Card chrome: `p-3 sm:p-5`, title `text-base sm:text-xl`.

**Budget to hit (375×812, Safari with URL bar):** ~550px of content height.
2×2 numbers ≈ 124 · gap 8 · value chart card ≈ 183 · gap 8 · donut card ≈ 166 = **489px**.
Verify against the real thing and tune — these are the target, not gospel.

**Acceptance:** at 375×812, `/dashboard` opens directly on the numbers (no hero), and all
four figures plus both charts are visible without scrolling. Scrolling down reveals the
timeline, then Top Movers / Just added / Recent Transactions as today. At 1440px the
dashboard is unchanged.

---

## Step 5 — Double-tap a chart to enlarge it

**New `components/ChartZoom.tsx`** (client), used as a render prop so the chart can draw
denser when small and looser when enlarged:

```tsx
<ChartZoom title="Value over time">
  {(zoomed) => <ValueBars ... compact={!zoomed} />}
</ChartZoom>
```

Implementation notes that matter:

- **Detect the double-tap manually.** Do not rely on `onDoubleClick` — `dblclick` is
  unreliable on mobile Safari. Track the previous `pointerup` timestamp and coordinates;
  fire when two taps land within **300ms and 30px** of each other. Ignore the pair if the
  pointer moved more than ~10px between down and up (that was a scroll, not a tap).
- Put `style={{ touchAction: "manipulation" }}` on the wrapper. Without it iOS fires its own
  double-tap-to-zoom and fights the gesture — and that zoom is exactly what step 1 exists to
  prevent.
- The inner charts already own `onPointerEnter` / `onPointerLeave` / `onPointerMove` for
  their tooltips. Listen on the wrapper without `preventDefault()` so those keep working.
- **Mobile only.** Gate on `window.matchMedia("(max-width: 767px)").matches`, evaluated in
  an effect — not during render, which would break hydration. A double-click opening a
  fullscreen overlay on desktop is surprising, and desktop has the room already.
- Enlarged view: `fixed inset-0 z-50 flex flex-col bg-paper p-3`, chart rendered at full
  width, **X button `absolute right-3 top-3`** (`size-9 rounded-full border border-line`,
  `aria-label="Close"`). Escape closes it, and body scroll is locked while it is open.
- Chart state (hover, selected range) resets when the chart moves into the overlay. That is
  fine and expected.

**Apply to:** `ValueBars` and `AllocationDonut` in `DashboardOverview`, and the mobile
`CollectionTimeline` mount from step 4c.

**Acceptance:** on a phone, double-tapping a chart opens it full-screen with an X at top
right; the X and Escape both close it; the page itself never zooms during any of it.

---

## Step 6 — Portfolio tile slims down + More Info popup

### 6a. Extract the shared dialog shell

`DialogShell` is currently module-scoped and unexported inside
`components/SellOrDeleteButton.tsx`, and `PositionActivityModal` carries a near-copy. Move
it to **`components/DialogShell.tsx`** and have all three use it. While moving it, change
its close affordance from the "Close" text pill to an **X button at top right** — that is
what this batch asks for, and one shell keeps every modal consistent.

### 6b. New `components/ItemInfoModal.tsx` (client)

Read-only. Props: `name, imageUrl, subtitle, quantity, cost, marketPrice, marketValue,
unrealized, unrealizedPct, href`. Body is a two-column definition list:

```
Quantity          8
Cost per unit     $65.00
Total cost        $520.00
Market price      $66.82
Total value       $534.56
Unrealized        +$14.56 (+2.8%)
```

Reuse the existing `priceFormatter` / `signedPrice` / `signedPercent` helpers. Footer is a
single link, **"View card page →"**, pointing at `href` — that is where Sell and Delete now
live. No Sell or Delete buttons in this modal.

### 6c. `components/PortfolioItemTile.tsx`

Becomes responsive rather than forked. Below `md` the body is:

```
Pitch Black Elite Trainer Box     <- name, unchanged
Pitch Black                       <- subtitle, unchanged
$66.82                            <- font-data text-lg font-medium text-emerald-strong
More Info                         <- green text
```

- `$66.82` is the **per-unit market price** (`marketPrice`, not `marketValue`), styled
  identically to `CardTile`'s price line so a tile reads the same everywhere in the app.
- "More Info" is a `<button>` with no button chrome:
  `font-body text-[13px] font-medium text-emerald-strong` — plain green text that opens
  `ItemInfoModal`.
- Wrap the existing Qty / Cost / Value / Unrealized lines **and** the `<SellOrDeleteButton>`
  in `hidden md:block` (or `md:flex` as appropriate) so desktop keeps exactly what it has
  today. Add the price + More Info pair as `md:hidden`.
- The tile is shared with the dashboard's "Just added" carousel, so that gets the same
  treatment for free — which is correct.

**Open item, not in this batch:** desktop's tile keeps Sell/Delete while mobile's does not.
Once step 7 lands, consider removing them from the desktop tile too for consistency — ask
Jake before doing it.

**Acceptance:** on a phone, a portfolio tile shows image, name, subtitle, one price, and
green "More Info" text — nothing else. The popup shows the six figures and closes via X,
Escape, or backdrop tap. At 1024px the tile is unchanged from today.

---

## Step 7 — "In your binder" on card & sealed product pages

This is the largest piece. `app/cards/[id]/page.tsx` and `app/sealed/[id]/page.tsx`
currently have **no** holding UI at all — they never tell you that you own the thing. Step 6
removes Sell/Delete from the mobile tile, so this has to exist before that ships.

### 7a. Lift the duplicated price math into `lib/portfolio.ts`

`marketPriceFor` is copy-pasted in `app/dashboard/page.tsx:101` and
`app/portfolio/page.tsx:77`. Export one version from `lib/portfolio.ts` and have both pages
plus the new panel call it. A third copy of money math is not acceptable.

```ts
export function marketPriceFor(
  item: { cardId: string | null; sealedProductId: string | null; condition: string | null },
  cardPrices: Map<string, { price: number }>,
  sealedPrices: Map<string, { price: number }>,
): number | null
```

### 7b. Holdings query

Add to `lib/portfolio.ts`:

```ts
export async function getHoldingsForCard(userId: string, cardId: string): Promise<Holding[]>
export async function getHoldingsForSealedProduct(userId: string, sealedProductId: string): Promise<Holding[]>
```

A card can have **several** positions — `CollectionItem` is uniquely keyed on
`(userId, cardId, condition)`, so there is one row per condition. The panel must render all
of them, not just the first. Each `Holding` carries `id, condition, quantity, cost,
marketPrice, marketValue, unrealized, unrealizedPct`, computed via 7a's shared helper with
`CONDITION_MULTIPLIERS`, `getLatestPrices`, and `getLatestSealedPrices`.

### 7c. New `components/HoldingPanel.tsx` (server)

- Renders `null` when signed out or when the user owns none — the page must not gain an
  empty box for the 99% case.
- Heading "In your binder". One row per position:
  `Near Mint · Qty 1 · Cost $4.49 · Market $4.39 · Value $4.39 · −$0.10 (−2.2%)`
  followed by that row's own `<SellOrDeleteButton collectionItemId={holding.id} … />`.
- Stack to a card layout below `sm`, a table-ish row above it.

### 7d. Mount it

In both `app/cards/[id]/page.tsx` and `app/sealed/[id]/page.tsx`, insert `<HoldingPanel>`
directly **below the price block and the Add-to-collection button**, above the price history
charts.

**Acceptance:** own a card in two conditions → the card page lists both positions with
correct per-condition prices, and each has a working Sell and Delete. Own none → nothing
renders. Sell from here and the Portfolio page reflects it.

---

## Order of work

1 → 2 → 3 (viewport + header + logout; these unblock everything and are independently
shippable) → 7 (holdings must exist before step 6 removes the mobile Sell/Delete) → 6 → 4 →
5.

Steps 4 and 5 are the most iterative, so do them last — the layout then settles against a
header whose height is already final.

## Before calling it done

- Add cases to `TEST-PLAN.md` in the same change, per the project's living-regression rule.
  At minimum: mobile viewport lock (the `scrollWidth === clientWidth` check as a named
  case), avatar → settings → logout, dashboard one-screen fit, chart double-tap
  enlarge/close, portfolio tile + More Info popup, item-page holding panel with multiple
  conditions.
- Verify at **375×812 and 1440×900** for every step — the whole batch is conditional
  styling, and the desktop regression risk is real.
- Ship to **UAT before prod**, per the standing rule.
