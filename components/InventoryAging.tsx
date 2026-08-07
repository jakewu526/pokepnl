import type { AgingBucket } from "@/lib/dashboard";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Aqua/blue/yellow for the first three (increasingly aged) buckets, amber
// for 180+ -- reusing amber's existing "needs attention" role app-wide
// rather than inventing a fifth arbitrary color for "oldest stock".
const BUCKET_COLORS = ["var(--series-aqua)", "var(--series-blue)", "var(--series-yellow)", "var(--amber)"];

// Shows dead stock: how much capital (cost basis) sits in each holding-period
// bucket, from CollectionItem.createdAt. Ops-zone density: one stacked strip
// instead of four separate bar tiles.
export function InventoryAging({ buckets }: { buckets: AgingBucket[] }) {
  const totalItems = buckets.reduce((sum, b) => sum + b.itemCount, 0);
  if (totalItems === 0) return null;

  const totalCostBasis = buckets.reduce((sum, b) => sum + b.costBasis, 0);

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <h3 className="mb-3 font-body text-sm font-medium text-ink-muted">Inventory aging</h3>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-line/30">
        {buckets.map((b, i) => {
          const pct = totalCostBasis > 0 ? (b.costBasis / totalCostBasis) * 100 : 0;
          return pct > 0 ? (
            <div
              key={b.bucket}
              className="rise-in h-full"
              style={{ width: `${pct}%`, background: BUCKET_COLORS[i % BUCKET_COLORS.length], animationDelay: `${i * 40}ms` }}
              title={`${b.bucket}: ${priceFormatter.format(b.costBasis)}`}
            />
          ) : null;
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {buckets.map((b, i) => (
          <div key={b.bucket} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate font-body text-xs text-ink-muted">{b.bucket}</p>
              <p className="font-data text-xs font-medium text-ink">
                {priceFormatter.format(b.costBasis)} · {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
