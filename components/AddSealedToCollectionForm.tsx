"use client";

import { useState, useTransition } from "react";
import { addSealedToCollection } from "@/app/actions/collection";
import {
  SEALED_CONDITIONS,
  SEALED_CONDITION_LABELS,
  SEALED_CONDITION_OTHER_MAX_LENGTH,
  type SealedCondition,
} from "@/lib/sealed-condition";

export function AddSealedToCollectionForm({
  sealedProductId,
  marketPrice,
}: {
  sealedProductId: string;
  marketPrice: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState<SealedCondition>("MINT");
  const [otherDescription, setOtherDescription] = useState("");

  function handleAdd() {
    const parsed = parseFloat(cost);
    const costPerUnit = Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    const conditionValue =
      condition === "OTHER"
        ? otherDescription.trim().slice(0, SEALED_CONDITION_OTHER_MAX_LENGTH) || "Other"
        : SEALED_CONDITION_LABELS[condition];
    startTransition(async () => {
      await addSealedToCollection(sealedProductId, conditionValue, costPerUnit);
      setOpen(false);
      setCost("");
      setCondition("MINT");
      setOtherDescription("");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90"
      >
        Add to collection
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-paper-raised p-3">
      <label htmlFor="sealed-cost-input" className="font-body text-xs font-medium text-ink-muted">
        Cost paid
      </label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-ink-muted">
            $
          </span>
          <input
            id="sealed-cost-input"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            autoFocus
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="h-10 w-28 rounded-full border border-line bg-paper pl-6 pr-3 font-data text-sm text-ink outline-none focus:border-emerald"
          />
        </div>
        {marketPrice != null && (
          <button
            type="button"
            onClick={() => setCost(marketPrice.toFixed(2))}
            className="rounded-full border border-line px-3 py-2 font-body text-xs font-medium text-ink-muted hover:text-ink"
          >
            Market rate
          </button>
        )}
      </div>

      <label htmlFor="sealed-condition-select" className="font-body text-xs font-medium text-ink-muted">
        Condition
      </label>
      <select
        id="sealed-condition-select"
        value={condition}
        onChange={(e) => setCondition(e.target.value as SealedCondition)}
        className="h-10 rounded-full border border-line bg-paper px-3 font-body text-sm text-ink outline-none focus:border-emerald"
      >
        {SEALED_CONDITIONS.map((code) => (
          <option key={code} value={code}>
            {SEALED_CONDITION_LABELS[code]}
          </option>
        ))}
      </select>
      {condition === "OTHER" && (
        <input
          type="text"
          placeholder="Describe the condition"
          maxLength={SEALED_CONDITION_OTHER_MAX_LENGTH}
          value={otherDescription}
          onChange={(e) => setOtherDescription(e.target.value)}
          className="h-10 rounded-full border border-line bg-paper px-3 font-body text-sm text-ink outline-none focus:border-emerald"
        />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={handleAdd}
          className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add to collection"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCost("");
          }}
          className="font-body text-xs font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
