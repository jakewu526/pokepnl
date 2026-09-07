"use client";

import { useEffect, useRef, useState } from "react";
import { StatTile } from "@/components/StatTile";
import { ValueBars } from "@/components/ValueBars";
import { AllocationDonut } from "@/components/AllocationDonut";
import { CollectionTimeline } from "@/components/CollectionTimeline";
import { ChartZoom } from "@/components/ChartZoom";
import type { PricePoint } from "@/lib/cards";
import type { Slice, CollectionTimeline as TimelineData } from "@/lib/dashboard";

type Delta = { abs: number; pct: number } | null;

// The dashboard's second slide: the four stat tiles plus the three things
// Jake specifically asked to see redesigned -- the value chart, the
// allocation chart, the timeline -- laid out to fit one desktop viewport
// (see the scroll-snap container in app/dashboard/page.tsx). "Just added"
// and "Recent Transactions" are deliberately not here; they live in normal
// document flow below the snap sequence.
export function DashboardOverview({
  totalValue,
  costBasis,
  unrealizedProfit,
  realizedProfit,
  valueDelta7d,
  investedDelta7d,
  unrealizedDelta7d,
  realizedDelta7d,
  valuePoints,
  costBasisPoints,
  allocationSlices,
  timeline,
}: {
  totalValue: number;
  costBasis: number;
  unrealizedProfit: number;
  realizedProfit: number;
  valueDelta7d: Delta;
  investedDelta7d: Delta;
  unrealizedDelta7d: Delta;
  realizedDelta7d: Delta;
  valuePoints: PricePoint[];
  costBasisPoints: PricePoint[];
  allocationSlices: Slice[];
  timeline: TimelineData;
}) {
  // The charts' entrance animation (ValueBars' line sweep, AllocationDonut's
  // ring stagger) should play once, when this slide actually scrolls into
  // view -- not on mount, which happens instantly while the hero is still on
  // screen and would be long over by the time the user scrolls down here.
  // The observer disconnects after the first hit, so `animate` never resets
  // and scrolling back up to the hero and down again does not replay it.
  const rootRef = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimate(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      // Below md this stacks with each section at its own natural (compact)
      // size rather than a forced-fit height -- an earlier version pinned
      // this to a guessed `100dvh` calc, which clipped content whenever the
      // guess undershot a real device's header/tab-bar/safe-area chrome.
      // Natural sizing can't clip; worst case the page scrolls a little,
      // same as every other page in the app. md and up is unchanged: the
      // original "fit one desktop viewport" sizing, centered content.
      className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-3 md:min-h-full md:justify-center md:gap-4 md:px-4 md:py-6 sm:px-6 lg:gap-3"
    >
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink md:hidden">Dashboard</h1>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="What it's worth"
          value={totalValue}
          tone="positive"
          delta={valueDelta7d}
          deltaLabel="this week"
        />
        <StatTile label="What you paid" value={costBasis} delta={investedDelta7d} deltaLabel="this week" />
        <StatTile
          label="If you sold today"
          value={unrealizedProfit}
          format="signed-currency"
          tone={unrealizedProfit < 0 ? "negative" : "positive"}
          delta={unrealizedDelta7d}
          deltaLabel="this week"
        />
        <StatTile
          label="Made from sales"
          value={realizedProfit}
          format="signed-currency"
          tone={realizedProfit < 0 ? "negative" : "positive"}
          delta={realizedDelta7d}
          deltaLabel="this week"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 md:gap-3 lg:grid-cols-[1.6fr_1fr]">
        <ChartZoom title="Value over time">
          {(zoomed) => (
            <ValueBars
              valuePoints={valuePoints}
              costBasisPoints={costBasisPoints}
              animate={animate}
              compact={!zoomed}
            />
          )}
        </ChartZoom>
        <ChartZoom title="What it's made of">
          {(zoomed) => (
            <AllocationDonut slices={allocationSlices} total={totalValue} animate={animate} large={zoomed} />
          )}
        </ChartZoom>
      </div>

      {/* Dropped below the fold on mobile -- app/dashboard/page.tsx renders
          this same timeline again in normal scrolling flow, just above Top
          Movers, wrapped `md:hidden` there so the two mounts never both
          show. */}
      <div className="hidden md:block">
        <CollectionTimeline timeline={timeline} compact />
      </div>
    </div>
  );
}
