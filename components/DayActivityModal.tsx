"use client";

import { useEffect, useState, useTransition } from "react";
import { getDayActivityAction } from "@/app/actions/dashboard";
import type { DayActivity } from "@/lib/dashboard";
import { BuyTable, SellTable } from "@/components/RecentTransactions";

const longDayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// One of a few fixed-inset overlays in this codebase, alongside
// PositionActivityModal and SellOrDeleteButton's sell dialog. AddToCollectionForm
// is the one holdout that still expands inline in place. A day's full
// transaction list doesn't fit inline in a timeline column, so this is a real
// dialog instead.
export function DayActivityModal({ date, onClose }: { date: string | null; onClose: () => void }) {
  const [activity, setActivity] = useState<DayActivity | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!date) {
      setActivity(null);
      return;
    }
    setActivity(null);
    startTransition(async () => {
      const result = await getDayActivityAction(date);
      setActivity(result);
    });
  }, [date]);

  useEffect(() => {
    if (!date) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [date, onClose]);

  if (!date) return null;

  const hasContent = activity && (activity.purchases.length > 0 || activity.sales.length > 0);

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
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
            {longDayFormatter.format(parseLocalDate(date))}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-2.5 py-1 font-body text-xs font-medium text-ink-muted transition-colors hover:bg-paper-raised"
          >
            Close
          </button>
        </div>

        {isPending && !activity && <p className="font-body text-sm text-ink-muted">Loading…</p>}

        {activity && !hasContent && (
          <p className="font-body text-sm text-ink-muted">Nothing happened on this day.</p>
        )}

        {activity && hasContent && (
          <div className="flex flex-col gap-6">
            {activity.purchases.length > 0 && (
              <div>
                <h3 className="mb-2 font-display text-base font-semibold tracking-tight text-ink">Buying</h3>
                <BuyTable purchases={activity.purchases} />
              </div>
            )}
            {activity.sales.length > 0 && (
              <div>
                <h3 className="mb-2 font-display text-base font-semibold tracking-tight text-ink">Selling</h3>
                <SellTable transactions={activity.sales} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
