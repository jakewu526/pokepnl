"use client";

import { useState } from "react";
import type { CollectionTimeline as TimelineData, TimelineDay } from "@/lib/dashboard";
import { parseLocalDate } from "@/lib/chart-format";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longDayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function hasActivity(day: TimelineDay): boolean {
  return day.added.count > 0 || day.sold.count > 0;
}

// Everything that happened, on one rail. Added sits above the centre line,
// sold below it, so a busy week reads as a shape rather than a list.
//
// The span is what makes this work on day one: `getCollectionTimeline` always
// returns at least a fortnight, so a new account shows a real track with
// today's additions at the right-hand end instead of an empty box. As the
// account ages the same rail widens and the columns thin out on their own --
// no threshold, nothing unlocked.
// `compact` drops the descriptive paragraph and tightens the rail -- used on
// the dashboard's fitted overview slide, where this sits alongside three
// other components in one viewport rather than having a page to itself.
export function CollectionTimeline({ timeline, compact = false }: { timeline: TimelineData; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);

  const { days } = timeline;
  if (days.length === 0) return null;

  const peak = Math.max(1, ...days.map((d) => Math.max(d.added.count, d.sold.count)));
  const active = hover != null ? days[hover] : null;
  const dense = days.length > 90;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink">Your history</h3>
        <p className="font-body text-sm text-ink-muted">
          {timeline.totalAdded} added · {timeline.totalSold} sold
        </p>
      </div>
      {!compact && (
        <p className="mb-5 font-body text-sm text-ink-muted">
          Every card you&rsquo;ve bought and sold, in order. It stretches as you go.
        </p>
      )}

      <div className={`relative ${compact ? "mt-3" : ""}`} onPointerLeave={() => setHover(null)}>
        {/* Tooltip is pinned above the rail rather than following the cursor --
            at 365 columns the columns are thinner than the pointer. */}
        {active && hasActivity(active) && (
          <div className="pointer-events-none absolute -top-1 left-0 right-0 z-10 flex justify-center">
            <div className="rounded border border-line bg-paper-raised px-2.5 py-1.5 shadow-sm">
              <p className="font-body text-[11px] text-ink-muted">
                {longDayFormatter.format(parseLocalDate(active.date))}
              </p>
              {active.added.count > 0 && (
                <p className="font-data text-[11px] font-medium text-emerald-strong">
                  +{active.added.count} added
                  {active.added.amount > 0 && ` · ${priceFormatter.format(active.added.amount)}`}
                </p>
              )}
              {active.sold.count > 0 && (
                <p className="font-data text-[11px] font-medium text-series-blue">
                  {active.sold.count} sold · {priceFormatter.format(active.sold.amount)}
                </p>
              )}
              {(active.added.names.length > 0 || active.sold.names.length > 0) && (
                <p className="mt-0.5 max-w-[220px] truncate font-body text-[11px] text-ink-muted">
                  {[...active.added.names, ...active.sold.names].join(", ")}
                </p>
              )}
            </div>
          </div>
        )}

        <div className={`flex items-stretch gap-px ${compact ? "h-[64px] pt-6" : "h-[104px] pt-8"}`}>
          {days.map((day, i) => {
            const barMax = compact ? 16 : 28;
            const addedH = (day.added.count / peak) * barMax;
            const soldH = (day.sold.count / peak) * barMax;
            const isHovered = hover === i;
            const isToday = i === days.length - 1;

            return (
              <div
                key={day.date}
                className="group relative flex min-w-0 flex-1 flex-col items-center justify-center"
                onPointerEnter={() => setHover(i)}
              >
                {/* Added: grows upward from the rail */}
                <div className="flex w-full flex-1 items-end justify-center pb-px">
                  {day.added.count > 0 && (
                    <span
                      className="grow-up w-full rounded-t-[2px] bg-emerald transition-opacity"
                      style={{
                        height: `${Math.max(4, addedH)}px`,
                        opacity: hover == null || isHovered ? 1 : 0.4,
                        animationDelay: `${Math.min(i * 4, 300)}ms`,
                      }}
                    />
                  )}
                </div>

                {/* The rail itself */}
                <span
                  className={`h-px w-full transition-colors ${
                    isHovered ? "bg-ink-muted" : isToday ? "bg-emerald-strong" : "bg-line"
                  }`}
                />

                {/* Sold: grows downward */}
                <div className="flex w-full flex-1 items-start justify-center pt-px">
                  {day.sold.count > 0 && (
                    <span
                      className="w-full rounded-b-[2px] bg-series-blue transition-opacity"
                      style={{
                        height: `${Math.max(4, soldH)}px`,
                        opacity: hover == null || isHovered ? 1 : 0.4,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between font-body text-xs text-ink-muted">
          <span>{dayFormatter.format(parseLocalDate(days[0].date))}</span>
          {!dense && days.length > 20 && (
            <span>{dayFormatter.format(parseLocalDate(days[Math.floor(days.length / 2)].date))}</span>
          )}
          <span className="font-medium text-emerald-strong">Today</span>
        </div>

        <div className="mt-3 flex items-center gap-4 font-body text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-emerald" /> Added
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-blue" /> Sold
          </span>
        </div>
      </div>
    </div>
  );
}
