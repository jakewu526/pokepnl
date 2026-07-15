"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const VIEWS = [
  { key: "singles", label: "Singles" },
  { key: "sets", label: "Sets" },
] as const;

export type CatalogView = (typeof VIEWS)[number]["key"];

export function CatalogViewToggle({ view }: { view: CatalogView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(next: CatalogView) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "singles") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    params.delete("page");
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div
      role="group"
      aria-label="Catalog view"
      className="inline-flex gap-1 self-start rounded-full border border-line bg-paper-raised p-1"
    >
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => select(v.key)}
          aria-pressed={view === v.key}
          className={`rounded-full px-4 py-1.5 font-body text-sm font-medium transition-colors ${
            view === v.key
              ? "bg-emerald text-paper-raised"
              : "bg-paper-raised text-ink-muted hover:text-ink"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
