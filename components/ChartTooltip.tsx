import type { CSSProperties, ReactNode } from "react";

type Row = { label: string; value: string; swatch?: { color: string; filled?: boolean } };

// Shared hover-tooltip shell for the hand-rolled SVG charts. Positioning is
// left entirely to the caller via `className`/`style` -- ValueVsCostChart
// tracks the hovered point (centered above it), MonthlyPerformanceChart pins
// to a fixed corner -- only the box, title, and swatch+label+value row
// markup is common between them.
export function ChartTooltip({
  title,
  rows,
  className = "",
  style,
}: {
  title: string;
  rows: Row[];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`pointer-events-none absolute rounded border border-line bg-paper-raised px-2 py-1.5 shadow-sm ${className}`}
      style={style}
    >
      <p className="mb-1 font-body text-[11px] text-ink-muted">{title}</p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-ink-muted">
            {row.swatch && <Swatch color={row.swatch.color} filled={row.swatch.filled} />}
            {row.label}
          </span>
          <span className="font-data font-medium text-ink">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function Swatch({ color, filled = true }: { color: string; filled?: boolean }): ReactNode {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={filled ? { background: color } : { border: `1.5px solid ${color}` }}
    />
  );
}
