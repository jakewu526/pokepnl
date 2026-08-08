"use client";

import { useId, useMemo, useState } from "react";
import type { PricePoint } from "@/lib/cards";
import {
  type RangeKey,
  defaultRangeKey,
  filterPointsToRange,
  formatAxisDate,
  getAvailableRanges,
  parseLocalDate,
} from "@/lib/chart-format";
import { CHART } from "@/lib/chart-theme";
import { ChartRangeToggle } from "./ChartRangeToggle";
import { ChartTooltip } from "./ChartTooltip";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactPrice = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const WIDTH = 720;
const HEIGHT = 320;
const PAD_LEFT = 52;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

// Catmull-Rom -> cubic Bezier, the standard construction for "a smooth curve
// through every point, nothing invented between them" -- each segment is
// built only from the four real points around it, so the curve still makes
// exactly one claim per measured day; it just joins them with a curve
// instead of a straight edge. One path vertex per data point, same as the
// bars this replaces -- only the rendering changed, not what the marks mean.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// A tall, filled mountain of value instead of a strip of columns -- the
// chart is meant to be the dominant thing in its card, not a compact aside.
// Still zero-baselined (the top of the y-axis is 12% above the series max,
// the bottom is always $0): a value axis that starts at the series minimum
// would exaggerate a $5 wobble into a cliff, same reasoning this component
// has always used, just now drawn as a curve instead of bars.
//
// Cost basis stays a dashed reference line rather than a second series: the
// question is "am I above or below what I paid," and a rule answers that at
// a glance where two crossing lines did not.
export function ValueBars({
  valuePoints,
  costBasisPoints,
  animate = true,
}: {
  valuePoints: PricePoint[];
  costBasisPoints: PricePoint[];
  /** Gates the line-sweep entrance -- false renders the line pre-drawn-hidden
      until the caller flips this once the chart has scrolled into view. */
  animate?: boolean;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [range, setRange] = useState<RangeKey | null>(null);

  const costByDate = useMemo(
    () => new Map(costBasisPoints.map((p) => [p.date, p.price])),
    [costBasisPoints]
  );

  const available = useMemo(() => getAvailableRanges(valuePoints.map((p) => p.date)), [valuePoints]);
  const effectiveRange: RangeKey =
    range && available.some((o) => o.key === range) ? range : defaultRangeKey(available);
  const maxTs = useMemo(
    () => (valuePoints.length ? Math.max(...valuePoints.map((p) => parseLocalDate(p.date).getTime())) : 0),
    [valuePoints]
  );
  const points = useMemo(
    () => filterPointsToRange(valuePoints, effectiveRange, maxTs),
    [valuePoints, effectiveRange, maxTs]
  );

  const view = useMemo(() => {
    if (points.length === 0) return null;

    const maxValue = Math.max(...points.map((p) => p.price), ...points.map((p) => costByDate.get(p.date) ?? 0));
    const top = maxValue === 0 ? 1 : maxValue * 1.12;

    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const baselineY = PAD_TOP + plotH;
    const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

    const y = (v: number) => PAD_TOP + plotH - (v / top) * plotH;
    const x = (i: number) => PAD_LEFT + stepX * i;

    const marks = points.map((p, i) => ({ x: x(i), y: y(p.price), point: p }));

    const linePath = smoothPath(marks.map((m) => ({ x: m.x, y: m.y })));
    const areaPath =
      marks.length > 0
        ? `${linePath} L ${marks[marks.length - 1].x} ${baselineY} L ${marks[0].x} ${baselineY} Z`
        : "";

    // Approximate on-screen path length (sum of straight segments between
    // real points) -- close enough to drive the .sweep-in stroke-dashoffset
    // reveal; it only needs to be at least the true curve length so the
    // dash never runs out mid-draw.
    let sweepLength = 0;
    for (let i = 1; i < marks.length; i++) {
      sweepLength += Math.hypot(marks[i].x - marks[i - 1].x, marks[i].y - marks[i - 1].y);
    }
    sweepLength = Math.max(sweepLength * 1.15, 1);

    const latestCost = costByDate.get(points[points.length - 1].date) ?? null;
    const ticks = [0, 0.5, 1].map((f) => ({ value: top * f, y: y(top * f) }));

    return { marks, linePath, areaPath, sweepLength, top, plotH, baselineY, y, latestCost, ticks, stepX };
  }, [points, costByDate]);

  if (!view) return null;

  const hovered = hoverIndex != null ? view.marks[hoverIndex] : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    if (!view || view.stepX === 0) {
      setHoverIndex(0);
      return;
    }
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.round((svgX - PAD_LEFT) / view.stepX);
    setHoverIndex(Math.min(view.marks.length - 1, Math.max(0, index)));
  }

  return (
    <div className="rounded-card border border-line bg-paper-raised p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink">Value over time</h3>
          <p className="mt-0.5 font-body text-sm text-ink-muted">
            Every point is a real day. The dashed line is what you paid.
          </p>
        </div>
        <div className="flex gap-1.5">
          <ChartRangeToggle available={available} selected={effectiveRange} onSelect={setRange} />
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Collection value across ${points.length} days`}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.role.value} stopOpacity="0.85" />
              <stop offset="65%" stopColor={CHART.role.value} stopOpacity="0.22" />
              <stop offset="100%" stopColor={CHART.role.value} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {view.ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                y1={t.y}
                x2={WIDTH - PAD_RIGHT}
                y2={t.y}
                stroke={CHART.grid.stroke}
                strokeWidth={CHART.grid.strokeWidth}
                opacity={CHART.grid.opacity}
              />
              <text
                x={PAD_LEFT - 8}
                y={t.y + 4}
                textAnchor="end"
                fontSize={CHART.axis.fontSize}
                fill={CHART.axis.fill}
              >
                {compactPrice.format(t.value)}
              </text>
            </g>
          ))}

          <path d={view.areaPath} fill={`url(#${gradientId})`} />

          <path
            d={view.linePath}
            fill="none"
            stroke={CHART.role.value}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={animate ? "sweep-in" : undefined}
            style={
              {
                "--sweep-length": view.sweepLength,
                strokeDashoffset: animate ? undefined : view.sweepLength,
              } as React.CSSProperties
            }
            strokeDasharray={view.sweepLength}
          />

          {view.latestCost != null && view.latestCost > 0 && (
            <>
              <line
                x1={PAD_LEFT}
                y1={view.y(view.latestCost)}
                x2={WIDTH - PAD_RIGHT}
                y2={view.y(view.latestCost)}
                stroke={CHART.role.cost}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text
                x={WIDTH - PAD_RIGHT}
                y={view.y(view.latestCost) - 6}
                textAnchor="end"
                fontSize={CHART.axis.fontSize}
                fill={CHART.axis.fill}
              >
                paid {compactPrice.format(view.latestCost)}
              </text>
            </>
          )}

          {hovered && (
            <g className="pointer-events-none">
              <line
                x1={hovered.x}
                y1={PAD_TOP}
                x2={hovered.x}
                y2={view.baselineY}
                stroke={CHART.axis.fill}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.6}
              />
              <circle cx={hovered.x} cy={hovered.y} r={4.5} fill={CHART.role.value} stroke="var(--paper-raised)" strokeWidth={2} />
            </g>
          )}

          {/* One continuous hit target across the whole plot, tracking the
              nearest real point by pointer x -- a bar-sized hit target would
              leave dead zones now that there's no bar under most of the
              curve's width. */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={WIDTH - PAD_LEFT - PAD_RIGHT}
            height={view.plotH}
            fill="transparent"
            onPointerMove={handlePointerMove}
          />

          <text x={PAD_LEFT} y={HEIGHT - 8} fontSize={CHART.axis.fontSize} fill={CHART.axis.fill}>
            {formatAxisDate(parseLocalDate(points[0].date).getTime(), points.length)}
          </text>
          {points.length > 1 && (
            <text
              x={WIDTH - PAD_RIGHT}
              y={HEIGHT - 8}
              textAnchor="end"
              fontSize={CHART.axis.fontSize}
              fill={CHART.axis.fill}
            >
              {formatAxisDate(parseLocalDate(points[points.length - 1].date).getTime(), points.length)}
            </text>
          )}
        </svg>

        {hovered && (
          <ChartTooltip
            title={dateFormatter.format(parseLocalDate(hovered.point.date))}
            rows={[
              { label: "Worth", value: priceFormatter.format(hovered.point.price), swatch: { color: CHART.role.value } },
              ...(costByDate.get(hovered.point.date) != null
                ? [
                    {
                      label: "Paid",
                      value: priceFormatter.format(costByDate.get(hovered.point.date)!),
                      swatch: { color: CHART.role.cost, filled: false },
                    },
                  ]
                : []),
            ]}
            className="-translate-x-1/2"
            style={{
              left: `${(hovered.x / WIDTH) * 100}%`,
              top: `${Math.max(0, (hovered.y / HEIGHT) * 100 - 14)}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
