// Shared visual language for the dashboard's hand-rolled SVG charts
// (ValueVsCostChart, MonthlyPerformanceChart) -- axis/grid treatment and,
// critically, fixed color *roles* rather than each chart picking its own.
// Emerald means value/profit and amber means cost/loss everywhere on the
// dashboard, full stop; --series-blue is reserved for revenue, which is
// neither a gain nor a loss on its own.
export const CHART = {
  axis: { fontSize: 11, fill: "var(--ink-muted)" },
  grid: { stroke: "var(--line)", strokeWidth: 1, opacity: 0.6 },
  role: {
    value: "var(--emerald)",
    cost: "var(--ink-muted)",
    revenue: "var(--series-blue)",
    profit: "var(--emerald)",
    loss: "var(--amber)",
  },
  pad: { left: 76, right: 20, top: 16, bottom: 32 },
} as const;
