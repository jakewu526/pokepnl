"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/cards";
import {
  type RangeKey,
  defaultRangeKey,
  filterPointsToRange,
  formatAxisDate,
  formatRangeCaption,
  getAvailableRanges,
  parseLocalDate,
} from "@/lib/chart-format";
import { CustomRangeControl } from "./CustomRangeControl";
import { useAnimatedDomain } from "./useAnimatedDomain";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DAY_MS = 86_400_000;

const WIDTH = 720;
const HEIGHT = 280;
const PAD_LEFT = 76;
const PAD_RIGHT = 20;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

export function PriceChart({
  points,
  source,
  negative = false,
  showRangeControls = false,
}: {
  points: PricePoint[];
  source: string | null;
  negative?: boolean;
  showRangeControls?: boolean;
}) {
  const clipId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [range, setRange] = useState<RangeKey | null>(null);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const lineColor = negative ? "var(--amber)" : "var(--emerald)";
  const priceTextClass = negative ? "text-amber" : "text-emerald-strong";

  const available = useMemo(() => getAvailableRanges(points.map((p) => p.date)), [points]);
  const effectiveRange: RangeKey = showRangeControls
    ? range && available.some((o) => o.key === range)
      ? range
      : defaultRangeKey(available)
    : "ALL";

  const maxTs = useMemo(
    () =>
      points.length
        ? Math.max(...points.map((p) => parseLocalDate(p.date).getTime()))
        : 0,
    [points]
  );
  const visiblePoints = useMemo(() => {
    if (customRange) {
      const startTs = parseLocalDate(customRange.start).getTime();
      const endTs = parseLocalDate(customRange.end).getTime();
      return points.filter((p) => {
        const t = parseLocalDate(p.date).getTime();
        return t >= startTs && t <= endTs;
      });
    }
    return filterPointsToRange(points, effectiveRange, maxTs);
  }, [points, effectiveRange, maxTs, customRange]);

  // Static domain of the selected range (stable during the zoom animation).
  const view = useMemo(() => {
    if (visiblePoints.length === 0) return null;
    const dates = visiblePoints.map((p) => parseLocalDate(p.date).getTime());
    const prices = visiblePoints.map((p) => p.price);
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);

    let minPrice: number;
    let maxPrice: number;
    if (showRangeControls) {
      // Tighten the y-axis to the visible prices so small moves within a short
      // range stay legible -- a $2,044 -> $2,105 change should not look flat
      // under a $0-based axis sized for the full multi-year range.
      const lo = Math.min(...prices);
      const hi = Math.max(...prices);
      const span = hi - lo;
      const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(hi) * 0.05, 1);
      minPrice = lo - pad;
      if (lo >= 0) minPrice = Math.max(0, minPrice);
      maxPrice = hi + pad;
      if (maxPrice <= minPrice) maxPrice = minPrice + 1;
    } else {
      // Value/profit charts keep a $0 baseline (and a negative floor when a
      // profit series dips below zero) so the zero line stays meaningful.
      const minPriceRaw = Math.min(0, ...prices);
      minPrice = minPriceRaw < 0 ? minPriceRaw * 1.1 : 0;
      const maxPriceRaw = Math.max(0, ...prices);
      maxPrice = maxPriceRaw === 0 ? 1 : maxPriceRaw * 1.1;
    }
    return { minDate, maxDate, minPrice, maxPrice, spanDays: (maxDate - minDate) / DAY_MS };
  }, [visiblePoints, showRangeControls]);

  // Interpolated domain drives the scales, so switching ranges zooms/pans.
  const { domain: animated, from, animating } = useAnimatedDomain(
    view ?? { minDate: 0, maxDate: 1, minPrice: 0, maxPrice: 1 }
  );

  // During a transition, render the wider (previous ∪ target) span of points so
  // a zoom-in keeps the line spanning full width instead of flashing empty
  // space; settle to just the target range's points once the animation ends.
  const renderMinDate = animating
    ? Math.min(from.minDate, view?.minDate ?? from.minDate)
    : view?.minDate ?? Number.NEGATIVE_INFINITY;
  const renderPoints = useMemo(
    () => points.filter((p) => parseLocalDate(p.date).getTime() >= renderMinDate),
    [points, renderMinDate]
  );

  if (points.length === 0) {
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-1 rounded-card border border-line bg-paper-raised text-center">
        <p className="font-body text-sm font-medium text-ink">No price history yet</p>
        <p className="font-body text-xs text-ink-muted">
          Prices are captured daily — check back soon.
        </p>
      </div>
    );
  }

  if (points.length === 1) {
    const single = points[0];
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-card border border-line bg-paper-raised text-center">
        <p className={`font-data text-2xl font-medium ${priceTextClass}`}>
          {priceFormatter.format(single.price)}
        </p>
        <p className="font-body text-xs text-ink-muted">
          {dateFormatter.format(parseLocalDate(single.date))}
        </p>
        <p className="font-body text-xs text-ink-muted">
          History builds daily — check back over time.
        </p>
      </div>
    );
  }

  const { minDate, maxDate, minPrice, maxPrice } = animated;
  const xScale = (t: number) =>
    maxDate !== minDate
      ? PAD_LEFT + ((t - minDate) / (maxDate - minDate)) * (WIDTH - PAD_LEFT - PAD_RIGHT)
      : (PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2;
  const yScale = (p: number) =>
    HEIGHT -
    PAD_BOTTOM -
    ((p - minPrice) / (maxPrice - minPrice)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const coords = renderPoints.map((p) => ({
    x: xScale(parseLocalDate(p.date).getTime()),
    y: yScale(p.price),
    point: p,
  }));

  const priceTicks = 4;
  const yTicks = Array.from({ length: priceTicks + 1 }, (_, i) => {
    const value = minPrice + ((maxPrice - minPrice) / priceTicks) * i;
    return { value, y: yScale(value) };
  });

  // Tick timestamps come from the static `view` so labels stay put during the
  // zoom; their x positions use the animated scale so they glide into place.
  const xTickCount = Math.min(5, visiblePoints.length);
  const xTicks =
    view && visiblePoints.length > 1
      ? Array.from({ length: xTickCount }, (_, i) => {
          const t = view.minDate + ((view.maxDate - view.minDate) * i) / (xTickCount - 1 || 1);
          return { t, label: formatAxisDate(t, view.spanDays) };
        })
      : [];

  const canPlot = view != null && visiblePoints.length > 1;
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const hovered = hoverIndex != null && hoverIndex < coords.length ? coords[hoverIndex] : null;

  function handleMove(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      {canPlot ? (
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
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={tick.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="font-data"
                  fontSize={11}
                  fill="var(--ink-muted)"
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
                fontSize={11}
                fill="var(--ink-muted)"
              >
                {tick.label}
              </text>
            ))}

            <g clipPath={`url(#${clipId})`}>
              <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} />
              {hovered && (
                <>
                  <line
                    x1={hovered.x}
                    x2={hovered.x}
                    y1={PAD_TOP}
                    y2={HEIGHT - PAD_BOTTOM}
                    stroke={lineColor}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    opacity={0.6}
                  />
                  <circle cx={hovered.x} cy={hovered.y} r={4} fill={lineColor} />
                </>
              )}
            </g>
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded border border-line bg-paper-raised px-2 py-1 text-center shadow-sm"
              style={{
                left: `${(hovered.x / WIDTH) * 100}%`,
                top: `${(hovered.y / HEIGHT) * 100 - 2}%`,
              }}
            >
              <p className={`font-data text-sm font-medium ${priceTextClass}`}>
                {priceFormatter.format(hovered.point.price)}
              </p>
              <p className="font-body text-[11px] text-ink-muted">
                {dateFormatter.format(parseLocalDate(hovered.point.date))}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
          {visiblePoints[0] ? (
            <>
              <p className={`font-data text-2xl font-medium ${priceTextClass}`}>
                {priceFormatter.format(visiblePoints[0].price)}
              </p>
              <p className="font-body text-xs text-ink-muted">
                {dateFormatter.format(parseLocalDate(visiblePoints[0].date))}
              </p>
            </>
          ) : (
            <p className="font-body text-sm text-ink-muted">No price data in this range.</p>
          )}
        </div>
      )}

      {showRangeControls && view && (
        <p className="mt-2 font-data text-[11px] text-ink-muted">
          {formatRangeCaption(view.minDate, view.maxDate)}
        </p>
      )}

      {showRangeControls && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          {available.length >= 2 &&
            available.map((o) => {
              const selected = customRange == null && o.key === effectiveRange;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setRange(o.key);
                    setCustomRange(null);
                    setHoverIndex(null);
                  }}
                  className={`rounded px-2.5 py-1 font-body text-xs font-medium transition ${
                    selected
                      ? "bg-ink text-paper"
                      : "border border-line text-ink-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}

          <CustomRangeControl
            isActive={customRange != null}
            onApply={(range) => {
              setCustomRange(range);
              setHoverIndex(null);
            }}
          />
        </div>
      )}

      {source && (
        <p className="mt-2 font-data text-[11px] text-ink-muted">Source: {source}</p>
      )}
    </div>
  );
}
