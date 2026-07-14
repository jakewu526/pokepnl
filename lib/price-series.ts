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

// Most recent known price at or before `dateKey` (value carries forward
// between snapshot dates rather than dropping to zero).
export function priceAsOf(byDate: Map<string, DatedPrice> | undefined, dateKey: string): number | null {
  if (!byDate) return null;
  let best: { date: string; price: number } | null = null;
  for (const [date, entry] of byDate) {
    if (date <= dateKey && (!best || date > best.date)) {
      best = { date, price: entry.price };
    }
  }
  return best?.price ?? null;
}
