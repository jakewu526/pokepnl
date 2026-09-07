"use client";

import { useEffect, useState, useTransition } from "react";
import { getPositionLedgerAction } from "@/app/actions/collection";
import type { PositionLedger } from "@/lib/pnl";
import { BuyTable, SellTable } from "@/components/RecentTransactions";
import { DialogShell } from "@/components/DialogShell";

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

  if (!collectionItemId) return null;

  const hasContent = ledger && (ledger.purchases.length > 0 || ledger.sales.length > 0);

  return (
    <DialogShell onClose={onClose} title={itemName} maxWidthClassName="max-w-2xl" scrollable>
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
    </DialogShell>
  );
}
