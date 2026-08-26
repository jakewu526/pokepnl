import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { AuthNav } from "@/components/AuthNav";
import { BuyTable, SellTable } from "@/components/RecentTransactions";
import {
  getAllPurchaseLots,
  getPurchaseLotCount,
  getTransactionHistory,
  getTransactionCount,
} from "@/lib/pnl";

const PAGE_SIZE = 30;

function pageHref(param: "buyPage" | "sellPage", page: number, otherParam: "buyPage" | "sellPage", otherPage: number): string {
  const p = new URLSearchParams();
  if (page > 1) p.set(param, String(page));
  if (otherPage > 1) p.set(otherParam, String(otherPage));
  const qs = p.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

function Pager({
  page,
  pageCount,
  param,
  otherParam,
  otherPage,
}: {
  page: number;
  pageCount: number;
  param: "buyPage" | "sellPage";
  otherParam: "buyPage" | "sellPage";
  otherPage: number;
}) {
  if (pageCount <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav aria-label={`${param} pages`} className="flex items-center justify-center gap-4 py-4">
      {hasPrev ? (
        <Link
          href={pageHref(param, page - 1, otherParam, otherPage)}
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
          href={pageHref(param, page + 1, otherParam, otherPage)}
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
  searchParams: Promise<{ buyPage?: string; sellPage?: string }>;
}) {
  const session = await verifySession();
  const params = await searchParams;
  const buyPage = Math.max(1, parseInt(params.buyPage ?? "1", 10) || 1);
  const sellPage = Math.max(1, parseInt(params.sellPage ?? "1", 10) || 1);

  const [purchases, purchaseCount, sales, saleCount] = await Promise.all([
    getAllPurchaseLots(session.userId, PAGE_SIZE, (buyPage - 1) * PAGE_SIZE),
    getPurchaseLotCount(session.userId),
    getTransactionHistory(session.userId, PAGE_SIZE, (sellPage - 1) * PAGE_SIZE),
    getTransactionCount(session.userId),
  ]);

  const buyPageCount = Math.max(1, Math.ceil(purchaseCount / PAGE_SIZE));
  const sellPageCount = Math.max(1, Math.ceil(saleCount / PAGE_SIZE));
  const hasAny = purchaseCount > 0 || saleCount > 0;

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
        <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight text-ink">Transactions</h1>

        {!hasAny ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="font-body text-lg font-medium text-ink">No activity yet</p>
            <p className="font-body text-sm text-ink-muted">
              Buy or sell an item from your portfolio to see it show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
                Buying {purchaseCount > 0 && <span className="font-data text-sm font-normal text-ink-muted">({purchaseCount})</span>}
              </h2>
              {purchases.length > 0 ? (
                <>
                  <BuyTable purchases={purchases} editable />
                  <Pager page={buyPage} pageCount={buyPageCount} param="buyPage" otherParam="sellPage" otherPage={sellPage} />
                </>
              ) : (
                <p className="font-body text-sm text-ink-muted">No purchases yet.</p>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
                Selling {saleCount > 0 && <span className="font-data text-sm font-normal text-ink-muted">({saleCount})</span>}
              </h2>
              {sales.length > 0 ? (
                <>
                  <SellTable transactions={sales} editable />
                  <Pager page={sellPage} pageCount={sellPageCount} param="sellPage" otherParam="buyPage" otherPage={buyPage} />
                </>
              ) : (
                <p className="font-body text-sm text-ink-muted">No sales yet.</p>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        {purchaseCount} purchase{purchaseCount === 1 ? "" : "s"} · {saleCount} sale{saleCount === 1 ? "" : "s"}
      </footer>
    </div>
  );
}
