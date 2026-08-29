import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { TransactionSearchBar } from "@/components/TransactionSearchBar";
import { EbaySyncButton } from "@/components/EbaySyncButton";
import { BuyTable, SellTable, MergedTable, type MergedRow } from "@/components/RecentTransactions";
import {
  getAllPurchaseLots,
  getPurchaseLotCount,
  getTransactionHistory,
  getTransactionCount,
  type PurchaseListItem,
  type TransactionListItem,
} from "@/lib/pnl";

const PAGE_SIZE = 30;

type ViewMode = "separate" | "merged";

function isViewMode(value: string | undefined): value is ViewMode {
  return value === "separate" || value === "merged";
}

function matchesQuery(itemName: string, q: string): boolean {
  return itemName.toLowerCase().includes(q.toLowerCase());
}

function withQuery(params: URLSearchParams, q: string): URLSearchParams {
  if (q) params.set("q", q);
  return params;
}

function pageHref(
  q: string,
  param: "buyPage" | "sellPage",
  page: number,
  otherParam: "buyPage" | "sellPage",
  otherPage: number
): string {
  const p = withQuery(new URLSearchParams(), q);
  if (page > 1) p.set(param, String(page));
  if (otherPage > 1) p.set(otherParam, String(otherPage));
  const qs = p.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

function mergedPageHref(q: string, page: number): string {
  const p = withQuery(new URLSearchParams(), q);
  p.set("view", "merged");
  if (page > 1) p.set("page", String(page));
  return `/transactions?${p.toString()}`;
}

function viewHref(q: string, nextView: ViewMode): string {
  const p = withQuery(new URLSearchParams(), q);
  if (nextView === "merged") p.set("view", "merged");
  const qs = p.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

function Pager({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav aria-label="pages" className="flex items-center justify-center gap-4 py-4">
      {hasPrev ? (
        <Link
          href={href(page - 1)}
          className="flex h-9 items-center rounded-full border border-line px-3 font-body text-xs font-medium text-ink hover:border-emerald hover:text-emerald-strong"
        >
          ← Previous
        </Link>
      ) : (
        <span className="flex h-9 items-center rounded-full border border-line px-3 font-body text-xs font-medium text-ink-muted opacity-50">
          ← Previous
        </span>
      )}
      <span className="font-data text-xs text-ink-muted">
        Page {page} of {pageCount}
      </span>
      {hasNext ? (
        <Link
          href={href(page + 1)}
          className="flex h-9 items-center rounded-full border border-line px-3 font-body text-xs font-medium text-ink hover:border-emerald hover:text-emerald-strong"
        >
          Next →
        </Link>
      ) : (
        <span className="flex h-9 items-center rounded-full border border-line px-3 font-body text-xs font-medium text-ink-muted opacity-50">
          Next →
        </span>
      )}
    </nav>
  );
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ buyPage?: string; sellPage?: string; page?: string; view?: string; q?: string }>;
}) {
  const session = await verifySession();
  const params = await searchParams;
  const view: ViewMode = isViewMode(params.view) ? params.view : "separate";
  const q = (params.q ?? "").trim();
  const buyPage = Math.max(1, parseInt(params.buyPage ?? "1", 10) || 1);
  const sellPage = Math.max(1, parseInt(params.sellPage ?? "1", 10) || 1);
  const mergedPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [purchaseCount, saleCount, ebayAccount] = await Promise.all([
    getPurchaseLotCount(session.userId),
    getTransactionCount(session.userId),
    prisma.ebayAccount.findUnique({ where: { userId: session.userId } }),
  ]);
  const hasAny = purchaseCount > 0 || saleCount > 0;

  const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
    { key: "separate", label: "Buys & sells" },
    { key: "merged", label: "Merged" },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link href="/dashboard" className="font-body text-sm font-medium text-emerald-strong hover:underline">
            ← Dashboard
          </Link>
          <AuthNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">My Transactions</h1>
          <div className="flex flex-wrap items-center gap-3">
            {hasAny && (
              <>
                <TransactionSearchBar initialQuery={q} />
                <div role="group" className="flex items-center gap-1 rounded-full border border-line bg-paper-raised p-1">
                  {VIEW_OPTIONS.map((opt) => (
                    <Link
                      key={opt.key}
                      href={viewHref(q, opt.key)}
                      aria-pressed={view === opt.key}
                      className={`rounded-full px-3 py-1.5 font-body text-sm font-medium transition ${
                        view === opt.key ? "bg-emerald text-paper-raised" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </Link>
                  ))}
                </div>
              </>
            )}
            <EbaySyncButton ebayUserId={ebayAccount?.ebayUserId ?? null} />
          </div>
        </div>

        {!hasAny ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">No activity yet</p>
            <p className="font-body text-sm text-ink-muted">
              Buy or sell an item from your portfolio to see it show up here.
            </p>
          </div>
        ) : view === "merged" ? (
          <MergedView userId={session.userId} page={mergedPage} q={q} />
        ) : (
          <SeparateView userId={session.userId} buyPage={buyPage} sellPage={sellPage} q={q} />
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {purchaseCount} purchase{purchaseCount === 1 ? "" : "s"} · {saleCount} sale{saleCount === 1 ? "" : "s"}
      </footer>
    </div>
  );
}

// Both views pull every row (no DB-level limit/skip) and filter/paginate in
// memory when a search is active -- a personal portfolio's history is small
// enough that this is simpler than pushing the name filter into a Prisma
// `where` across two tables (PurchaseLot has no itemName of its own; it only
// gets one by joining through card/sealedProduct).
async function SeparateView({
  userId,
  buyPage,
  sellPage,
  q,
}: {
  userId: string;
  buyPage: number;
  sellPage: number;
  q: string;
}) {
  const [allPurchases, allSales]: [PurchaseListItem[], TransactionListItem[]] = await Promise.all([
    getAllPurchaseLots(userId),
    getTransactionHistory(userId),
  ]);

  const purchases = q ? allPurchases.filter((p) => matchesQuery(p.itemName, q)) : allPurchases;
  const sales = q ? allSales.filter((s) => matchesQuery(s.itemName, q)) : allSales;

  const buyPageCount = Math.max(1, Math.ceil(purchases.length / PAGE_SIZE));
  const sellPageCount = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const buyPageRows = purchases.slice((buyPage - 1) * PAGE_SIZE, buyPage * PAGE_SIZE);
  const sellPageRows = sales.slice((sellPage - 1) * PAGE_SIZE, sellPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
          Buying {purchases.length > 0 && <span className="font-data text-sm font-normal text-ink-muted">({purchases.length})</span>}
        </h2>
        {buyPageRows.length > 0 ? (
          <>
            <BuyTable purchases={buyPageRows} editable />
            <Pager page={buyPage} pageCount={buyPageCount} href={(p) => pageHref(q, "buyPage", p, "sellPage", sellPage)} />
          </>
        ) : (
          <p className="font-body text-sm text-ink-muted">
            {q ? `No purchases match "${q}".` : "No purchases yet."}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
          Selling {sales.length > 0 && <span className="font-data text-sm font-normal text-ink-muted">({sales.length})</span>}
        </h2>
        {sellPageRows.length > 0 ? (
          <>
            <SellTable transactions={sellPageRows} editable />
            <Pager page={sellPage} pageCount={sellPageCount} href={(p) => pageHref(q, "sellPage", p, "buyPage", buyPage)} />
          </>
        ) : (
          <p className="font-body text-sm text-ink-muted">{q ? `No sales match "${q}".` : "No sales yet."}</p>
        )}
      </section>
    </div>
  );
}

async function MergedView({ userId, page, q }: { userId: string; page: number; q: string }) {
  const [purchases, sales] = await Promise.all([getAllPurchaseLots(userId), getTransactionHistory(userId)]);

  let merged: MergedRow[] = [
    ...purchases.map((row): MergedRow => ({ kind: "buy", date: row.purchasedAt, row })),
    ...sales.map((row): MergedRow => ({ kind: "sell", date: row.soldAt, row })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (q) merged = merged.filter((r) => matchesQuery(r.row.itemName, q));

  const pageCount = Math.max(1, Math.ceil(merged.length / PAGE_SIZE));
  const pageRows = merged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {pageRows.length > 0 ? (
        <>
          <MergedTable rows={pageRows} editable />
          <Pager page={page} pageCount={pageCount} href={(p) => mergedPageHref(q, p)} />
        </>
      ) : (
        <p className="font-body text-sm text-ink-muted">{q ? `No transactions match "${q}".` : "No activity yet."}</p>
      )}
    </div>
  );
}
