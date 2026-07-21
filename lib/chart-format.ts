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

// Inverse of parseLocalDate: a Date's local calendar day as "YYYY-MM-DD",
// matching both PricePoint's date format and <input type="date"> values.
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parses a hand-typed "M/D/YYYY" or "MM/DD/YYYY" date into the internal
// "YYYY-MM-DD" key, or null if it isn't a real calendar date (bad month/day,
// non-numeric, wrong shape). Rejects rollovers like "02/30/2025" rather than
// letting `Date` silently normalize them to March 2nd.
export function parseTypedDate(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return toDateKey(date);
}

// Inverse of parseTypedDate, for echoing a calendar-picked date back into the
// typed field as "MM/DD/YYYY".
export function formatTypedDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${month}/${day}/${year}`;
}

// Resolves the two hand-typed range fields into a usable {start, end} pair, or
// an error message covering every way the input can be unusable: missing,
// unparsable, in the future, or reversed.
export function resolveCustomRange(
  startText: string,
  endText: string,
  todayKey: string
): { start: string; end: string } | { error: string } {
  if (!startText.trim() || !endText.trim()) return { error: "Enter a start and end date." };
  const start = parseTypedDate(startText);
  const end = parseTypedDate(endText);
  if (!start || !end) return { error: "Enter valid dates (MM/DD/YYYY)." };
  if (start > todayKey || end > todayKey) return { error: "Dates can't be in the future." };
  if (start > end) return { error: "Start date must be before end date." };
  return { start, end };
}

// Mirrors resolveCustomRange but for a single hand-typed date (no ordering check).
export function resolveSpecificDate(
  text: string,
  todayKey: string
): { date: string } | { error: string } {
  if (!text.trim()) return { error: "Enter a date." };
  const date = parseTypedDate(text);
  if (!date) return { error: "Enter a valid date (MM/DD/YYYY)." };
  if (date > todayKey) return { error: "Date can't be in the future." };
  return { date };
}

// Index of the date in `dates` nearest to `targetTs` (by absolute day
// distance), or null if `dates` is empty. Used both to snap a raw typed date
// to a real data point, and to re-locate that resolved date inside a
// filtered/visible subset (e.g. after hiding a grade).
export function findNearestDateIndex(dates: string[], targetTs: number): number | null {
  if (dates.length === 0) return null;
  let nearestIndex = 0;
  let nearestDist = Infinity;
  dates.forEach((d, i) => {
    const dist = Math.abs(parseLocalDate(d).getTime() - targetTs);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  });
  return nearestIndex;
}
