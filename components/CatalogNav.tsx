import Link from "next/link";

const TABS = [
  { key: "cards", label: "Cards", href: "/" },
  { key: "sealed", label: "Sealed", href: "/sealed" },
] as const;

export function CatalogNav({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-1 font-body text-sm font-medium" aria-label="Catalog section">
      {TABS.map((tab) =>
        tab.key === active ? (
          <span key={tab.key} className="rounded-full bg-emerald px-3 py-1.5 text-paper-raised">
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={tab.href}
            className="rounded-full px-3 py-1.5 text-ink-muted hover:text-ink"
          >
            {tab.label}
          </Link>
        )
      )}
    </nav>
  );
}
