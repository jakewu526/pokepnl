import { Suspense } from "react";
import { SEALED_PAGE_SIZE, getSealedCatalogStats, searchSealedProducts } from "@/lib/sealed";
import { getWatchlistedSealedIds } from "@/lib/watchlist";
import { getCurrentUser } from "@/lib/dal";
import { SearchBar } from "@/components/SearchBar";
import { SealedProductTile } from "@/components/SealedProductTile";
import { SealedPagination } from "@/components/SealedPagination";
import { AuthNav } from "@/components/AuthNav";
import { CatalogNav } from "@/components/CatalogNav";

export default async function SealedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ productCount }, results, user] = await Promise.all([
    getSealedCatalogStats(),
    searchSealedProducts(query, page),
    getCurrentUser(),
  ]);
  const watchedIds = await getWatchlistedSealedIds(
    user?.id ?? null,
    results.products.map((p) => p.id)
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
                {productCount.toLocaleString()} sealed products
              </p>
              <Suspense fallback={null}>
                <AuthNav />
              </Suspense>
            </div>
          </div>

          <CatalogNav active="sealed" />

          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-paper-raised" />}>
            <SearchBar initialQuery={query} />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {results.products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">
              {query ? `No sealed products found for “${query}”` : "No sealed products found"}
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
              {results.products.map((product) => (
                <SealedProductTile
                  key={product.id}
                  product={product}
                  watched={user ? watchedIds.has(product.id) : undefined}
                />
              ))}
            </div>
            <div className="mt-8">
              <SealedPagination query={query} page={results.page} pageCount={results.pageCount} />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        Prices from PriceCharting and eBay, captured daily · {SEALED_PAGE_SIZE} products per page
      </footer>
    </div>
  );
}
