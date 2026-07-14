"use client";

import { useMemo, useRef, useState } from "react";
import type { GradePriceSeries } from "@/lib/cards";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const axisDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

// See `new Date("2026-07-12")` comment in PriceChart.tsx -- date-only
// strings need local-calendar parsing, not UTC.
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Fixed order + colors, matching lib/cards.ts's GRADE_DISPLAY_ORDER and the
// --series-* custom properties in app/globals.css (validated for CVD
// separation via the dataviz skill). Order carries the CVD-safety guarantee
// -- never reassign a grade to a different slot.
const GRADE_COLOR_VARS: Record<string, string> = {
  Ungraded: "var(--series-blue)",
  "Grade 7": "var(--series-aqua)",
  "Grade 8": "var(--series-yellow)",
  "Grade 9": "var(--series-green)",
  "Grade 9.5": "var(--series-violet)",
  "PSA 10": "var(--series-red)",
};

const WIDTH = 720;
const HEIGHT = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

export function GradePriceChart({ series }: { series: GradePriceSeries[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleSeries = series.filter((s) => !hidden.has(s.grade));

  const layout = useMemo(() => {
    const allDates = Array.from(
      new Set(visibleSeries.flatMap((s) => s.history.map((p) => p.date)))
    ).sort();
    if (allDates.length === 0) return null;

    const timestamps = allDates.map((d) => parseLocalDate(d).getTime());
    const minDate = Math.min(...timestamps);
    const maxDate = Math.max(...timestamps);
    const allPrices = visibleSeries.flatMap((s) => s.history.map((p) => p.price));
    const maxPriceRaw = Math.max(0, ...allPrices);
    const maxPrice = maxPriceRaw === 0 ? 1 : maxPriceRaw * 1.1;

    const xScale = (t: number) =>
      timestamps.length > 1 && maxDate !== minDate
        ? PAD_LEFT + ((t - minDate) / (maxDate - minDate)) * (WIDTH - PAD_LEFT - PAD_RIGHT)
        : (PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2;

    const yScale = (p: number) =>
      HEIGHT - PAD_BOTTOM - (p / maxPrice) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

    const seriesLines = visibleSeries.map((s) => ({
      grade: s.grade,
      coords: s.history.map((p) => ({
        x: xScale(parseLocalDate(p.date).getTime()),
        y: yScale(p.price),
        point: p,
      })),
    }));

    const priceTicks = 4;
    const yTicks = Array.from({ length: priceTicks + 1 }, (_, i) => {
      const value = (maxPrice / priceTicks) * i;
      return { value, y: yScale(value) };
    });

    const xTickCount = Math.min(5, allDates.length);
    const xTicks =
      allDates.length > 1
        ? Array.from({ length: xTickCount }, (_, i) => {
            const t = minDate + ((maxDate - minDate) * i) / (xTickCount - 1 || 1);
            return { t, x: xScale(t) };
          })
        : [];

    const dateToX = new Map(allDates.map((d) => [d, xScale(parseLocalDate(d).getTime())]));

    return { seriesLines, yTicks, xTicks, allDates, dateToX };
  }, [visibleSeries]);

  if (series.length === 0) {
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-1 rounded-card border border-line bg-paper-raised text-center">
        <p className="font-body text-sm font-medium text-ink">No grade price history yet</p>
        <p className="font-body text-xs text-ink-muted">Prices are captured daily — check back soon.</p>
      </div>
    );
  }

  function toggle(grade: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  }

  function handleMove(clientX: number) {
    const el = containerRef.current;
    if (!el || !layout) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    layout.allDates.forEach((date, i) => {
      const dist = Math.abs((layout.dateToX.get(date) ?? 0) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hoverDate = layout && hoverIndex != null ? layout.allDates[hoverIndex] : null;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      {layout && layout.seriesLines.some((s) => s.coords.length > 1) ? (
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
            {layout.yTicks.map((tick, i) => (
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

            {layout.xTicks.map((tick, i) => (
              <text
                key={i}
                x={tick.x}
                y={HEIGHT - PAD_BOTTOM + 20}
                textAnchor="middle"
                className="font-data"
                fontSize={11}
                fill="var(--ink-muted)"
              >
                {axisDateFormatter.format(new Date(tick.t))}
              </text>
            ))}

            {hoverDate && (
              <line
                x1={layout.dateToX.get(hoverDate) ?? 0}
                x2={layout.dateToX.get(hoverDate) ?? 0}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="var(--ink-muted)"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.4}
              />
            )}

            {layout.seriesLines.map((s) => {
              const pathD = s.coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
              const hoveredCoord =
                hoverIndex != null
                  ? s.coords.find((c) => c.point.date === hoverDate)
                  : undefined;
              return (
                <g key={s.grade}>
                  <path d={pathD} fill="none" stroke={GRADE_COLOR_VARS[s.grade]} strokeWidth={2} />
                  {hoveredCoord && (
                    <circle
                      cx={hoveredCoord.x}
                      cy={hoveredCoord.y}
                      r={4}
                      fill={GRADE_COLOR_VARS[s.grade]}
                      stroke="var(--paper-raised)"
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {hoverDate && (
            <div
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded border border-line bg-paper-raised px-2 py-1.5 shadow-sm"
              style={{ minWidth: "140px" }}
            >
              <p className="mb-1 font-body text-[11px] text-ink-muted">
                {dateFormatter.format(parseLocalDate(hoverDate))}
              </p>
              <div className="flex flex-col gap-0.5">
                {layout.seriesLines.map((s) => {
                  const point = s.coords.find((c) => c.point.date === hoverDate)?.point;
                  if (!point) return null;
                  return (
                    <div key={s.grade} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="flex items-center gap-1.5 text-ink-muted">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: GRADE_COLOR_VARS[s.grade] }}
                        />
                        {s.grade}
                      </span>
                      <span className="font-data font-medium text-ink">
                        {priceFormatter.format(point.price)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center">
          <p className="font-body text-sm text-ink-muted">History builds daily — check back over time.</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-3">
        {series.map((s) => {
          const isHidden = hidden.has(s.grade);
          return (
            <button
              key={s.grade}
              type="button"
              onClick={() => toggle(s.grade)}
              className={`flex flex-col items-start gap-0.5 rounded border px-2.5 py-2 text-left transition ${
                isHidden ? "border-line opacity-40" : "border-line hover:bg-paper"
              }`}
            >
              <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-muted">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: GRADE_COLOR_VARS[s.grade] }}
                />
                {s.grade}
              </span>
              <span className="font-data text-sm font-medium text-ink">
                {s.currentPrice != null ? priceFormatter.format(s.currentPrice) : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
