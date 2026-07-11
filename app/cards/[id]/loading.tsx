export default function Loading() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-6">
          <div className="h-4 w-16 animate-pulse rounded bg-line/60" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <div className="aspect-[5/7] w-full max-w-[280px] animate-pulse rounded-card border border-line bg-paper-raised" />
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <div className="h-8 w-2/3 animate-pulse rounded bg-line/60" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-line/40" />
              <div className="h-8 w-1/3 animate-pulse rounded bg-line/60" />
            </div>
            <div className="h-[280px] animate-pulse rounded-card border border-line bg-paper-raised" />
          </div>
        </div>
      </main>
    </div>
  );
}
