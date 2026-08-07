import type { PricePoint } from "@/lib/cards";

const WIDTH = 120;
const HEIGHT = 32;
const PAD = 2;

// Tiny inline trend line for the pulse hero -- no axes, no ticks, no hover.
// pathLength={1} lets the shared .draw-in keyframe (app/globals.css) use a
// fixed dasharray of 1 rather than needing to measure the real path length.
export function Sparkline({
  points,
  tone,
  className = "",
}: {
  points: PricePoint[];
  tone: "positive" | "negative" | "neutral";
  className?: string;
}) {
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo;

  const xScale = (i: number) => PAD + (i / (points.length - 1)) * (WIDTH - PAD * 2);
  const yScale = (v: number) => (span > 0 ? HEIGHT - PAD - ((v - lo) / span) * (HEIGHT - PAD * 2) : HEIGHT / 2);

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(2)} ${yScale(p.price).toFixed(2)}`)
    .join(" ");

  const stroke = tone === "positive" ? "var(--emerald)" : tone === "negative" ? "var(--amber)" : "var(--ink-muted)";

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="draw-in"
      />
    </svg>
  );
}
