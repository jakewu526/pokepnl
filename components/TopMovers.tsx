import Link from "next/link";
import Image from "next/image";
import type { Mover } from "@/lib/dashboard";
import { HoloSurface } from "@/components/HoloSurface";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function MoverRow({ mover, positive }: { mover: Mover; positive: boolean }) {
  const href = mover.itemType === "card" ? `/cards/${mover.itemId}` : `/sealed/${mover.itemId}`;
  return (
    <Link href={href} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-paper">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
        {mover.imageUrl && (
          <Image src={mover.imageUrl} alt={mover.name} fill sizes="40px" className="object-contain" />
        )}
      </div>
      <span className="flex-1 truncate font-body text-sm text-ink">{mover.name}</span>
      <span className={`shrink-0 font-data text-xs font-medium ${positive ? "text-emerald-strong" : "text-amber"}`}>
        {positive ? "+" : ""}
        {priceFormatter.format(mover.changeAbs)} · {positive ? "+" : ""}
        {percentFormatter.format(mover.changePct)}
      </span>
    </Link>
  );
}

// Biggest 30-day gainers/losers in the user's holdings -- the widget that
// answers "what should I list this week" rather than just "what's it worth."
// The #1 gainer gets the holo treatment -- the dashboard's signature device
// is reserved for exactly two spots (the hero and here), so it stays a
// highlight rather than becoming visual noise.
export function TopMovers({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
  if (gainers.length === 0 && losers.length === 0) return null;
  const [topGainer, ...restGainers] = gainers;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <h3 className="mb-2 font-body text-sm font-medium text-ink-muted">Top movers · 30d</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-body text-xs font-medium text-ink-muted">Gainers</p>
          {gainers.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {topGainer && (
                <HoloSurface className="rounded">
                  <MoverRow mover={topGainer} positive />
                </HoloSurface>
              )}
              {restGainers.map((m) => (
                <MoverRow key={`${m.itemType}-${m.itemId}`} mover={m} positive />
              ))}
            </div>
          ) : (
            <p className="font-body text-xs text-ink-muted">No gainers in this window.</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-body text-xs font-medium text-ink-muted">Losers</p>
          {losers.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {losers.map((m) => (
                <MoverRow key={`${m.itemType}-${m.itemId}`} mover={m} positive={false} />
              ))}
            </div>
          ) : (
            <p className="font-body text-xs text-ink-muted">No losers in this window.</p>
          )}
        </div>
      </div>
    </div>
  );
}
