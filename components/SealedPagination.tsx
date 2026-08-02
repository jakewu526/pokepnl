import Link from "next/link";

function buildHref(query: string, page: number, type: string, language: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  // Filters have to ride along or paging out of page 1 silently resets them.
  if (type) params.set("type", type);
  if (language) params.set("lang", language);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/sealed?${qs}` : "/sealed";
}

export function SealedPagination({
  query,
  page,
  pageCount,
  type = "",
  language = "",
}: {
  query: string;
  page: number;
  pageCount: number;
  type?: string;
  language?: string;
}) {
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav
      aria-label="Sealed product results pages"
      className="flex items-center justify-center gap-4 py-2"
    >
      {hasPrev ? (
        <Link
          href={buildHref(query, page - 1, type, language)}
          className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink hover:border-emerald hover:text-emerald-strong"
        >
          ← Previous
        </Link>
      ) : (
        <span className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink-muted opacity-50">
          ← Previous
        </span>
      )}

      <span className="font-data text-sm text-ink-muted">
        Page {page} of {pageCount}
      </span>

      {hasNext ? (
        <Link
          href={buildHref(query, page + 1, type, language)}
          className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink hover:border-emerald hover:text-emerald-strong"
        >
          Next →
        </Link>
      ) : (
        <span className="flex h-11 items-center rounded-full border border-line px-4 font-body text-sm font-medium text-ink-muted opacity-50">
          Next →
        </span>
      )}
    </nav>
  );
}
