import Image from "next/image";
import Link from "next/link";
import type { SetListItem } from "@/lib/sets";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function SetTile({ set }: { set: SetListItem }) {
  const isUpcoming = set.releaseDate != null && new Date(set.releaseDate) > new Date();
  const percent =
    set.totalCards && set.totalCards > 0
      ? Math.min(100, Math.round((set.ownedCount / set.totalCards) * 100))
      : 0;

  return (
    <Link
      href={`/sets/${set.id}`}
      className="flex flex-col gap-3 rounded-card border border-line bg-paper-raised p-4 transition-shadow hover:shadow-[0_2px_0_var(--line)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="relative h-12 w-28 shrink-0">
          {set.logoUrl ? (
            <Image
              src={set.logoUrl}
              alt={set.name}
              fill
              sizes="112px"
              className="object-contain object-left"
            />
          ) : (
            <div className="flex h-full w-fit items-center rounded-md bg-line/40 px-2 font-data text-xs font-medium text-ink-muted">
              {set.code ?? set.name}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">{set.name}</h2>
        <p className="font-data text-xs text-ink-muted">
          {set.code && <>{set.code} · </>}
          {set.releaseDate ? dateFormatter.format(new Date(set.releaseDate)) : "Release date unknown"}
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3">
        {isUpcoming || !set.totalCards ? (
          <p className="font-body text-[13px] text-ink-muted">
            {isUpcoming ? "Coming soon…" : "No cards yet"}
          </p>
        ) : (
          <div className="flex-1">
            <div className="flex items-baseline justify-between font-data text-xs text-ink-muted">
              <span>
                {set.ownedCount}/{set.totalCards}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-emerald"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
        <p className="shrink-0 font-data text-sm font-medium text-emerald-strong">
          {set.price != null ? priceFormatter.format(set.price) : "$—"}
        </p>
      </div>
    </Link>
  );
}
