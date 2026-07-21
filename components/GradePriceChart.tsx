"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { GradePriceSeries } from "@/lib/cards";
import {
  type RangeKey,
  defaultRangeKey,
  filterPointsToRange,
  findNearestDateIndex,
  formatAxisDate,
  formatRangeCaption,
  getAvailableRanges,
  parseLocalDate,
} from "@/lib/chart-format";
import { ChartDateControl } from "./ChartDateControl";
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
const PAD_LEFT = 76;
const PAD_RIGHT = 20;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

export function GradePriceChart({ series }: { series: GradePriceSeries[] }) {
  const clipId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<RangeKey | null>(null);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [lookupDate, setLookupDate] = useState<string | null>(null);

  // Ranges offered depend on the full history across every grade, so the
  // buttons don't change as grades are hidden/shown.
  const allDates = useMemo(
    () => series.flatMap((s) => s.history.map((p) => p.date)),
    [series]
  );
  const available = useMemo(() => getAvailableRanges(allDates), [allDates]);
  const effectiveRange: RangeKey =
    range && available.some((o) => o.key === range) ? range : defaultRangeKey(available);
  const maxTs = useMemo(
    () => (allDates.length ? Math.max(...allDates.map((d) => parseLocalDate(d).getTime())) : 0),
    [allDates]
  );

  // Resolve a typed lookup date to the nearest actual data point across every
  // grade (regardless of hidden state), so the centered window and the
  // pinned dot both key off a real snapshot.
  const resolvedLookupDate = useMemo(() => {
    if (!lookupDate) return null;
    const idx = findNearestDateIndex(allDates, parseLocalDate(lookupDate).getTime());
    return idx != null ? allDates[idx] : null;
  }, [lookupDate, allDates]);

  const rangedSeries = useMemo(() => {
    if (resolvedLookupDate) {
      const centerTs = parseLocalDate(resolvedLookupDate).getTime();
      const startTs = centerTs - 15 * DAY_MS;
      const endTs = centerTs + 15 * DAY_MS;
      return series.map((s) => ({
        ...s,
        history: s.history.filter((p) => {
          const t = parseLocalDate(p.date).getTime();
          return t >= startTs && t <= endTs;
        }),
      }));
    }
    if (customRange) {
      const startTs = parseLocalDate(customRange.start).getTime();
      const endTs = parseLocalDate(customRange.end).getTime();
      return series.map((s) => ({
        ...s,
        history: s.history.filter((p) => {
          const t = parseLocalDate(p.date).getTime();
          return t >= startTs && t <= endTs;
        }),
      }));
    }
    return series.map((s) => ({
      ...s,
      history: filterPointsToRange(s.history, effectiveRange, maxTs),
    }));
  }, [series, effectiveRange, maxTs, customRange, resolvedLookupDate]);

  const visibleSeries = rangedSeries.filter((s) => !hidden.has(s.grade));

  // Static domain of the selected range (stable during the zoom animation).
  const view = useMemo(() => {
    const dates = Array.from(
      new Set(visibleSeries.flatMap((s) => s.history.map((p) => p.date)))
    ).sort();
    if (dates.length === 0) return null;
    const timestamps = dates.map((d) => parseLocalDate(d).getTime());
    const minDate = Math.min(...timestamps);
    const maxDate = Math.max(...timestamps);
    const allPrices = visibleSeries.flatMap((s) => s.history.map((p) => p.price));
    // Tighten the y-axis to the visible grades' price range so short-range
    // moves stay legible; when a single grade is isolated it zooms right in.
    const lo = Math.min(...allPrices);
    const hi = Math.max(...allPrices);
    const span = hi - lo;
    const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(hi) * 0.05, 1);
    let minPrice = Math.max(0, lo - pad);
    let maxPrice = hi + pad;
    if (maxPrice <= minPrice) maxPrice = minPrice + 1;
    return { dates, minDate, maxDate, minPrice, maxPrice, spanDays: (maxDate - minDate) / DAY_MS };
  }, [visibleSeries]);

  const { domain: animated, from, animating } = useAnimatedDomain(
    view ?? { minDate: 0, maxDate: 1, minPrice: 0, maxPrice: 1 }
  );

  // During a transition render the wider (previous ∪ target) span so a zoom-in
  // keeps every line spanning full width instead of flashing empty space.
  const renderMinDate = animating
    ? Math.min(from.minDate, view?.minDate ?? from.minDate)
    : view?.minDate ?? Number.NEGATIVE_INFINITY;
  const renderSeries = useMemo(
    () =>
      series
        .filter((s) => !hidden.has(s.grade))
        .map((s) => ({
          ...s,
          history: s.history.filter((p) => parseLocalDate(p.date).getTime() >= renderMinDate),
        })),
    [series, hidden, renderMinDate]
  );

  // Which visible date the lookup date's dot should pin to. Uses nearest (not
  // exact) match against view.dates so that if the resolved snapshot exists
  // only on a currently-hidden grade, the pin still lands on the closest
  // still-visible date instead of disappearing.
  const pinnedIndex = useMemo(() => {
    if (!resolvedLookupDate || !view) return null;
    return findNearestDateIndex(view.dates, parseLocalDate(resolvedLookupDate).getTime());
  }, [view, resolvedLookupDate]);

  if (series.length === 0) {
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-1 rounded-card border border-line bg-paper-raised text-center">
        <p className="font-body text-sm font-medium text-ink">No grade price history yet</p>
        <p className="font-body text-xs text-ink-muted">Prices are captured daily — check back soon.</p>
      </div>
    );
  }

  const { minDate, maxDate, minPrice, maxPrice } = animated;
  const xScale = (t: number) =>
    maxDate !== minDate
      ? PAD_LEFT + ((t - minDate) / (maxDate - minDate)) * (WIDTH - PAD_LEFT - PAD_RIGHT)
      : (PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2;
  const yScale = (p: number) =>
    HEIGHT - PAD_BOTTOM - ((p - minPrice) / (maxPrice - minPrice)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const visibleDates = view ? view.dates : [];
  const seriesLines = renderSeries.map((s) => ({
    grade: s.grade,
    coords: s.history.map((p) => ({
      x: xScale(parseLocalDate(p.date).getTime()),
      y: yScale(p.price),
      point: p,
    })),
  }));
  const dateToX = new Map(visibleDates.map((d) => [d, xScale(parseLocalDate(d).getTime())]));

  const priceTicks = 4;
  const yTicks = Array.from({ length: priceTicks + 1 }, (_, i) => {
    const value = minPrice + ((maxPrice - minPrice) / priceTicks) * i;
    return { value, y: yScale(value) };
  });

  const xTickCount = Math.min(5, visibleDates.length);
  const xTicks =
    view && visibleDates.length > 1
      ? Array.from({ length: xTickCount }, (_, i) => {
          const t = view.minDate + ((view.maxDate - view.minDate) * i) / (xTickCount - 1 || 1);
          return { t, label: formatAxisDate(t, view.spanDays) };
        })
      : [];

  const canPlot = seriesLines.some((s) => s.coords.length > 1);
  const activeIndex = hoverIndex ?? pinnedIndex;
  const hoverDate =
    activeIndex != null && activeIndex < visibleDates.length ? visibleDates[activeIndex] : null;

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
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    visibleDates.forEach((date, i) => {
      const dist = Math.abs((dateToX.get(date) ?? 0) - relX);
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
              {hoverDate && (
                <line
                  x1={dateToX.get(hoverDate) ?? 0}
                  x2={dateToX.get(hoverDate) ?? 0}
                  y1={PAD_TOP}
                  y2={HEIGHT - PAD_BOTTOM}
                  stroke="var(--ink-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.4}
                />
              )}

              {seriesLines.map((s) => {
                const pathD = s.coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
                const hoveredCoord =
                  hoverDate != null ? s.coords.find((c) => c.point.date === hoverDate) : undefined;
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
            </g>
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
                {seriesLines.map((s) => {
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

      {view && (
        <p className="mt-2 font-data text-[11px] text-ink-muted">
          {formatRangeCaption(view.minDate, view.maxDate)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        {available.length >= 2 &&
          available.map((o) => {
            const selected = customRange == null && lookupDate == null && o.key === effectiveRange;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setRange(o.key);
                  setCustomRange(null);
                  setLookupDate(null);
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

        <ChartDateControl
          isRangeActive={customRange != null}
          isDayActive={lookupDate != null}
          onApply={(result) => {
            if (result.kind === "range") {
              setCustomRange(result);
              setLookupDate(null);
            } else {
              setLookupDate(result.date);
              setCustomRange(null);
            }
            setHoverIndex(null);
          }}
        />
      </div>

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
