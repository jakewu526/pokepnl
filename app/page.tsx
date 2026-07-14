import { Suspense } from "react";
import { CARDS_PAGE_SIZE, getCatalogStats, searchCards } from "@/lib/cards";
import { getWatchlistedCardIds } from "@/lib/watchlist";
import { getCurrentUser } from "@/lib/dal";
import { SearchBar } from "@/components/SearchBar";
import { CardTile } from "@/components/CardTile";
import { Pagination } from "@/components/Pagination";
import { AuthNav } from "@/components/AuthNav";
import { CatalogNav } from "@/components/CatalogNav";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ cardCount, setCount }, results, user] = await Promise.all([
    getCatalogStats(),
    searchCards(query, page),
    getCurrentUser(),
  ]);
  const watchedIds = await getWatchlistedCardIds(
    user?.id ?? null,
    results.cards.map((c) => c.id)
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-[3px] bg-emerald"
              />
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
                Binder
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <p className="hidden font-data text-xs text-ink-muted sm:block">
                {cardCount.toLocaleString()} cards · {setCount.toLocaleString()} sets
              </p>
              <Suspense fallback={null}>
                <AuthNav />
              </Suspense>
            </div>
          </div>

          <CatalogNav active="cards" />

          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-paper-raised" />}>
            <SearchBar initialQuery={query} />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {results.cards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">
              {query ? `No cards found for “${query}”` : "No cards found"}
            </p>
            <p className="font-body text-sm text-ink-muted">
              Try a different spelling, or a shorter search term.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 font-data text-xs text-ink-muted">
              {results.total.toLocaleString()} result{results.total === 1 ? "" : "s"}
              {query && <> for “{query}”</>}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {results.cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  watched={user ? watchedIds.has(card.id) : undefined}
                />
              ))}
            </div>
            <div className="mt-8">
              <Pagination query={query} page={results.page} pageCount={results.pageCount} />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        Prices from PriceCharting, TCGplayer, and Cardmarket, captured daily · {CARDS_PAGE_SIZE} cards per page
      </footer>
    </div>
  );
}
