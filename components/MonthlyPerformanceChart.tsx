"use client";

import { useState } from "react";
import type { MonthlyPerformance } from "@/lib/dashboard";
import { CHART } from "@/lib/chart-theme";
import { ChartTooltip } from "./ChartTooltip";
import { ChartEmptyState } from "./ChartEmptyState";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

const WIDTH = 720;
const HEIGHT = 240;
const { left: PAD_LEFT, right: PAD_RIGHT, top: PAD_TOP, bottom: PAD_BOTTOM } = CHART.pad;

// Grouped revenue/net-profit bars per month, with units sold as a caption on
// hover -- the cumulative realized-profit line elsewhere hides seasonality
// (whether this month beat last month); bars don't.
export function MonthlyPerformanceChart({ months }: { months: MonthlyPerformance[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const hasData = months.some((m) => m.revenue !== 0 || m.netProfit !== 0);
  if (!hasData) {
    return (
      <ChartEmptyState title="No sales yet" subtitle="Sold items will show up here by month." height={HEIGHT} />
    );
  }

  const allValues = months.flatMap((m) => [m.revenue, m.netProfit, 0]);
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const maxAbs = Math.max(maxValue, Math.abs(minValue), 1);
  const yScale = (v: number) =>
    HEIGHT - PAD_BOTTOM - ((v - minValue) / (maxAbs - minValue || 1)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const zeroY = yScale(0);

  const groupWidth = (WIDTH - PAD_LEFT - PAD_RIGHT) / months.length;
  const barWidth = Math.min(18, groupWidth * 0.28);
  const barGap = 4;

  const priceTicks = 4;
  const yTicks = Array.from({ length: priceTicks + 1 }, (_, i) => {
    const value = minValue + ((maxAbs - minValue) / priceTicks) * i;
    return { value, y: yScale(value) };
  });

  const hovered = hoverIndex != null ? months[hoverIndex] : null;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: "auto" }}>
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

          {months.map((m, i) => {
            const groupX = PAD_LEFT + groupWidth * i;
            const centerX = groupX + groupWidth / 2;
            const revenueX = centerX - barWidth - barGap / 2;
            const profitX = centerX + barGap / 2;
            const revenueY = Math.min(zeroY, yScale(m.revenue));
            const revenueH = Math.abs(zeroY - yScale(m.revenue));
            const profitY = Math.min(zeroY, yScale(m.netProfit));
            const profitH = Math.abs(zeroY - yScale(m.netProfit));
            const [, monthNum] = m.month.split("-");
            const label = monthFormatter.format(new Date(2000, Number(monthNum) - 1, 1));

            return (
              <g
                key={m.month}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex((prev) => (prev === i ? null : prev))}
              >
                <rect x={groupX} y={PAD_TOP} width={groupWidth} height={HEIGHT - PAD_TOP - PAD_BOTTOM} fill="transparent" />
                <rect
                  x={revenueX}
                  y={revenueY}
                  width={barWidth}
                  height={Math.max(revenueH, m.revenue !== 0 ? 1 : 0)}
                  fill={CHART.role.revenue}
                  opacity={hoverIndex == null || hoverIndex === i ? 1 : 0.4}
                  className="grow-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                />
                <rect
                  x={profitX}
                  y={profitY}
                  width={barWidth}
                  height={Math.max(profitH, m.netProfit !== 0 ? 1 : 0)}
                  fill={m.netProfit < 0 ? CHART.role.loss : CHART.role.profit}
                  opacity={hoverIndex == null || hoverIndex === i ? 1 : 0.4}
                  className="grow-up"
                  style={{ animationDelay: `${i * 30 + 15}ms` }}
                />
                <text
                  x={centerX}
                  y={HEIGHT - PAD_BOTTOM + 20}
                  textAnchor="middle"
                  className="font-data"
                  fontSize={CHART.axis.fontSize}
                  fill={CHART.axis.fill}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered && (
          <ChartTooltip
            title={`${monthFormatter.format(new Date(2000, Number(hovered.month.split("-")[1]) - 1, 1))} ${hovered.month.split("-")[0]}`}
            className="right-2 top-2"
            rows={[
              {
                label: "Revenue",
                value: priceFormatter.format(hovered.revenue),
                swatch: { color: CHART.role.revenue },
              },
              {
                label: "Net profit",
                value: priceFormatter.format(hovered.netProfit),
                swatch: { color: hovered.netProfit < 0 ? CHART.role.loss : CHART.role.profit },
              },
              { label: "Units sold", value: String(hovered.units) },
            ]}
          />
        )}
      </div>
    </div>
  );
}
