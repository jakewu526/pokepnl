"use client";

import { ChartZoom } from "@/components/ChartZoom";
import { CollectionTimeline } from "@/components/CollectionTimeline";
import type { CollectionTimeline as TimelineData } from "@/lib/dashboard";

// ChartZoom's children is a function (a render prop, so the wrapped chart
// can redraw when zoomed) -- fine when the caller is a Client Component
// like DashboardOverview, but a plain function isn't serializable across
// the Server->Client boundary. app/dashboard/page.tsx is a Server
// Component, so this thin client wrapper exists solely to receive
// `timeline` as a normal (serializable) prop and build the function on the
// client side instead.
export function MobileTimelineZoom({ timeline }: { timeline: TimelineData }) {
  return (
    <ChartZoom title="Your history">
      {(zoomed) => <CollectionTimeline timeline={timeline} large={zoomed} />}
    </ChartZoom>
  );
}
