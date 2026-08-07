import type { Slice } from "@/lib/dashboard";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const BAR_COLORS = ["var(--series-blue)", "var(--series-aqua)", "var(--series-yellow)", "var(--series-green)", "var(--series-violet)"];

function BarRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 font-body text-xs text-ink-muted">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-data text-ink">
          {priceFormatter.format(value)} · {percentFormatter.format(pct)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line/40">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(pct * 100, value > 0 ? 1 : 0)}%`, background: color }}
        />
      </div>
    </div>
  );
}

// Concentration risk: what fraction of portfolio value sits in sealed vs
// singles, and in the top individual holdings.
export function AllocationBars({ byType, topHoldings }: { byType: Slice[]; topHoldings: Slice[] }) {
  const hasData = byType.some((s) => s.value > 0);
  if (!hasData) return null;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <h3 className="mb-2 font-body text-sm font-medium text-ink-muted">Allocation</h3>
      <div className="flex flex-col gap-2">
        {byType.map((s, i) => (
          <BarRow key={s.label} label={s.label} value={s.value} pct={s.pct} color={BAR_COLORS[i % BAR_COLORS.length]} />
        ))}
      </div>
      {topHoldings.length > 0 && (
        <>
          <p className="mb-2 mt-4 font-body text-xs font-medium text-ink-muted">Top holdings</p>
          <div className="flex flex-col gap-2">
            {topHoldings.map((s, i) => (
              <BarRow
                key={`${s.label}-${i}`}
                label={s.label}
                value={s.value}
                pct={s.pct}
                color={BAR_COLORS[i % BAR_COLORS.length]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
