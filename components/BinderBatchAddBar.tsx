"use client";

import { useState, useTransition } from "react";
import { batchAddToCollection } from "@/app/actions/collection";
import { useBinderSelection } from "@/components/BinderSelection";

export function BinderBatchAddBar() {
  const { active, selected, clear } = useBinderSelection();
  const [pending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);

  if (!active || selected.size === 0) return null;

  function handleAdd() {
    const items = Array.from(selected, ([cardId, price]) => ({ cardId, price }));
    startTransition(async () => {
      await batchAddToCollection(items);
      clear();
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1500);
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-4 rounded-full border border-line bg-paper-raised px-5 py-3 shadow-lg">
        <span className="font-body text-sm font-medium text-ink">
          {selected.size} selected
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={handleAdd}
          className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : justAdded ? "Added!" : "Add all at market rate"}
        </button>
        <button
          type="button"
          onClick={clear}
          className="font-body text-xs font-medium text-ink-muted hover:text-ink"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
