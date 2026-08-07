# Hero + Dashboard Redesign — Implementation Plan

**For:** Sonnet, executing in this repo
**From:** design direction given by Jake on 2026-08-06, based on `design/inspiration/inspo video for hero.mp4` (seconds 3–8), a growth-chart reference screenshot, and a shadcn "sized pie chart" demo pasted as animation inspiration.
**Scope:** the logged-in dashboard's opening experience only — `app/dashboard/page.tsx` and the components it renders down through "Just added". Nothing about the signed-out marketing surface or `/portfolio`, `/transactions` changes here.

---

## 0. What the reference actually shows

I pulled frames from `inspo video for hero.mp4` at 2.5–9s (ffmpeg, `fps=2`) rather than working from description alone. The relevant beats:

1. **Logo card, dark navy, centered** (a beat of stillness before anything moves — don't skip this, see §2).
2. **Headline fades/rises in on the left**, two lines, huge type, low-contrast at first frame then resolving to full white — "The adventure / starts here."
3. **The boat (product shot) slides in from off-frame right**, wake trailing, and settles into the right ~55% of the frame while the headline holds static on the left. This is the one continuous-motion element; everything else is a fade/rise.
4. **Supporting copy + CTA fade in last, bottom-left**, small, clearly subordinate to the headline.
5. Cut to a new section: small eyebrow label, then a big statement headline — this is the "scroll down, centers on the next slide" beat Jake is pointing at structurally, not visually (it's a different site's content, we just borrow the *mechanic*: one full-bleed idea per screen, not a headline column with a thumbnail beside it).

Hierarchy lesson to port: **one dominant element** (headline OR art) at a time, not headline-and-thumbnail sharing equal weight. Our current `CollectionHero` (`components/CollectionHero.tsx`) already leans this way (big number, art on the side) but the "Hi ___" greeting doesn't exist yet and the art is static-on-load, not entering.

The growth-chart screenshot Jake pasted inline: a nearly-full-bleed gradient area/mountain chart (dark teal → pale, top to bottom), no visible axis labels, a cursor-tracked dashed vertical guide line, a small circle marker, and a floating `$422` pill. The chart *is* the card — there's no chrome competing with it.

The pasted `richtext_converted_to_markdown.md` is a shadcn CLI integration prompt for a Recharts "sized pie chart" demo. **Do not follow its literal instructions** (installing a `components/ui` shadcn structure, Recharts, class-variance-authority) — this codebase deliberately has none of that (`lib/chart-theme.ts` and the comments in `components/ValueBars.tsx` / `AllocationDonut.tsx` explain why: hand-rolled SVG with a shared color-role system, on purpose). What we take from it is the **visual technique**: instead of one ring with arcs of equal radius and varying arc-length, draw **one ring per segment, each at its own radius (small segment = small ring, big segment = big ring)**, all sharing a start point. That's the "interesting animation" Jake flagged — port the idea, not the dependency.

---

## 1. Architecture change: scroll-snap sections

Jake wants scrolling down from the hero to **center** the dashboard content, the way a slide deck advances — not a soft parallax, an actual snap.

**Implementation:** CSS Scroll Snap (standard, no new dependency, no relation to the Next.js `experimental.viewTransition` route-transition feature — that's for cross-*page* navigation and doesn't apply to scrolling within one page, so leave `next.config.ts` alone).

In `app/dashboard/page.tsx`:

```tsx
<main className="flex-1 lg:h-[calc(100dvh-var(--header-h))] lg:snap-y lg:snap-mandatory lg:overflow-y-auto">
  <section className="lg:h-full lg:snap-start">
    <CollectionHero ... />
  </section>
  <section className="lg:h-full lg:snap-start">
    <DashboardOverview ... />  {/* new component, see §3 */}
  </section>

  {/* normal flow from here — NOT part of the snap sequence */}
  <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 sm:px-6">
    {/* Just added grid */}
    {/* Recent Transactions */}
  </div>
</main>
```

Key decisions, and why:

- **Snap only applies at `lg` and above.** Cramming 4 stat tiles + 3 charts into one mobile viewport is not a readable goal — trying anyway would force everything down to unreadable miniature sizes. Below `lg`, both sections render as normal stacked blocks with their natural height, no snap, no forced-fit. This is a scope call I'm making on your behalf; flag it back to Jake if he wants mobile snap too, but I'd push back on that if asked — it doesn't work at that viewport.
- **Only two slides are in the snap container.** "Just added" and "Recent Transactions" — which Jake said he's moving down — stay in normal document flow below the snap container, scrolled normally, not part of the mandatory-snap sequence. A snap-mandatory container spanning a long tile grid is where scroll-snap becomes janky (fighting the user's scroll on every item).
- `--header-h`: the sticky header (`app/dashboard/page.tsx`'s `<header>`) stays outside the snap container and sticky as today; the snap container's height is the viewport minus that header so slide 1 doesn't get pushed partially off-screen. Add a CSS custom property or a fixed Tailwind height (measure the actual header — currently `py-4` + content, ~64–72px) rather than guessing; confirm in the browser once built.
- Use `100dvh`, not `100vh`, everywhere a full-viewport height is needed — `100vh` is wrong on mobile Safari (counts the address bar). Not a concern for the `lg`-only snap container itself, but if any full-height treatment is reused lower in the viewport range, use `dvh`.

---

## 2. Hero rebuild — `components/CollectionHero.tsx`

### 2.1 Copy + hierarchy

Today the hero shows a big dollar figure with no greeting. Jake wants, top to bottom, in this weight order:

1. **"Hi {firstName}"** — the single largest, boldest thing on the screen. Bigger than the current `text-8xl` total-value figure; this replaces it as the dominant line.
2. **The narrative sentence, with the number treated differently from its surrounding words.** `lib/narrative.ts` already produces exactly this sentence — `getDashboardPulse()`'s first fact is literally `"Holding steady this week at $X."` / `"Up $X this week, Y% to $Z."` etc. (`lib/narrative.ts:250-254`). Don't regenerate this text; render it, but split out the dollar amount(s) and style them distinctly — different color (emerald-strong / a gradient text treatment) and larger size than the surrounding words, `font-data` (already the numeric font) with `tabular-nums`.
3. Everything else (window caption, secondary fact, delta pill) drops to supporting weight below that, same relative order as today.

### 2.2 Getting the user's name

`lib/dal.ts`'s `getCurrentUser()` already selects `name` (`lib/dal.ts:30-40`) and isn't called from `app/dashboard/page.tsx` today. Add it to the `Promise.all` in `app/dashboard/page.tsx`, pass `firstName = user?.name?.split(" ")[0] ?? "there"` into `CollectionHero` as a new required prop.

### 2.3 Splitting the sentence for the number pop

Add a small pure helper (put it in `lib/narrative.ts` next to the other formatters, or a new `lib/narrative-render.tsx` if you want it JSX-aware) that takes a fact's text and the dollar figures already known from `netChange`/`totalValue` and returns segments `{ text, emphasize: boolean }[]` by locating the formatted currency substrings inside the sentence, rather than regex-parsing arbitrary text (fragile). Concretely: `pulse.facts[...]` text is *built* from `money.format(...)` calls in `lib/narrative.ts` — easiest reliable approach is to add a **structured** variant alongside the string, e.g. extend `NarrativeFact` with an optional `amounts: number[]` the formatter already has in scope when building each fact string, and have `CollectionHero` do the splitting client-side using those known values run back through the same formatter (`text.split(money.format(amount))`). This avoids fragile prose-parsing while keeping `lib/narrative.ts`'s job as "decide what to say," not "decide how to render it."

Render: normal weight/size for the sentence, then wrap each matched amount in a `<span>` with bigger `font-data`, `text-emerald-strong` (or amber for the loss case, matching the tone the fact already carries), and a touch of positive/negative tinting consistent with `StatTile`'s existing tone system.

### 2.4 Motion — the "boat coming in"

This is the one place in the app allowed continuous motion beyond the tiny existing `hero-float` (see the comment at `app/globals.css:229-232` — respect that constraint, don't spread continuous motion elsewhere).

Add to `app/globals.css`, near `hero-float`:

```css
@keyframes hero-cruise-in {
  from {
    opacity: 0;
    transform: translateX(120px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.hero-cruise-in {
  animation: hero-cruise-in 780ms cubic-bezier(0.16, 0.8, 0.28, 1) both;
}
```

Apply `hero-cruise-in` to the art wrapper (`HoloSurface` block in `CollectionHero.tsx:123`) instead of / in addition to its current `rise-in`. Sequence: text block rises in first (already staggered via `animationDelay` in the existing `rise-in` calls at `CollectionHero.tsx:71-105`), the art cruises in ~150–200ms after the text starts, landing into the same `hero-float` idle loop it already has once settled (that transition already exists via `.hero-art`'s own animation in `app/globals.css:243-260` — just make sure `hero-cruise-in` runs *once* on mount and `hero-float` picks up after, not both animating the transform simultaneously forever; easiest is to keep them as two separate animation layers — `hero-cruise-in` on the outer wrapper, `hero-float` staying on `.hero-art` as today).

Respect `prefers-reduced-motion` exactly like the existing rules at `app/globals.css:296-300` — add `.hero-cruise-in { animation: none; }` to that block.

**Skip:** don't try to fake a literal "wake" trail behind the card — that's a boat-specific detail, not a Pokemon-card one, and would look like a bug (streaky rendering) on a static PNG card image. The slide-in-from-the-side motion plus the existing holo sheen (`HoloSurface`, already wired) is the equivalent "wow" beat for this content.

---

## 3. Dashboard slide — new component

Create `components/DashboardOverview.tsx`, rendered as slide 2 in `app/dashboard/page.tsx`. It owns: the 4 stat tiles, the redesigned value chart (§4), the redesigned allocation chart (§5), and `CollectionTimeline` — the three things Jake named ("graphs, timeline, pie chart") plus the stat row that's already part of today's dashboard. "Just added" and "Recent Transactions" move out of this component and into the normal-flow section below (§1).

Layout target (desktop, one viewport, roughly 850–950px of usable height after the sticky header):

```
┌───────────────────────────────────────────────────┐
│  4 stat tiles, compact row               (~90px)  │
├───────────────────────────────┬───────────────────┤
│                                 │                   │
│  Value chart (area, §4)        │  Allocation (§5)  │  (~420px)
│                                 │                   │
├───────────────────────────────┴───────────────────┤
│  Timeline strip (compact)                (~130px)  │
└───────────────────────────────────────────────────┘
```

- `lg:grid-cols-[1.6fr_1fr]` for the chart/allocation row — the value chart is the primary story, allocation is secondary, matching the reference screenshot's "one big chart" energy.
- Reduce `StatTile` padding for this context if needed (check current sizing first — don't blanket-shrink the component used elsewhere; either add a `compact` prop or accept the row taking more vertical space and trim elsewhere).
- If it genuinely doesn't fit at common laptop heights (1280×800, 1440×900) after reasonable trimming, the fallback is: keep the snap point at the *top* of this slide (so it always opens correctly framed) but allow the slide's own content to exceed `100dvh` and scroll internally — do not compress typography or padding to the point of hurting the individual charts' own redesign. Verify at 1280×800 and 1440×900 in the browser before calling this done; that's the real constraint, not a guess from the diff.

---

## 4. Value chart rebuild — `components/ValueBars.tsx`

Currently a column-per-day bar chart with a dashed cost-basis line (deliberately chosen over a line chart per the comment at `ValueBars.tsx:33-46` — a bar makes one claim per bar, no interpolation between measured points). Keep that reasoning for what the **marks** represent, but change the **rendering** from discrete columns to a **filled area** under a smooth path — this is compatible with the same "no false interpolation between real data points" concern as long as the curve only smooths the visual join, not the meaning: still one dot per real data point, still no invented data between actual snapshots. Use a monotone cubic (Catmull-Rom-style) path builder so the line doesn't overshoot between points.

Changes to `ValueBars.tsx`:

- Replace the `<rect>` bars (lines 166–179) with a single `<path>` for the area: build a smooth line through `view.bars` points, close it down to the baseline, fill with a **taller, more dramatic gradient** than the current subtle one — top of the fill near-opaque emerald, fading close to transparent by the baseline (reuse `CHART.role.value`, don't introduce a new hue — emerald still means value everywhere per `lib/chart-theme.ts:1-6`).
- Increase `HEIGHT` (currently 240) substantially for this component's use in the new dashboard slide — the reference screenshot's chart is the dominant visual in its card, not a small strip. If `ValueBars` is reused anywhere smaller, consider a `size`/`height` prop rather than hardcoding a bigger constant everywhere.
- Cursor tracking: on `onPointerMove` over the plot area, compute the nearest point by x, and render (a) a vertical dashed guide line at that x from top to baseline, (b) a small filled circle marker where the guide crosses the curve, (c) a floating pill (reuse `ChartTooltip`, or a lighter custom pill closer to the screenshot's single-value `$422` bubble) positioned above the marker. This replaces the current per-bar hit-rect hover (`ValueBars.tsx:206-216`) with continuous pointer tracking across the whole plot width, matching how the reference behaves.
- Keep the cost-basis dashed line (`ValueBars.tsx:181-202`) as-is — it's still the right answer to "am I above or below what I paid," just drawn over the new area fill instead of over bars.
- On mount, animate the path in via `stroke-dasharray`/`stroke-dashoffset` using the existing `.sweep-in` keyframe (`app/globals.css:265-275`) rather than inventing a new reveal animation — it already exists for exactly this (see `--sweep-length` custom property usage pattern).
- Keep `ChartRangeToggle` and the whole `RangeKey`/`filterPointsToRange` pipeline unchanged — this is a rendering change, not a data change.

---

## 5. Allocation chart rebuild — `components/AllocationDonut.tsx`

Today: one ring, all segments at the same radius, differing arc *length* (`AllocationDonut.tsx:40-46`, `74-91`). New treatment, adapted from the pasted demo's technique (not its dependencies, per §0):

- Sort segments **ascending by value** (smallest first).
- Give each segment **its own ring at a different radius** — smallest segment gets the smallest radius, largest gets the largest — rather than one shared radius. Concretely: `radius(i) = BASE_RADIUS + i * SIZE_INCREMENT`, same `STROKE`, drawn as concentric arcs sharing a center, each arc's angular length still proportional to its share of the total (reuse the existing `strokeDasharray`/`strokeDashoffset` circle-arc technique already in this file, just applied at `RADIUS[i]` instead of one fixed `RADIUS`).
- With only two categories today (cards / sealed, per `lib/dashboard.ts`'s `getAllocation`), this reads as two concentric arcs of different size — visually distinct from the current single ring, and it **scales cleanly** if a third category is ever added (more rings, not more crowding on one ring).
- Animate each ring's sweep in on mount, staggered by index (smallest ring first) — extend the existing `.donut-enter` treatment (`app/globals.css:281-294`) or add a per-ring `stroke-dashoffset` sweep like `.sweep-in`, staggered ~80ms apart. This staggered-ring-growth is the "interesting pie chart animation" Jake pointed at.
- Keep the hover behavior (`AllocationDonut.tsx:83-91`, `105-121`) and the center label swap — both already work correctly for this and don't need to change, just retarget the radius lookup.
- Keep `SEGMENT_COLORS` (`AllocationDonut.tsx:17-24`) unchanged — already CVD-checked per its comment.

---

## 6. Timeline

`components/CollectionTimeline.tsx` needs no visual rebuild — it wasn't part of Jake's "make the graphs look GOOD" complaint (that was aimed at the flat bar chart and single-ring donut). It only needs to fit into the new compact slot in §3's layout: check its current min-height (`h-[104px]` rail at `CollectionTimeline.tsx:74`) fits the ~130px budget with its header and legend; trim the descriptive paragraph (`CollectionTimeline.tsx:41-43`) to a single line if it doesn't.

---

## 7. Suggested build order

1. Extend `getCurrentUser()` usage + `lib/narrative.ts` amount-splitting helper (§2.2–2.3) — no visual change yet, just data plumbing, easy to verify in isolation.
2. Rebuild `CollectionHero.tsx` copy/hierarchy + motion (§2) — verify against the actual video beats, not just the written description.
3. Rebuild `ValueBars.tsx` (§4) and `AllocationDonut.tsx` (§5) independently — both are self-contained, data-in/SVG-out, easy to eyeball against the reference screenshot side by side.
4. Build `DashboardOverview.tsx` (§3) wiring the above three plus `CollectionTimeline` into the fitted layout.
5. Wire the scroll-snap container in `app/dashboard/page.tsx` (§1) last, once slide 2's real height is known — snap points are much easier to tune against real content than against placeholders.
6. Move "Just added" + "Recent Transactions" into normal flow below the snap container.

At each step, run the dev server and actually scroll/hover/resize — this is a visual/motion-heavy change and several of the calls above (does slide 2 fit at 1280×800? does the cruise-in read as intentional or as a glitch?) can only be judged by looking at it, not by reading the diff.

## 8. Test plan

Add cases to `TEST-PLAN.md` for: hero greeting shows correct first name, hero renders sensibly with no `name` on the account (falls back to "there" or similar), scroll-snap lands cleanly on both slides at common desktop widths, mobile shows normal stacked flow with no snap, value chart hover tracks correctly across the full width including at both edges, allocation rings render correctly with exactly one category (no second ring to compare against) and with three+ categories if that ever becomes possible, reduced-motion disables the cruise-in and idle float.

---

## Open items / my assumptions

- **"Hi ___" name source**: assumed `User.name` (already collected at signup, per `prisma/schema.prisma`). If some accounts have empty/placeholder names (e.g. Google OAuth accounts before a display-name flow existed), decide the fallback copy now rather than shipping "Hi there" as a surprise — check `app/api/auth/google/callback/route.ts` for what it currently sets.
- **Mobile scroll-snap**: scoped out per §1. Flag to Jake if he expects it there too — my recommendation is no, for the reason stated.
- **Pie chart dependency**: recommended hand-rolled adaptation over adding Recharts/shadcn scaffolding, since neither exists in this codebase today and the existing charts are a deliberate, documented choice to avoid them. If Jake specifically wants Recharts itself (not just the visual idea), that's a bigger call — installing a charting library, plus `class-variance-authority`, plus standing up `components/ui/` and `lib/utils.ts`'s `cn()` for the first time — worth confirming before doing it, since it's a real architecture change, not a component tweak.
