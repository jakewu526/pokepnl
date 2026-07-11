import Link from "next/link";
import type { Condition } from "@/lib/condition";

function buildHref(query: string, page: number, condition: Condition): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (condition !== "NM") params.set("condition", condition);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function Pagination({
  query,
  page,
  pageCount,
  condition = "NM",
}: {
  query: string;
  page: number;
  pageCount: number;
  condition?: Condition;
}) {
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav
      aria-label="Card results pages"
      className="flex items-center justify-center gap-4 py-2"
    >
      {hasPrev ? (
        <Link
          href={buildHref(query, page - 1, condition)}
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
          href={buildHref(query, page + 1, condition)}
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
