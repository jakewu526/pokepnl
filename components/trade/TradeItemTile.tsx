"use client";

import Image from "next/image";
import { CONDITION_LABELS, type Condition } from "@/lib/condition";
import type { TradeableItem } from "@/app/actions/trades";

// Visual clone of CardTile's checkbox-overlay look, but plain selected/
// onSelect props instead of BinderSelectionContext -- that context is a
// multi-select Map built for the card catalog, and wiring the trade picker
// into it would risk regressing BinderBatchAddBar's existing batch-add flow.
export function TradeItemTile({
  item,
  selected,
  onSelect,
}: {
  item: TradeableItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col overflow-hidden rounded-card border bg-paper-raised text-left transition-shadow hover:shadow-[0_2px_0_var(--line)] ${
        selected ? "border-emerald ring-2 ring-emerald" : "border-line"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
          selected ? "border-emerald bg-emerald" : "border-line bg-paper-raised/90"
        }`}
      >
        {selected && (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="var(--paper-raised)" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        )}
      </span>
      <div className="relative aspect-[5/7] bg-line/40">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill sizes="(min-width: 640px) 33vw, 45vw" className="object-contain p-2" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">No image</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
        <h3 className="truncate font-body text-[14px] font-semibold leading-snug text-ink">{item.name}</h3>
        <p className="truncate font-body text-[12px] text-ink-muted">
          {item.subtitle}
          {item.condition && <> · {CONDITION_LABELS[item.condition as Condition] ?? item.condition}</>}
        </p>
        <p className="mt-auto pt-2 font-data text-[12px] text-ink-muted">Qty {item.quantity}</p>
      </div>
    </button>
  );
}
