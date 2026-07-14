// Shared, framework-agnostic helpers for the price charts (PriceChart,
// GradePriceChart). Kept free of server-only imports so client components can
// use it directly.

const DAY_MS = 86_400_000;

export type RangeKey = "1W" | "30D" | "60D" | "6M" | "1Y" | "5Y" | "ALL";

export const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
  { key: "1W", label: "1W", days: 7 },
  { key: "30D", label: "30D", days: 30 },
  { key: "60D", label: "60D", days: 60 },
  { key: "6M", label: "6M", days: 182 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "5Y", label: "5Y", days: 1825 },
  { key: "ALL", label: "All", days: Infinity },
];

// `new Date("2026-07-12")` parses as UTC midnight, which formats as the
// previous calendar day in any timezone behind UTC. Points carry date-only
// strings, so parse them as local calendar dates instead.
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// The subset of ranges a dataset can meaningfully offer: every fixed range
// shorter than the total history span, plus "All". A range equal to (or longer
// than) the full span is dropped so it doesn't duplicate "All" -- this is what
// hides e.g. "5Y" for a card with only a few months of history.
export function getAvailableRanges(
  dates: string[]
): { key: RangeKey; label: string; days: number }[] {
  if (dates.length === 0) return [];
  const timestamps = dates.map((d) => parseLocalDate(d).getTime());
  const totalSpanDays = (Math.max(...timestamps) - Math.min(...timestamps)) / DAY_MS;
  const fixed = RANGE_OPTIONS.filter((o) => o.days !== Infinity && o.days < totalSpanDays);
  const all = RANGE_OPTIONS[RANGE_OPTIONS.length - 1];
  return [...fixed, all];
}

// Default to a 1-year window when available, otherwise show everything.
export function defaultRangeKey(
  available: { key: RangeKey }[]
): RangeKey {
  return available.some((o) => o.key === "1Y") ? "1Y" : "ALL";
}

// Filter to the selected range, anchored to the newest point so "last week"
// always shows the most recent week of real data rather than a window relative
// to today (which could be empty if snapshots lag).
export function filterPointsToRange<T extends { date: string }>(
  points: T[],
  key: RangeKey,
  maxTs: number
): T[] {
  const option = RANGE_OPTIONS.find((o) => o.key === key);
  if (!option || option.days === Infinity) return points;
  const cutoff = maxTs - option.days * DAY_MS;
  return points.filter((p) => parseLocalDate(p.date).getTime() >= cutoff);
}

const monthDayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
const fullFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

// Adaptive x-axis tick label. Short windows show month + day; multi-month
// windows add an abbreviated year ("Jul '25") so a long history no longer reads
// as a single ambiguous year; multi-year windows collapse to just the year.
export function formatAxisDate(ts: number, spanDays: number): string {
  const d = new Date(ts);
  if (spanDays <= 45) return monthDayFormatter.format(d);
  if (spanDays <= 730) return `${monthFormatter.format(d)} '${String(d.getFullYear()).slice(-2)}`;
  return String(d.getFullYear());
}

// The exact visible span, shown as a caption so the amount of data on screen is
// unambiguous, e.g. "Jul 8, 2025 – Jul 14, 2026".
export function formatRangeCaption(minTs: number, maxTs: number): string {
  const start = fullFormatter.format(new Date(minTs));
  const end = fullFormatter.format(new Date(maxTs));
  return start === end ? start : `${start} – ${end}`;
}
