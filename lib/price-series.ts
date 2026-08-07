// Shared by lib/portfolio.ts and lib/watchlist.ts: both build a per-day
// value-over-time series from raw PriceSnapshot rows for a set of owned (or
// watched) cards/sealed products, preferring one source over another when
// multiple captured a price on the same day.

export type DatedPrice = { price: number; source: string };
// entityId -> dateKey -> price on that date (deduped to one preferred source)
export type PriceSeries = Map<string, Map<string, DatedPrice>>;

export function buildSeries<Row extends { price: string; capturedDate: Date; source: string }>(
  rows: Row[],
  idOf: (row: Row) => string,
  preferredSource: string
): PriceSeries {
  const series: PriceSeries = new Map();
  for (const row of rows) {
    const id = idOf(row);
    const dateKey = row.capturedDate.toISOString().slice(0, 10);
    let byDate = series.get(id);
    if (!byDate) {
      byDate = new Map();
      series.set(id, byDate);
    }
    const existing = byDate.get(dateKey);
    if (existing && existing.source === preferredSource && row.source !== preferredSource) {
      continue; // keep the preferred-source price already recorded for this date
    }
    byDate.set(dateKey, { price: parseFloat(row.price), source: row.source });
  }
  return series;
}

// Sorted-keys cache, keyed by the byDate Map identity: getPortfolioData calls
// priceAsOf once per (item, date) pair against the *same* Map for a given
// item, so a one-time O(n log n) sort per item turns each lookup below into
// O(log n) instead of the O(n) linear scan this used to be -- portfolio value
// history is already O(items x dates), so an O(n) priceAsOf made it
// effectively O(items x dates^2).
const sortedKeysCache = new WeakMap<Map<string, DatedPrice>, string[]>();

function getSortedKeys(byDate: Map<string, DatedPrice>): string[] {
  let keys = sortedKeysCache.get(byDate);
  if (!keys) {
    keys = Array.from(byDate.keys()).sort();
    sortedKeysCache.set(byDate, keys);
  }
  return keys;
}

// Most recent known price at or before `dateKey` (value carries forward
// between snapshot dates rather than dropping to zero).
export function priceAsOf(byDate: Map<string, DatedPrice> | undefined, dateKey: string): number | null {
  if (!byDate) return null;
  const keys = getSortedKeys(byDate);
  let lo = 0;
  let hi = keys.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= dateKey) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best === -1 ? null : byDate.get(keys[best])!.price;
}
