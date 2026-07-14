import type { PricePoint } from "@/lib/cards";

// PriceCharting's public history is monthly, so short ranges (a week, a month)
// would otherwise render as a flat line -- there simply aren't intermediate
// real captures. This fills the gaps with SYNTHETIC interpolated points so the
// chart reads sensibly at every zoom level, while leaving the real monthly
// anchors exactly as captured (the latest point, i.e. the current price, is
// always a real anchor).
//
// IMPORTANT: the in-between points are generated (linear trend between real
// anchors + a small deterministic wiggle), not real market observations. This
// is a display-time transform only -- nothing is written to the database, and
// removing the densify* calls in the data layer reverts to raw data.
//
// Cadence (age measured back from the most recent point):
//   <= 7 days   -> daily
//   <= 30 days  -> every 3 days
//   <= 60 days  -> every 6 days
//   <= 365 days -> weekly
//   > 365 days  -> real monthly anchors only (unchanged)

const DAY_MS = 86_400_000;
const DAILY_VOL = 0.006; // ~0.6% per-step wiggle
const MEAN_REVERT = 0.82; // pull the wiggle back toward the trend
const MAX_DEV = 0.02; // clamp wiggle to +/-2% of the trend line

// Deterministic PRNG (mulberry32) seeded from a string, so a given series
// always densifies to the same shape across requests/renders.
function makeRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocal(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Cadence step (in days) for a point `ageDays` old relative to the latest point.
function stepForAge(ageDays: number): number {
  if (ageDays < 7) return 1;
  if (ageDays < 30) return 3;
  if (ageDays < 60) return 6;
  return 7;
}

export function densifyHistory(points: PricePoint[], seed: string): PricePoint[] {
  if (points.length < 2) return points;

  const anchors = points
    .map((p) => ({ t: parseLocal(p.date), price: p.price }))
    .sort((a, b) => a.t - b.t);
  const firstT = anchors[0].t;
  const lastT = anchors[anchors.length - 1].t;

  // Linear-interpolated trend price at time `t` between the surrounding anchors.
  let anchorIdx = 0;
  const trendAt = (t: number): number => {
    while (anchorIdx < anchors.length - 1 && anchors[anchorIdx + 1].t <= t) anchorIdx++;
    while (anchorIdx > 0 && anchors[anchorIdx].t > t) anchorIdx--;
    const lo = anchors[anchorIdx];
    const hi = anchors[Math.min(anchorIdx + 1, anchors.length - 1)];
    if (hi.t === lo.t) return lo.price;
    const frac = (t - lo.t) / (hi.t - lo.t);
    return lo.price + (hi.price - lo.price) * Math.max(0, Math.min(1, frac));
  };

  // Collect synthetic target dates (within the last year, at the bucketed
  // cadence) that don't already have a real anchor.
  const anchorKeys = new Set(points.map((p) => p.date));
  const syntheticTimes: number[] = [];
  for (let ageDays = 1; ageDays <= 365; ageDays += stepForAge(ageDays)) {
    const t = lastT - ageDays * DAY_MS;
    if (t < firstT) break;
    if (anchorKeys.has(toDateKey(t))) continue;
    syntheticTimes.push(t);
  }
  syntheticTimes.sort((a, b) => a - b);

  // Walk the synthetic points chronologically so the wiggle is continuous.
  const rng = makeRng(seed);
  let dev = 0;
  const merged = new Map<string, number>();
  for (const p of points) merged.set(p.date, p.price); // real anchors win
  for (const t of syntheticTimes) {
    dev = dev * MEAN_REVERT + (rng() * 2 - 1) * DAILY_VOL;
    dev = Math.max(-MAX_DEV, Math.min(MAX_DEV, dev));
    const base = trendAt(t);
    const price = Math.max(base * 0.5, base * (1 + dev));
    const key = toDateKey(t);
    if (!merged.has(key)) merged.set(key, Math.round(price * 100) / 100);
  }

  return Array.from(merged.entries())
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => parseLocal(a.date) - parseLocal(b.date));
}
