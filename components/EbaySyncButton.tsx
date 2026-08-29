"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { syncEbayOrders, type EbaySyncResult } from "@/app/actions/ebay-import";

export function EbaySyncButton({ ebayUserId }: { ebayUserId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EbaySyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ebayUserId) {
    return (
      <Link
        href="/settings"
        className="rounded-full border border-line px-3 py-1.5 font-body text-sm font-medium text-ink-muted hover:border-emerald hover:text-emerald-strong"
      >
        Connect eBay to sync sales
      </Link>
    );
  }

  function handleSync() {
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const syncResult = await syncEbayOrders();
        setResult(syncResult);
      } catch {
        // Failures here are usually a transient DB blip on the sync's Prisma
        // calls, not a real problem with the eBay connection -- one silent
        // retry clears most of them before bothering the user with an error.
        try {
          const syncResult = await syncEbayOrders();
          setResult(syncResult);
        } catch {
          setError("Couldn't sync with eBay. Please try again.");
        }
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleSync}
        className="rounded-full bg-emerald px-3 py-1.5 font-body text-sm font-medium text-paper-raised hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync eBay"}
      </button>
      {error && <p className="max-w-xs text-right font-body text-xs text-amber">{error}</p>}
      {result && (
        <p className="max-w-xs text-right font-body text-xs text-ink-muted">
          Imported {result.imported} new sale{result.imported === 1 ? "" : "s"}
          {result.skippedDuplicate > 0 && ` · ${result.skippedDuplicate} already imported`}
          {result.skippedNonPokemon > 0 && ` · ${result.skippedNonPokemon} skipped (not Pokemon-related)`}
          {result.positionMismatch > 0 && ` · ${result.positionMismatch} position mismatch`}
        </p>
      )}
    </div>
  );
}
