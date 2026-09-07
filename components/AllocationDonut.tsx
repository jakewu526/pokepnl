"use client";

import { useState } from "react";
import type { Slice } from "@/lib/dashboard";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

const SIZE = 240;
const STROKE = 16;
// The band every ring's radius is spread across -- smallest segment lands at
// MIN_RADIUS, largest at MAX_RADIUS, everything else evenly between.
const MIN_RADIUS = 36;
const MAX_RADIUS = SIZE / 2 - STROKE / 2 - 6;

// Fixed, CVD-checked ramp from globals.css. Cards and sealed always land on
// the same two colours so the rings, the legend, and any future segment
// callout agree without being wired together.
const SEGMENT_COLORS = [
  "var(--emerald)",
  "var(--series-blue)",
  "var(--series-yellow)",
  "var(--series-violet)",
  "var(--series-aqua)",
  "var(--series-red)",
];

// Concentric rings, one per segment, sized by rank instead of one ring with
// arcs of equal radius but varying length. The smallest segment gets the
// smallest ring, the largest gets the largest -- so scale reads twice, once
// in how much of its own ring is filled and once in how big that ring is to
// begin with. Segments are walked smallest-to-largest for both the radius
// assignment *and* the cumulative arc offset, so the whole shape reads as
// one continuous spiral rather than unrelated rings.
export function AllocationDonut({
  slices,
  total,
  animate = true,
  large = false,
}: {
  slices: Slice[];
  total: number;
  /** Gates the ring-in stagger -- false renders the rings invisible until the
      caller flips this once the chart has scrolled into view. */
  animate?: boolean;
  /** Forces the desktop-sized ring/legend regardless of viewport width --
      ChartZoom's one caller passes this true for the fullscreen mobile view,
      since the sm: breakpoint alone wouldn't otherwise fire inside a
      375px-wide overlay. */
  large?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const drawable = [...slices].filter((s) => s.value > 0).sort((a, b) => a.value - b.value);
  if (drawable.length === 0) return null;

  const sum = drawable.reduce((acc, s) => acc + s.value, 0);
  const active = hover != null ? drawable[hover] : null;
  const n = drawable.length;

  const segments = drawable.map((slice, i) => {
    const radius = n <= 1 ? MAX_RADIUS : MIN_RADIUS + ((MAX_RADIUS - MIN_RADIUS) * i) / (n - 1);
    const circumference = 2 * Math.PI * radius;
    const shareBefore = drawable.slice(0, i).reduce((acc, prev) => acc + prev.value, 0) / sum;
    const share = slice.value / sum;
    return {
      slice,
      i,
      radius,
      length: share * circumference,
      offset: shareBefore * circumference,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    };
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-paper-raised p-3 sm:p-5">
      <h3
        className={`font-display font-semibold tracking-tight text-ink ${large ? "text-xl" : "text-base sm:text-xl"}`}
      >
        What it&rsquo;s made of
      </h3>
      <p className={`mt-0.5 font-body text-sm text-ink-muted ${large ? "block" : "hidden sm:block"}`}>
        Where the value sits right now.
      </p>

      {/* Side-by-side at every width (not just sm:flex-row) -- stacking the
          legend below the rings was the single biggest space cost on the
          fitted mobile dashboard screen. The ring box itself is sized
          responsively (120px mobile, 240px at sm+) via Tailwind rather than
          the SIZE constant, which stays the viewBox's internal coordinate
          space only -- `large` forces the sm+ size even under 640px, for
          ChartZoom's fullscreen view. */}
      <div className={`mt-2 flex flex-1 items-center gap-3 ${large ? "mt-4 gap-8" : "sm:mt-4 sm:gap-8"}`}>
        <div className={`relative shrink-0 ${large ? "size-[240px]" : "size-[120px] sm:size-[240px]"}`}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-full w-full"
            role="img"
            aria-label="Collection value by category"
            onPointerLeave={() => setHover(null)}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={MAX_RADIUS}
              fill="none"
              stroke="var(--line)"
              strokeWidth={1}
              opacity={0.4}
            />
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {segments.map(({ slice, i, radius, length, offset, color }) => {
                const circumference = 2 * Math.PI * radius;
                return (
                  <circle
                    key={slice.label}
                    className={animate ? "ring-in mark-hover" : "mark-hover"}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    // 1px gap keeps adjacent segments legible without a border.
                    strokeWidth={hover === i ? STROKE + 5 : STROKE}
                    strokeDasharray={`${Math.max(0, length - 1.5)} ${circumference - Math.max(0, length - 1.5)}`}
                    strokeDashoffset={-offset}
                    opacity={animate ? (hover == null || hover === i ? 1 : 0.35) : 0}
                    style={{
                      transition: "stroke-width 200ms ease, opacity 160ms ease",
                      animationDelay: `${i * 90}ms`,
                    }}
                    onPointerEnter={() => setHover(i)}
                  />
                );
              })}
            </g>
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className={`font-data font-medium text-ink ${large ? "text-2xl" : "text-base sm:text-2xl"}`}>
              {priceFormatter.format(active ? active.value : total)}
            </p>
            <p
              className={`mt-0.5 font-body text-ink-muted ${
                large ? "max-w-[110px] text-xs" : "max-w-[70px] text-[10px] sm:max-w-[110px] sm:text-xs"
              }`}
            >
              {active ? active.label : "in total"}
            </p>
          </div>
        </div>

        <ul className={`flex w-full min-w-0 flex-col gap-1 ${large ? "gap-2.5" : "sm:gap-2.5"}`}>
          {segments.map(({ slice, i, color }) => (
            <li
              key={slice.label}
              className={`flex cursor-default items-center gap-2 rounded px-1 py-1 transition-colors hover:bg-paper ${
                large ? "gap-3 px-2 py-1.5" : "sm:gap-3 sm:px-2 sm:py-1.5"
              }`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="size-3 shrink-0 rounded-sm" style={{ background: color }} />
              <span className={`flex-1 truncate font-body text-xs text-ink ${large ? "text-sm" : "sm:text-sm"}`}>
                {slice.label}
              </span>
              <span className={`font-data text-sm text-ink-muted ${large ? "inline" : "hidden sm:inline"}`}>
                {percentFormatter.format(slice.pct)}
              </span>
              <span
                className={`text-right font-data text-xs font-medium text-ink ${
                  large ? "w-20 text-sm" : "w-16 sm:w-20 sm:text-sm"
                }`}
              >
                {priceFormatter.format(slice.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
