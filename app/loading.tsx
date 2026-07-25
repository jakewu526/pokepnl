export default function Loading() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Binder
            </h1>
          </div>
          <div className="h-12 animate-pulse rounded-full border border-line bg-paper-raised" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-line/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-card border border-line bg-paper-raised">
              <div className="aspect-[5/7] animate-pulse bg-line/60" />
              <div className="space-y-2 px-3 py-3">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-line/60" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-line/40" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-line/60" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
