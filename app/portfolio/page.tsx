import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { StatTile } from "@/components/StatTile";
import { PortfolioItemTile } from "@/components/PortfolioItemTile";
import { CONDITION_LABELS, CONDITION_MULTIPLIERS, type Condition } from "@/lib/condition";
import { SEALED_TYPE_LABELS, type SealedProductType } from "@/lib/sealed";
import { getPortfolioData } from "@/lib/portfolio";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";

type SortKey = "recent" | "value" | "unrealized-abs" | "unrealized-pct";
type TypeFilter = "all" | "cards" | "sealed";

function isSortKey(value: string | undefined): value is SortKey {
  return value === "recent" || value === "value" || value === "unrealized-abs" || value === "unrealized-pct";
}

function isTypeFilter(value: string | undefined): value is TypeFilter {
  return value === "all" || value === "cards" || value === "sealed";
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; type?: string }>;
}) {
  const session = await verifySession();
  const params = await searchParams;
  const sort: SortKey = isSortKey(params.sort) ? params.sort : "recent";
  const type: TypeFilter = isTypeFilter(params.type) ? params.type : "all";

  const [items, portfolio] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          select: {
            id: true,
            name: true,
            number: true,
            imageUrl: true,
            set: { select: { name: true, totalCards: true } },
          },
        },
        sealedProduct: {
          select: {
            id: true,
            name: true,
            type: true,
            imageUrl: true,
            set: { select: { name: true } },
          },
        },
      },
    }),
    getPortfolioData(session.userId),
  ]);

  const cardIds = items.filter((i) => i.cardId).map((i) => i.cardId!);
  const sealedIds = items.filter((i) => i.sealedProductId).map((i) => i.sealedProductId!);
  const [cardPrices, sealedPrices] = await Promise.all([
    getLatestPrices(cardIds),
    getLatestSealedPrices(sealedIds),
  ]);

  function marketPriceFor(item: (typeof items)[number]): number | null {
    if (item.cardId) {
      const info = cardPrices.get(item.cardId);
      if (!info) return null;
      const multiplier = CONDITION_MULTIPLIERS[(item.condition as Condition) ?? "NM"] ?? 1;
      return info.price * multiplier;
    }
    if (item.sealedProductId) {
      return sealedPrices.get(item.sealedProductId)?.price ?? null;
    }
    return null;
  }

  const filtered = items.filter((item) => {
    if (type === "cards") return item.cardId != null;
    if (type === "sealed") return item.sealedProductId != null;
    return true;
  });

  const enriched = filtered.map((item) => {
    const marketPrice = marketPriceFor(item);
    const cost = item.costPerUnit != null ? parseFloat(item.costPerUnit.toString()) : null;
    const unrealizedAbs = cost != null && marketPrice != null ? (marketPrice - cost) * item.quantity : null;
    const unrealizedPct = cost != null && cost !== 0 && marketPrice != null ? (marketPrice - cost) / cost : null;
    return { item, marketPrice, cost, unrealizedAbs, unrealizedPct };
  });

  enriched.sort((a, b) => {
    if (sort === "value") return (b.marketPrice ?? -Infinity) - (a.marketPrice ?? -Infinity);
    if (sort === "unrealized-abs") return (b.unrealizedAbs ?? -Infinity) - (a.unrealizedAbs ?? -Infinity);
    if (sort === "unrealized-pct") return (b.unrealizedPct ?? -Infinity) - (a.unrealizedPct ?? -Infinity);
    return 0; // "recent" -- already ordered by createdAt desc from the query
  });

  function sortHref(nextSort: SortKey): string {
    const p = new URLSearchParams();
    if (nextSort !== "recent") p.set("sort", nextSort);
    if (type !== "all") p.set("type", type);
    const qs = p.toString();
    return qs ? `/portfolio?${qs}` : "/portfolio";
  }

  function typeHref(nextType: TypeFilter): string {
    const p = new URLSearchParams();
    if (sort !== "recent") p.set("sort", sort);
    if (nextType !== "all") p.set("type", nextType);
    const qs = p.toString();
    return qs ? `/portfolio?${qs}` : "/portfolio";
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "recent", label: "Recently added" },
    { key: "value", label: "Value" },
    { key: "unrealized-abs", label: "Unrealized $" },
    { key: "unrealized-pct", label: "Unrealized %" },
  ];
  const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "cards", label: "Cards" },
    { key: "sealed", label: "Sealed" },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link href="/" className="font-body text-sm font-medium text-emerald-strong hover:underline">
            ← Binder
          </Link>
          <AuthNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight text-ink">My Portfolio</h1>

        {items.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Total value" value={portfolio.summary.totalValue} tone="positive" />
            <StatTile
              label="Cards"
              sublabel={String(portfolio.summary.cardCount)}
              value={portfolio.summary.cardValue}
            />
            <StatTile
              label="Sealed"
              sublabel={String(portfolio.summary.sealedCount)}
              value={portfolio.summary.sealedValue}
            />
          </div>
        )}

        {items.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div role="group" className="flex items-center gap-1 rounded-full border border-line bg-paper-raised p-1">
              {TYPE_OPTIONS.map((opt) => (
                <Link
                  key={opt.key}
                  href={typeHref(opt.key)}
                  aria-pressed={type === opt.key}
                  className={`rounded-full px-3 py-1.5 font-body text-sm font-medium transition ${
                    type === opt.key ? "bg-emerald text-paper-raised" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {SORT_OPTIONS.map((opt) => (
                <Link
                  key={opt.key}
                  href={sortHref(opt.key)}
                  className={`rounded-full border px-3 py-1.5 font-body text-xs font-medium transition ${
                    sort === opt.key
                      ? "border-emerald bg-emerald text-paper-raised"
                      : "border-line text-ink-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">Your portfolio is empty</p>
            <p className="font-body text-sm text-ink-muted">
              Browse cards and add them to your portfolio to see them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {enriched.map(({ item, marketPrice, cost, unrealizedAbs }) =>
              item.card ? (
                <PortfolioItemTile
                  key={item.id}
                  href={`/cards/${item.card.id}`}
                  imageUrl={item.card.imageUrl}
                  imageAlt={item.card.name}
                  fallbackLabel="No image"
                  name={item.card.name}
                  subtitle={`${item.card.set.name} · ${CONDITION_LABELS[item.condition as Condition] ?? item.condition}`}
                  quantity={item.quantity}
                  cost={cost}
                  unrealized={unrealizedAbs}
                  collectionItemId={item.id}
                  marketPrice={marketPrice}
                />
              ) : item.sealedProduct ? (
                <PortfolioItemTile
                  key={item.id}
                  href={`/sealed/${item.sealedProduct.id}`}
                  imageUrl={item.sealedProduct.imageUrl}
                  imageAlt={item.sealedProduct.name}
                  fallbackLabel={SEALED_TYPE_LABELS[item.sealedProduct.type as SealedProductType]}
                  name={item.sealedProduct.name}
                  subtitle={
                    (item.sealedProduct.set?.name ?? SEALED_TYPE_LABELS[item.sealedProduct.type as SealedProductType]) +
                    (item.condition ? ` · ${item.condition}` : "")
                  }
                  quantity={item.quantity}
                  cost={cost}
                  unrealized={unrealizedAbs}
                  collectionItemId={item.id}
                  marketPrice={marketPrice}
                />
              ) : null
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {items.length} item{items.length === 1 ? "" : "s"} in your portfolio
      </footer>
    </div>
  );
}
