import Link from "next/link";

// Without this, notFound() from a bad /cards, /sets, or /sealed id renders
// Next's bare fallback inside our own <body>, which reads as a blank page.
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-5 sm:px-6">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-ink hover:underline"
          >
            Binder
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center sm:px-6">
        <p className="font-data text-xs text-ink-muted">404</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          We couldn&rsquo;t find that page
        </h1>
        <p className="max-w-md font-body text-sm text-ink-muted">
          The card, set, or product you followed may have been renamed or removed from the catalog.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 font-body text-sm">
          <Link
            href="/"
            className="rounded-full bg-emerald px-4 py-2 font-medium text-paper-raised hover:opacity-90"
          >
            Browse cards
          </Link>
          <Link href="/sealed" className="font-medium text-emerald-strong hover:underline">
            Browse sealed products
          </Link>
        </div>
      </main>
    </div>
  );
}
