"use client";

import { useState, useTransition } from "react";
import { disconnectEbay, syncEbayOrders, type EbaySyncResult } from "@/app/actions/ebay-import";

function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never synced";
  const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Last synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Last synced ${days} day${days === 1 ? "" : "s"} ago`;
}

export function EbayConnectionCard({
  ebayUserId,
  lastSyncedAt,
}: {
  ebayUserId: string | null;
  lastSyncedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EbaySyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex flex-col gap-3 rounded-card border border-line bg-paper-raised p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">eBay</h3>
          <p className="font-body text-sm text-ink-muted">
            {ebayUserId ? `Connected as ${ebayUserId}` : "Connect your eBay account to import sold history."}
          </p>
        </div>
        {!ebayUserId && (
          <a
            href="/api/auth/ebay"
            className="rounded-full bg-emerald px-3 py-1.5 font-body text-sm font-medium text-paper-raised hover:opacity-90"
          >
            Connect eBay account
          </a>
        )}
      </div>

      {ebayUserId && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <p className="font-data text-xs text-ink-muted">{formatLastSynced(lastSyncedAt)}</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={handleSync}
              className="rounded-full bg-emerald px-3 py-1.5 font-body text-sm font-medium text-paper-raised hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Syncing…" : "Sync sold history now"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => disconnectEbay())}
              className="font-body text-xs font-medium text-ink-muted hover:text-amber disabled:opacity-60"
            >
              Disconnect
            </button>
          </div>

          {error && <p className="font-body text-sm text-amber">{error}</p>}
          {result && (
            <p className="font-body text-sm text-ink-muted">
              Imported {result.imported} new sale{result.imported === 1 ? "" : "s"}
              {result.skippedDuplicate > 0 && ` · ${result.skippedDuplicate} already imported`}
              {result.skippedNonPokemon > 0 && ` · ${result.skippedNonPokemon} skipped (not Pokemon-related)`}
              {result.positionMismatch > 0 &&
                ` · ${result.positionMismatch} sold more than recorded as bought (portfolio quantity not updated for those)`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
