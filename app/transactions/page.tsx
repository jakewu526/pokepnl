import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { TransactionSearchBar } from "@/components/TransactionSearchBar";
import { EbaySyncButton } from "@/components/EbaySyncButton";
import { BuyTable, SellTable, MergedTable, type MergedRow } from "@/components/RecentTransactions";
import { TradeHistoryTable } from "@/components/trade/TradeHistoryTable";
import {
  getAllPurchaseLots,
  getPurchaseLotCount,
  getTransactionHistory,
  getTransactionCount,
  getTradeHistory,
  getTradeCount,
  type PurchaseListItem,
  type TransactionListItem,
} from "@/lib/pnl";

const PAGE_SIZE = 30;

// One flat toggle -- Buys / Sells / Trades / Merged -- rather than a
// "Buys & sells" section that stacked every table on the same page. Each
// mode shows exactly one table, so switching never means scrolling past the
// others.
type Mode = "buy" | "sell" | "trade" | "merged";

function isMode(value: string | undefined): value is Mode {
  return value === "buy" || value === "sell" || value === "trade" || value === "merged";
}

function matchesQuery(itemName: string, q: string): boolean {
  return itemName.toLowerCase().includes(q.toLowerCase());
}

function withQuery(params: URLSearchParams, q: string): URLSearchParams {
  if (q) params.set("q", q);
  return params;
}

