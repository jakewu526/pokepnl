"use client";

import Image from "next/image";
import Link from "next/link";
import { HoloSurface } from "@/components/HoloSurface";
import type { DashboardPulse } from "@/lib/narrative";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits `text` around any of `amounts`, formatted the same way the caller
// formats them, so the dollar figure(s) already sitting inside a
// lib/narrative.ts sentence can be rendered larger/coloured without
// regex-parsing arbitrary prose. lib/narrative.ts still decides *what* to
// say; this only decides *how* to lay out what it already said. Amounts are
// matched longest-string-first so "$1,309.42" isn't shadowed by a shorter
// candidate that happens to be a substring of it. Any dollar figure in the
// sentence that isn't one of the known amounts (e.g. a milestone threshold,
// or costBasis in the onboarding fact) is left unemphasized rather than
// guessed at -- a plain sentence beats a wrong split.
function splitAmounts(text: string, amounts: number[]): { text: string; emphasize: boolean }[] {
  const candidates = Array.from(new Set(amounts.filter((a) => a !== 0).map((a) => priceFormatter.format(Math.abs(a)))))
    .sort((a, b) => b.length - a.length);
  if (candidates.length === 0) return [{ text, emphasize: false }];

  const pattern = new RegExp(`(${candidates.map(escapeRegExp).join("|")})`, "g");
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, emphasize: candidates.includes(part) }));
}

export type HeroArt = {
  name: string;
  imageUrl: string | null;
  href: string;
  /** Why this particular card is the one on screen. Never render art without one. */
  reason: string;
  /** Optional second line under the reason -- the mover's own change. */
  detail: string | null;
};

