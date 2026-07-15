import { Suspense } from "react";
import { CARDS_PAGE_SIZE, getCatalogStats, searchCards } from "@/lib/cards";
import { getSetsByEra } from "@/lib/sets";
import { getWatchlistedCardIds } from "@/lib/watchlist";
import { getCurrentUser } from "@/lib/dal";
import { SearchBar } from "@/components/SearchBar";
import { CardTile } from "@/components/CardTile";
import { SetTile } from "@/components/SetTile";
import { CatalogViewToggle, type CatalogView } from "@/components/CatalogViewToggle";
import { Pagination } from "@/components/Pagination";
import { AuthNav } from "@/components/AuthNav";
import { CatalogNav } from "@/components/CatalogNav";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; view?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const view: CatalogView = params.view === "sets" ? "sets" : "singles";

  const [{ cardCount, setCount }, user] = await Promise.all([
    getCatalogStats(),
    getCurrentUser(),
  ]);

  const results = view === "singles" ? await searchCards(query, page) : null;
  const eras = view === "sets" ? await getSetsByEra(query, user?.id ?? null) : null;
  const watchedIds = results
    ? await getWatchlistedCardIds(
        user?.id ?? null,
        results.cards.map((c) => c.id)
      )
    : null;

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

          <CatalogViewToggle view={view} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {view === "singles" && results && (
          results.cards.length === 0 ? (
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
                    watched={user ? watchedIds!.has(card.id) : undefined}
                  />
                ))}
              </div>
              <div className="mt-8">
                <Pagination query={query} page={results.page} pageCount={results.pageCount} />
              </div>
            </>
          )
        )}

        {view === "sets" && eras && (
          eras.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <p className="font-body text-lg font-medium text-ink">
                {query ? `No sets found for “${query}”` : "No sets found"}
              </p>
              <p className="font-body text-sm text-ink-muted">
                Try a different spelling, or a shorter search term.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {eras.map((group) => (
                <section key={group.era}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 rounded-[3px] bg-emerald"
                    />
                    <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                      {group.era}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                    {group.sets.map((set) => (
                      <SetTile key={set.id} set={set} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        Prices from PriceCharting, TCGplayer, and Cardmarket, captured daily · {CARDS_PAGE_SIZE} cards per page
      </footer>
    </div>
  );
}
