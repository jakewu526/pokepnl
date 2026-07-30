"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCollection } from "@/app/actions/collection";
import { CONDITIONS, CONDITION_LABELS, type Condition } from "@/lib/condition";

export function QuickAddToCollectionButton({
  cardId,
  isAuthed = true,
  className = "",
}: {
  cardId: string;
  isAuthed?: boolean;
  className?: string;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState<Condition>("NM");
  const [quantity, setQuantity] = useState("1");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    // Tiles wrap their whole card in a <Link> -- this button sits alongside
    // it (never nested inside the anchor), but stopping propagation here is
    // a cheap guard against ever bubbling into a parent navigation handler.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthed) {
      router.push("/signup");
      return;
    }

    setOpen((prev) => !prev);
  }

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const parsed = parseFloat(cost);
    const costPerUnit = Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    const parsedQty = parseInt(quantity, 10);
    const qty = Number.isFinite(parsedQty) && parsedQty >= 1 ? parsedQty : 1;

    startTransition(async () => {
      await addToCollection(cardId, condition, costPerUnit, qty);
      setOpen(false);
      setCost("");
      setCondition("NM");
      setQuantity("1");
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1200);
    });
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setCost("");
    setQuantity("1");
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-label="Add to collection"
        title="Add to collection"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-raised/90 shadow-sm backdrop-blur transition-transform hover:scale-105 disabled:opacity-70"
      >
        {justAdded ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="var(--emerald)" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="var(--ink-muted)" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        )}
      </button>

      {open && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute bottom-10 right-0 z-10 flex w-56 flex-col gap-2 rounded-card border border-line bg-paper-raised p-3 shadow-lg"
        >
          <label htmlFor={`quick-cost-${cardId}`} className="font-body text-xs font-medium text-ink-muted">
            Cost paid
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-ink-muted">
              $
            </span>
            <input
              id={`quick-cost-${cardId}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              autoFocus
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-10 w-full rounded-full border border-line bg-paper pl-6 pr-3 font-data text-sm text-ink outline-none focus:border-emerald"
            />
          </div>

          <label htmlFor={`quick-condition-${cardId}`} className="font-body text-xs font-medium text-ink-muted">
            Condition
          </label>
          <select
            id={`quick-condition-${cardId}`}
            value={condition}
            onChange={(e) => setCondition(e.target.value as Condition)}
            className="h-10 rounded-full border border-line bg-paper px-3 font-body text-sm text-ink outline-none focus:border-emerald"
          >
            {CONDITIONS.map((code) => (
              <option key={code} value={code}>
                {CONDITION_LABELS[code]}
              </option>
            ))}
          </select>

          <label htmlFor={`quick-quantity-${cardId}`} className="font-body text-xs font-medium text-ink-muted">
            Quantity
          </label>
          <input
            id={`quick-quantity-${cardId}`}
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-10 w-20 rounded-full border border-line bg-paper px-3 font-data text-sm text-ink outline-none focus:border-emerald"
          />

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={handleAdd}
              className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="font-body text-xs font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
