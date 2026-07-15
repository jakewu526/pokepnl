import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSetDetail, getCardsInSet } from "@/lib/sets";
import { getWatchlistedCardIds } from "@/lib/watchlist";
import { getCurrentUser } from "@/lib/dal";
import { CardTile } from "@/components/CardTile";
import { AuthNav } from "@/components/AuthNav";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const set = await getSetDetail(id);
  if (!set) notFound();

  const [cards, user] = await Promise.all([getCardsInSet(id), getCurrentUser()]);
  const watchedIds = user ? await getWatchlistedCardIds(user.id, cards.map((c) => c.id)) : new Set<string>();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link
            href="/?view=sets"
            className="font-body text-sm font-medium text-emerald-strong hover:underline"
          >
            ← Binder
          </Link>
          <div className="flex items-center gap-4">
            <Suspense fallback={null}>
              <AuthNav />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center gap-4">
          {set.logoUrl ? (
            <div className="relative h-14 w-40 shrink-0">
              <Image src={set.logoUrl} alt={set.name} fill sizes="160px" className="object-contain object-left" />
            </div>
          ) : null}
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{set.name}</h1>
            <p className="font-body text-sm text-ink-muted">
              {set.series && <>{set.series} · </>}
              {set.code && <>{set.code} · </>}
              {set.releaseDate ? dateFormatter.format(new Date(set.releaseDate)) : "Release date unknown"}
              {set.totalCards ? ` · ${set.totalCards} cards` : ""}
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">No cards ingested for this set yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {cards.map((card) => (
              <CardTile key={card.id} card={card} watched={user ? watchedIds.has(card.id) : undefined} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        Prices from PriceCharting, TCGplayer, and Cardmarket, captured daily
      </footer>
    </div>
  );
}
