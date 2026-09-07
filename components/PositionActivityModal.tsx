"use client";

import { useEffect, useState, useTransition } from "react";
import { getPositionLedgerAction, getClosedPositionLedgerAction } from "@/app/actions/collection";
import type { PositionLedger } from "@/lib/pnl";
import { BuyTable, SellTable } from "@/components/RecentTransactions";
import { DialogShell } from "@/components/DialogShell";

// Position-scoped counterpart to DayActivityModal -- same fixed-inset dialog
// shell and the same BuyTable/SellTable, just keyed on a collectionItemId (or,
// for a closed position with no CollectionItem, its card/sealedProductId/
// condition key) instead of a date. Opened from PortfolioTableRow's "History"
// button.
export type PositionActivityKey =
  | { collectionItemId: string }
  | { cardId: string | null; sealedProductId: string | null; condition: string | null };

export function PositionActivityModal({
  positionKey,
  itemName,
  onClose,
}: {
  positionKey: PositionActivityKey | null;
  itemName: string;
  onClose: () => void;
}) {
  const [ledger, setLedger] = useState<PositionLedger | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!positionKey) {
      setLedger(null);
      return;
    }
    setLedger(null);
    startTransition(async () => {
      const result =
        "collectionItemId" in positionKey
          ? await getPositionLedgerAction(positionKey.collectionItemId)
          : await getClosedPositionLedgerAction(positionKey.cardId, positionKey.sealedProductId, positionKey.condition);
      setLedger(result);
    });
  }, [positionKey]);

  // Escape-to-close is handled once, centrally, by DialogShell -- no
  // separate listener needed here.
  if (!positionKey) return null;

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
