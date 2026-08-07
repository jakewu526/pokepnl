import { StatTile } from "@/components/StatTile";
import { ValueBars } from "@/components/ValueBars";
import { AllocationDonut } from "@/components/AllocationDonut";
import { CollectionTimeline } from "@/components/CollectionTimeline";
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
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col justify-center gap-4 px-4 py-6 sm:px-6 lg:gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <ValueBars valuePoints={valuePoints} costBasisPoints={costBasisPoints} />
        <AllocationDonut slices={allocationSlices} total={totalValue} />
      </div>

      <CollectionTimeline timeline={timeline} compact />
    </div>
  );
}
