"use client";

import { useEffect, useState, useTransition } from "react";
import { getPositionLedgerAction } from "@/app/actions/collection";
import type { PositionLedger } from "@/lib/pnl";
import { BuyTable, SellTable } from "@/components/RecentTransactions";

// Position-scoped counterpart to DayActivityModal -- same fixed-inset dialog
// shell and the same BuyTable/SellTable, just keyed on a collectionItemId
// instead of a date. Opened from PortfolioTableRow's "History" button.
export function PositionActivityModal({
  collectionItemId,
  itemName,
  onClose,
}: {
  collectionItemId: string | null;
  itemName: string;
  onClose: () => void;
}) {
  const [ledger, setLedger] = useState<PositionLedger | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!collectionItemId) {
      setLedger(null);
      return;
    }
    setLedger(null);
    startTransition(async () => {
      const result = await getPositionLedgerAction(collectionItemId);
      setLedger(result);
    });
  }, [collectionItemId]);

  useEffect(() => {
    if (!collectionItemId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [collectionItemId, onClose]);

  if (!collectionItemId) return null;

  const hasContent = ledger && (ledger.purchases.length > 0 || ledger.sales.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-paper p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{itemName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-2.5 py-1 font-body text-xs font-medium text-ink-muted transition-colors hover:bg-paper-raised"
          >
            Close
          </button>
        </div>

        {isPending && !ledger && <p className="font-body text-sm text-ink-muted">Loading…</p>}

        {ledger && !hasContent && (
          <p className="font-body text-sm text-ink-muted">
            No recorded transactions for this position yet — it was likely added before purchase
            history tracking started.
          </p>
        )}

        {ledger && hasContent && (
          <div className="flex flex-col gap-6">
            {ledger.purchases.length > 0 && (
              <div>
                <h3 className="mb-2 font-display text-base font-semibold tracking-tight text-ink">Buying</h3>
                <BuyTable purchases={ledger.purchases} editable />
              </div>
            )}
            {ledger.sales.length > 0 && (
              <div>
                <h3 className="mb-2 font-display text-base font-semibold tracking-tight text-ink">Selling</h3>
                <SellTable transactions={ledger.sales} editable />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
