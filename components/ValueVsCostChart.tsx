"use client";

import { useId, useMemo, useRef, useState } from "react";
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
import { ChartEmptyState } from "./ChartEmptyState";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const WIDTH = 720;
const HEIGHT = 360;
const { left: PAD_LEFT, right: PAD_RIGHT, top: PAD_TOP, bottom: PAD_BOTTOM } = CHART.pad;

// Two-series chart: market value vs cost basis, with the gap between them
// shaded -- that shaded band *is* unrealized P&L over time. Shares geometry
// and range-filtering with PriceChart/GradePriceChart but isn't built on top
// of either, since neither supports a second series plus a filled area.
export function ValueVsCostChart({
  valuePoints,
  costBasisPoints,
}: {
  valuePoints: PricePoint[];
  costBasisPoints: PricePoint[];
}) {
  const clipId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [range, setRange] = useState<RangeKey | null>(null);

  const costByDate = useMemo(() => new Map(costBasisPoints.map((p) => [p.date, p.price])), [costBasisPoints]);

  const available = useMemo(() => getAvailableRanges(valuePoints.map((p) => p.date)), [valuePoints]);
  const effectiveRange: RangeKey =
    range && available.some((o) => o.key === range) ? range : defaultRangeKey(available);
  const maxTs = useMemo(
    () => (valuePoints.length ? Math.max(...valuePoints.map((p) => parseLocalDate(p.date).getTime())) : 0),
    [valuePoints]
  );

  const visiblePoints = useMemo(
    () => filterPointsToRange(valuePoints, effectiveRange, maxTs),
    [valuePoints, effectiveRange, maxTs]
  );

  const view = useMemo(() => {
    if (visiblePoints.length === 0) return null;
    const dates = visiblePoints.map((p) => parseLocalDate(p.date).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const allPrices = visiblePoints.flatMap((p) => [p.price, costByDate.get(p.date) ?? p.price]);
    const lo = Math.min(...allPrices);
    const hi = Math.max(...allPrices);
    const span = hi - lo;
    const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(hi) * 0.05, 1);
    const minPrice = lo - pad;
    let maxPrice = hi + pad;
    if (maxPrice <= minPrice) maxPrice = minPrice + 1;
    return { minDate, maxDate, minPrice, maxPrice, spanDays: (maxDate - minDate) / 86_400_000 };
  }, [visiblePoints, costByDate]);

  if (valuePoints.length === 0) {
    return (
      <ChartEmptyState
        title="No portfolio history yet"
        subtitle="Add items to your portfolio to see this chart."
        height={HEIGHT}
      />
    );
  }

  if (!view || visiblePoints.length < 2) {
    return (
      <div className="rounded-card border border-line bg-paper-raised p-3">
        <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ height: HEIGHT }}>
          <p className="font-data text-2xl font-medium text-emerald-strong">
            {priceFormatter.format(visiblePoints[0]?.price ?? 0)}
          </p>
          <p className="font-body text-xs text-ink-muted">History builds daily — check back over time.</p>
        </div>
      </div>
    );
  }

  const { minDate, maxDate, minPrice, maxPrice, spanDays } = view;
  const xScale = (t: number) =>
    maxDate !== minDate
      ? PAD_LEFT + ((t - minDate) / (maxDate - minDate)) * (WIDTH - PAD_LEFT - PAD_RIGHT)
      : (PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2;
  const yScale = (p: number) =>
    HEIGHT - PAD_BOTTOM - ((p - minPrice) / (maxPrice - minPrice)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const valueCoords = visiblePoints.map((p) => ({
    x: xScale(parseLocalDate(p.date).getTime()),
    y: yScale(p.price),
    point: p,
  }));
  const costCoords = visiblePoints.map((p) => ({
    x: xScale(parseLocalDate(p.date).getTime()),
    y: yScale(costByDate.get(p.date) ?? p.price),
  }));

  const valuePathD = valueCoords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const costPathD = costCoords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPathD =
    valueCoords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ") +
    " " +
    [...costCoords].reverse().map((c) => `L ${c.x} ${c.y}`).join(" ") +
    " Z";

  const latestGap = valueCoords[valueCoords.length - 1].y - costCoords[costCoords.length - 1].y;
  const gapPositive = latestGap <= 0; // smaller y = higher on screen = higher value

  const priceTicks = 4;
  const yTicks = Array.from({ length: priceTicks + 1 }, (_, i) => {
    const value = minPrice + ((maxPrice - minPrice) / priceTicks) * i;
    return { value, y: yScale(value) };
  });

  const xTickCount = Math.min(5, visiblePoints.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const t = minDate + ((maxDate - minDate) * i) / (xTickCount - 1 || 1);
    return { t, label: formatAxisDate(t, spanDays) };
  });

  function handleMove(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    valueCoords.forEach((c, i) => {
      const dist = Math.abs(c.x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hoveredValue = hoverIndex != null ? valueCoords[hoverIndex] : null;
  const hoveredCost = hoverIndex != null ? costCoords[hoverIndex] : null;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <div ref={containerRef} className="relative w-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ height: "auto" }}
          onMouseMove={(e) => handleMove(e.clientX)}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PAD_LEFT}
                y={PAD_TOP}
                width={WIDTH - PAD_LEFT - PAD_RIGHT}
                height={HEIGHT - PAD_TOP - PAD_BOTTOM}
              />
            </clipPath>
          </defs>

          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={tick.y}
                y2={tick.y}
                stroke={CHART.grid.stroke}
                strokeWidth={CHART.grid.strokeWidth}
                opacity={CHART.grid.opacity}
              />
              <text
                x={PAD_LEFT - 8}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="font-data"
                fontSize={CHART.axis.fontSize}
                fill={CHART.axis.fill}
              >
                {priceFormatter.format(tick.value)}
              </text>
            </g>
          ))}

          {xTicks.map((tick, i) => (
            <text
              key={i}
              x={xScale(tick.t)}
              y={HEIGHT - PAD_BOTTOM + 20}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              className="font-data"
              fontSize={CHART.axis.fontSize}
              fill={CHART.axis.fill}
            >
              {tick.label}
            </text>
          ))}

          <g clipPath={`url(#${clipId})`}>
            <path
              d={areaPathD}
              fill={gapPositive ? CHART.role.value : CHART.role.loss}
              opacity={0.12}
            />
            <path
              d={costPathD}
              fill="none"
              stroke={CHART.role.cost}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              pathLength={1}
              className="draw-in"
            />
            <path
              d={valuePathD}
              fill="none"
              stroke={CHART.role.value}
              strokeWidth={2}
              pathLength={1}
              className="draw-in"
            />

            {hoveredValue && (
              <line
                x1={hoveredValue.x}
                x2={hoveredValue.x}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="var(--ink-muted)"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.4}
              />
            )}
            {hoveredValue && <circle cx={hoveredValue.x} cy={hoveredValue.y} r={4} fill={CHART.role.value} />}
            {hoveredCost && (
              <circle
                cx={hoveredCost.x}
                cy={hoveredCost.y}
                r={3.5}
                fill="var(--paper-raised)"
                stroke={CHART.role.cost}
                strokeWidth={1.5}
              />
            )}
          </g>
        </svg>

        {hoveredValue && hoverIndex != null && (
          <ChartTooltip
            title={dateFormatter.format(parseLocalDate(valueCoords[hoverIndex].point.date))}
            className="-translate-x-1/2 -translate-y-[calc(100%+8px)]"
            style={{ left: `${(hoveredValue.x / WIDTH) * 100}%`, top: `${(hoveredValue.y / HEIGHT) * 100}%` }}
            rows={[
              {
                label: "Value",
                value: priceFormatter.format(valueCoords[hoverIndex].point.price),
                swatch: { color: CHART.role.value },
              },
              {
                label: "Cost basis",
                value: priceFormatter.format(costByDate.get(valueCoords[hoverIndex].point.date) ?? 0),
                swatch: { color: CHART.role.cost, filled: false },
              },
            ]}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <ChartRangeToggle
          available={available}
          selected={effectiveRange}
          onSelect={(key) => {
            setRange(key);
            setHoverIndex(null);
          }}
        />
      </div>
    </div>
  );
}