// Shared by the mode pills and every pager -- keeps whichever page each of
// the views was on when switching between them, so hopping from "Buys" to
// "Sells" and back doesn't lose your spot in either.
function modeHref(
  q: string,
  mode: Mode,
  buyPage: number,
  sellPage: number,
  tradePage: number,
  mergedPage: number
): string {
  const p = withQuery(new URLSearchParams(), q);
  if (mode !== "buy") p.set("view", mode);
  if (buyPage > 1) p.set("buyPage", String(buyPage));
  if (sellPage > 1) p.set("sellPage", String(sellPage));
  if (tradePage > 1) p.set("tradePage", String(tradePage));
  if (mergedPage > 1) p.set("page", String(mergedPage));
  const qs = p.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

// Rendered above *and* below the rows -- with a lot of history, the pager
// used to live only at the bottom, so turning the page meant scrolling all
// the way down first. Now the top copy is reachable without scrolling.
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

const MODE_OPTIONS: { key: Mode; label: string }[] = [
  { key: "buy", label: "Buys" },
  { key: "sell", label: "Sells" },
  { key: "trade", label: "Trades" },
  { key: "merged", label: "Merged" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    buyPage?: string;
    sellPage?: string;
    tradePage?: string;
    page?: string;
    view?: string;
    q?: string;
  }>;
}) {
  const session = await verifySession();
  const params = await searchParams;
  const mode: Mode = isMode(params.view) ? params.view : "buy";
  const q = (params.q ?? "").trim();
  const buyPage = Math.max(1, parseInt(params.buyPage ?? "1", 10) || 1);
  const sellPage = Math.max(1, parseInt(params.sellPage ?? "1", 10) || 1);
  const tradePage = Math.max(1, parseInt(params.tradePage ?? "1", 10) || 1);
  const mergedPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [purchaseCount, saleCount, tradeCount, ebayAccount] = await Promise.all([
    getPurchaseLotCount(session.userId),
    getTransactionCount(session.userId),
    getTradeCount(session.userId),
    prisma.ebayAccount.findUnique({ where: { userId: session.userId } }),
  ]);
  const hasAny = purchaseCount > 0 || saleCount > 0 || tradeCount > 0;

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
                  {MODE_OPTIONS.map((opt) => (
                    <Link
                      key={opt.key}
                      href={modeHref(q, opt.key, buyPage, sellPage, tradePage, mergedPage)}
                      aria-pressed={mode === opt.key}
                      className={`rounded-full px-3 py-1.5 font-body text-sm font-medium transition ${
                        mode === opt.key ? "bg-emerald text-paper-raised" : "text-ink-muted hover:text-ink"
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
        ) : mode === "merged" ? (
          <MergedView userId={session.userId} page={mergedPage} q={q} />
        ) : mode === "trade" ? (
          <TradeView userId={session.userId} page={tradePage} buyPage={buyPage} sellPage={sellPage} mergedPage={mergedPage} q={q} />
        ) : (
          <SingleTypeView
            userId={session.userId}
            type={mode}
            buyPage={buyPage}
            sellPage={sellPage}
            tradePage={tradePage}
            mergedPage={mergedPage}
            q={q}
          />
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {purchaseCount} purchase{purchaseCount === 1 ? "" : "s"} · {saleCount} sale{saleCount === 1 ? "" : "s"}
        {tradeCount > 0 && (
          <>
            {" "}
            · {tradeCount} trade{tradeCount === 1 ? "" : "s"}
          </>
        )}
      </footer>
    </div>
  );
}

// Both views pull every row (no DB-level limit/skip) and filter/paginate in
// memory when a search is active -- a personal portfolio's history is small
// enough that this is simpler than pushing the name filter into a Prisma
// `where` across two tables (PurchaseLot has no itemName of its own; it only
// gets one by joining through card/sealedProduct).
async function SingleTypeView({
  userId,
  type,
  buyPage,
  sellPage,
  tradePage,
  mergedPage,
  q,
}: {
  userId: string;
  type: "buy" | "sell";
  buyPage: number;
  sellPage: number;
  tradePage: number;
  mergedPage: number;
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

  const count = type === "buy" ? purchases.length : sales.length;
  const pageCount = type === "buy" ? buyPageCount : sellPageCount;
  const page = type === "buy" ? buyPage : sellPage;
  const href = (p: number) =>
    type === "buy"
      ? modeHref(q, "buy", p, sellPage, tradePage, mergedPage)
      : modeHref(q, "sell", buyPage, p, tradePage, mergedPage);

  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
        {type === "buy" ? "Buys" : "Sells"}{" "}
        {count > 0 && <span className="font-data text-sm font-normal text-ink-muted">({count})</span>}
      </h2>

      {type === "buy" ? (
        buyPageRows.length > 0 ? (
          <>
            <Pager page={page} pageCount={pageCount} href={href} />
            <BuyTable purchases={buyPageRows} editable />
            <Pager page={page} pageCount={pageCount} href={href} />
          </>
        ) : (
          <p className="font-body text-sm text-ink-muted">
            {q ? `No purchases match "${q}".` : "No purchases yet."}
          </p>
        )
      ) : sellPageRows.length > 0 ? (
        <>
          <Pager page={page} pageCount={pageCount} href={href} />
          <SellTable transactions={sellPageRows} editable />
          <Pager page={page} pageCount={pageCount} href={href} />
        </>
      ) : (
        <p className="font-body text-sm text-ink-muted">{q ? `No sales match "${q}".` : "No sales yet."}</p>
      )}
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
  const href = (p: number) => modeHref(q, "merged", 1, 1, 1, p);

  return (
    <div>
      {pageRows.length > 0 ? (
        <>
          <Pager page={page} pageCount={pageCount} href={href} />
          <MergedTable rows={pageRows} editable />
          <Pager page={page} pageCount={pageCount} href={href} />
        </>
      ) : (
        <p className="font-body text-sm text-ink-muted">{q ? `No transactions match "${q}".` : "No activity yet."}</p>
      )}
    </div>
  );
}

function matchesTradeQuery(t: { givenItems: { itemName: string }[]; receivedItems: { itemName: string }[] }, q: string): boolean {
  return t.givenItems.some((i) => matchesQuery(i.itemName, q)) || t.receivedItems.some((i) => matchesQuery(i.itemName, q));
}

async function TradeView({
  userId,
  page,
  buyPage,
  sellPage,
  mergedPage,
  q,
}: {
  userId: string;
  page: number;
  buyPage: number;
  sellPage: number;
  mergedPage: number;
  q: string;
}) {
  const allTrades = await getTradeHistory(userId);
  const trades = q ? allTrades.filter((t) => matchesTradeQuery(t, q)) : allTrades;

  const pageCount = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const pageRows = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const href = (p: number) => modeHref(q, "trade", buyPage, sellPage, p, mergedPage);

  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
        Trades{" "}
        {trades.length > 0 && <span className="font-data text-sm font-normal text-ink-muted">({trades.length})</span>}
      </h2>

      {pageRows.length > 0 ? (
        <>
          <Pager page={page} pageCount={pageCount} href={href} />
          <TradeHistoryTable trades={pageRows} />
          <Pager page={page} pageCount={pageCount} href={href} />
        </>
      ) : (
        <p className="font-body text-sm text-ink-muted">{q ? `No trades match "${q}".` : "No trades yet."}</p>
      )}
    </div>
  );
}
