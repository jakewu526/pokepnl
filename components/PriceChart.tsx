"use client";

import { useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/cards";

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

// `new Date("2026-07-12")` parses as UTC midnight, which formats as the
// previous calendar day in any timezone behind UTC. Points carry
// date-only strings, so parse them as local calendar dates instead.
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const WIDTH = 720;
const HEIGHT = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

export function PriceChart({
  points,
  source,
  negative = false,
}: {
  points: PricePoint[];
  source: string | null;
  negative?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const lineColor = negative ? "var(--amber)" : "var(--emerald)";
  const priceTextClass = negative ? "text-amber" : "text-emerald-strong";

  const layout = useMemo(() => {
    if (points.length === 0) return null;

    const dates = points.map((p) => parseLocalDate(p.date).getTime());
    const prices = points.map((p) => p.price);
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    // Prices are conventionally shown from a $0 baseline, but a profit
    // series can go negative -- extend the floor to fit the lowest value
    // when it does, rather than clipping/inverting negative points.
    const minPriceRaw = Math.min(0, ...prices);
    const minPrice = minPriceRaw < 0 ? minPriceRaw * 1.1 : 0;
    const maxPriceRaw = Math.max(0, ...prices);
    const maxPrice = maxPriceRaw === 0 ? 1 : maxPriceRaw * 1.1;

    const xScale = (t: number) =>
      dates.length > 1 && maxDate !== minDate
        ? PAD_LEFT + ((t - minDate) / (maxDate - minDate)) * (WIDTH - PAD_LEFT - PAD_RIGHT)
        : (PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2;

    const yScale = (p: number) =>
      HEIGHT -
      PAD_BOTTOM -
      ((p - minPrice) / (maxPrice - minPrice)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

    const coords = points.map((p, i) => ({
      x: xScale(dates[i]),
      y: yScale(p.price),
      point: p,
    }));

    const priceTicks = 4;
    const yTicks = Array.from({ length: priceTicks + 1 }, (_, i) => {
      const value = minPrice + ((maxPrice - minPrice) / priceTicks) * i;
      return { value, y: yScale(value) };
    });

    const xTickCount = Math.min(5, dates.length);
    const xTicks =
      dates.length > 1
        ? Array.from({ length: xTickCount }, (_, i) => {
            const t = minDate + ((maxDate - minDate) * i) / (xTickCount - 1 || 1);
            return { t, x: xScale(t) };
          })
        : [];

    return { coords, yTicks, xTicks, minDate, maxDate };
  }, [points]);

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

  if (points.length === 1 || !layout) {
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

  const { coords, yTicks, xTicks } = layout;
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const hovered = hoverIndex != null ? coords[hoverIndex] : null;

  function handleMove(clientX: number) {
    const el = containerRef.current;
    if (!el || !layout) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    layout.coords.forEach((c, i) => {
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
      {source && (
        <p className="mt-2 font-data text-[11px] text-ink-muted">Source: {source}</p>
      )}
    </div>
  );
}