// The dashboard's opening screen. Structurally this follows the reference
// video (a left-anchored headline, not boxed to a centered column, while a
// product shot falls into frame from the upper right and settles beside it)
// more than it follows a stat-tile layout: one dominant element at a time,
// not a headline column sharing weight with a thumbnail.
//
// "Hi {firstName}" is that dominant element -- bigger than the dollar figure
// used to be, because the dollar figure now lives inside the sentence below
// it instead of standing alone. The art is still oversized and lifted off
// the page (drop shadow, cursor-tracked holo sheen) as the emotional payload
// of a Pokemon app, but it now *arrives* rather than sitting there on load.
// The background is a flat, fixed deep-emerald fill rather than the card's
// own art blurred into a wash -- deliberately not theme-reactive (it doesn't
// use the --emerald-strong token, which flips to a light mint under
// prefers-color-scheme: dark) so this band reads the same dark, considered
// color regardless of the rest of the site's theme.
export function CollectionHero({
  pulse,
  art,
  firstName,
}: {
  pulse: DashboardPulse;
  art: HeroArt | null;
  firstName: string;
}) {
  const { status, windowCaption, totalValue, netChange, facts, driver } = pulse;

  const changeTone: "positive" | "negative" | "neutral" =
    netChange.abs > 0 ? "positive" : netChange.abs < 0 ? "negative" : "neutral";
  const showDelta = status === "full" && netChange.abs !== 0;

  // The primary sentence is the net-change fact ("Holding steady this week
  // at $X." / "Up $X this week, Y% to $Z.") -- it's the one that actually
  // carries the total, now that the total no longer has its own standalone
  // line. A secondary fact (which segment drove it, a milestone, the top
  // mover) still gets a smaller supporting line below when one exists and
  // says something the primary sentence didn't already.
  const primaryFact = facts.find((f) => f.kind === "net-change") ?? facts[0] ?? null;
  const secondaryFact = facts.find((f) => f !== primaryFact) ?? null;

  // A brand-new account with no price history yet (pulse.status ===
  // "no-history") has no facts at all -- construct the plainest true
  // sentence available rather than rendering nothing.
  const primaryText = primaryFact?.text ?? `Your collection is worth ${priceFormatter.format(totalValue)}.`;
  const primaryAmounts = [totalValue, netChange.abs, driver?.changeAbs ?? 0];
  const primarySegments = splitAmounts(primaryText, primaryAmounts);

  // A bright warm gold/coral instead of the app's usual emerald/amber text
  // tokens -- those tokens are tuned for dark text on light paper and flip
  // value under prefers-color-scheme: dark, so on this hero's own fixed dark
  // background (see bg-[#163f30] below) they'd either vanish or invert
  // unpredictably. Gold-on-deep-green is also just the natural complement to
  // the app's "cool paper + deep emerald + muted gold" palette.
  const emphasisClass = changeTone === "negative" ? "text-rose-300" : "text-amber-300";

  return (
    <section className="relative isolate flex min-h-full flex-col justify-center overflow-hidden bg-[#163f30]">
      {/* No mx-auto here, deliberately -- the reference video anchors the
          headline to the actual left edge of the screen rather than boxing
          everything into a centered column. The text column is `auto`, not
          `1fr` -- `1fr` would size the column to all *available* space
          regardless of how little "Hi Jake" actually needs, and the
          headline (a block element) stretches to fill its column, so the
          art would end up parked at the far edge of an empty track instead
          of near the text. `auto` sizes the column, and everything in it,
          to its own content -- capped by max-w-2xl on the column itself so
          an unusually long name still wraps instead of shoving the art off
          toward the edge of the screen. */}
      <div className="grid w-full max-w-[1200px] items-center gap-10 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[auto_auto] lg:gap-14 lg:px-16 xl:px-20">
        <div className="flex max-w-2xl flex-col items-start gap-4 text-left">
          <p className="rise-in font-body text-xs font-medium uppercase tracking-[0.14em] text-white/55">
            Your collection{windowCaption && <span> · {windowCaption}</span>}
          </p>

          {/* font-body, not font-display -- Fraunces' stylized "J" read as a
              typo at this size on a name like "Jake." A clean grotesk sans
              also matches the reference video's own headline face. */}
          <h1
            className="rise-in font-body text-7xl font-semibold leading-none tracking-tight text-white sm:text-8xl lg:text-9xl"
            style={{ animationDelay: "40ms" }}
          >
            Hi {firstName}
          </h1>

          <p
            className="rise-in max-w-lg font-body text-xl leading-snug text-white/90 sm:text-2xl"
            style={{ animationDelay: "110ms" }}
          >
            {primarySegments.map((seg, i) =>
              seg.emphasize ? (
                <span key={i} className={`font-data text-3xl font-medium tabular-nums sm:text-4xl ${emphasisClass}`}>
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </p>

          {showDelta && (
            <p className="rise-in flex items-center gap-2" style={{ animationDelay: "160ms" }}>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-data text-sm font-medium ${
                  changeTone === "positive" ? "text-amber-300" : "text-rose-300"
                }`}
              >
                {changeTone === "positive" ? "▲" : "▼"} {signedPrice(netChange.abs)}
                <span className="opacity-70">{signedPercent(netChange.pct)}</span>
              </span>
              <span className="font-body text-sm text-white/60">this week</span>
            </p>
          )}

          {secondaryFact && (
            <p
              className="rise-in max-w-md font-body text-sm text-white/60"
              style={{ animationDelay: "200ms" }}
            >
              {secondaryFact.text}
            </p>
          )}
        </div>

        {art && (
          <Link
            href={art.href}
            className="hero-card-fall group mx-auto flex flex-col items-center gap-4 lg:mx-0"
            style={{ animationDelay: "180ms" }}
          >
            {/* The label sits above the art and always explains its presence --
                an unexplained card here was the single most confusing thing on
                the old hero. */}
            <div className="text-center">
              <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-white/55">
                {art.reason}
              </p>
            </div>

            {/* Sized up a tier at xl/2xl -- against a full-bleed hero, a card
                capped at 300px regardless of screen width left a lot of the
                composition's right half empty on a wide monitor. */}
            <HoloSurface className="hero-art relative aspect-[5/7] w-[220px] rounded-card sm:w-[260px] lg:w-[320px] xl:w-[380px] 2xl:w-[440px]">
              {art.imageUrl ? (
                <Image
                  src={art.imageUrl}
                  alt={art.name}
                  fill
                  sizes="(min-width: 1536px) 440px, (min-width: 1280px) 380px, (min-width: 1024px) 320px, 260px"
                  priority
                  className="rounded-card object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-card border border-white/20 bg-white/5 font-body text-sm text-white/50">
                  No image
                </div>
              )}
            </HoloSurface>

            <div className="max-w-[300px] text-center">
              <p className="font-body text-base font-medium text-white group-hover:underline">{art.name}</p>
              {art.detail && <p className="mt-0.5 font-data text-sm text-white/60">{art.detail}</p>}
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
