"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { updateCollectionItem } from "@/app/actions/collection";
import { SellOrDeleteButton } from "@/components/SellOrDeleteButton";
import { PositionActivityModal } from "@/components/PositionActivityModal";
import { CONDITIONS, CONDITION_LABELS, isCondition, type Condition } from "@/lib/condition";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// Table-row counterpart to PortfolioItemTile -- same underlying data, same
// edit/sell/delete actions, just laid out for the table view. Quantity,
// cost, and condition are edited inline (blur-to-save) rather than via a
// separate form, since a table row has room for that already.
export function PortfolioTableRow({
  href,
  imageUrl,
  imageAlt,
  itemType,
  name,
  setName,
  condition,
  quantity,
  cost,
  marketPrice,
  unrealizedAbs,
  unrealizedPct,
  collectionItemId,
}: {
  href: string;
  imageUrl: string | null;
  imageAlt: string;
  itemType: "card" | "sealed";
  name: string;
  setName: string | null;
  condition: string | null;
  quantity: number;
  cost: number | null;
  marketPrice: number | null;
  unrealizedAbs: number | null;
  unrealizedPct: number | null;
  collectionItemId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(quantity));
  const [costDraft, setCostDraft] = useState(cost != null ? cost.toFixed(2) : "");
  const [conditionDraft, setConditionDraft] = useState(condition ?? "");

  // Drafts only seed from props on mount -- without these, an edit made
  // elsewhere (the History modal's ledger edits, which recompute this same
  // position) would revalidate the page but leave these inputs showing the
  // stale value until a hard reload re-mounts the row.
  useEffect(() => setQtyDraft(String(quantity)), [quantity]);
  useEffect(() => setCostDraft(cost != null ? cost.toFixed(2) : ""), [cost]);
  useEffect(() => setConditionDraft(condition ?? ""), [condition]);

  function commitQuantity() {
    const parsed = Math.floor(Number(qtyDraft));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed === quantity) {
      setQtyDraft(String(quantity));
      return;
    }
    startTransition(() => updateCollectionItem(collectionItemId, { quantity: parsed }));
  }

  function commitCost() {
    const trimmed = costDraft.trim();
    const parsed = trimmed === "" ? null : parseFloat(trimmed);
    if (trimmed !== "" && (!Number.isFinite(parsed) || (parsed as number) < 0)) {
      setCostDraft(cost != null ? cost.toFixed(2) : "");
      return;
    }
    if (parsed === cost) return;
    startTransition(() => updateCollectionItem(collectionItemId, { costPerUnit: parsed }));
  }

  function commitCondition(next: string) {
    setConditionDraft(next);
    if (!next || next === condition) return;
    startTransition(() => updateCollectionItem(collectionItemId, { condition: next }));
  }

  const marketValue = marketPrice != null ? marketPrice * quantity : null;

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
            {imageUrl && <Image src={imageUrl} alt={imageAlt} fill sizes="40px" className="object-contain" />}
          </div>
          <div className="min-w-0">
            <Link href={href} className="block truncate font-body text-sm font-medium text-ink hover:underline">
              {name}
            </Link>
            {setName && <p className="truncate font-body text-xs text-ink-muted">{setName}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        {itemType === "card" ? (
          <select
            value={isCondition(conditionDraft) ? conditionDraft : "NM"}
            onChange={(e) => commitCondition(e.target.value as Condition)}
            disabled={pending}
            aria-label="Condition"
            className="h-8 rounded-full border border-line bg-paper px-2 font-body text-xs text-ink outline-none focus:border-emerald disabled:opacity-60"
          >
            {CONDITIONS.map((code) => (
              <option key={code} value={code}>
                {CONDITION_LABELS[code]}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={conditionDraft}
            onChange={(e) => setConditionDraft(e.target.value)}
            onBlur={(e) => commitCondition(e.target.value.trim())}
            disabled={pending}
            aria-label="Condition"
            className="h-8 w-28 rounded-full border border-line bg-paper px-2 font-body text-xs text-ink outline-none focus:border-emerald disabled:opacity-60"
          />
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={commitQuantity}
          disabled={pending}
          aria-label="Quantity"
          className="h-8 w-16 rounded-full border border-line bg-paper px-2 font-data text-xs text-ink outline-none focus:border-emerald disabled:opacity-60"
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative w-24">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-data text-xs text-ink-muted">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="—"
            value={costDraft}
            onChange={(e) => setCostDraft(e.target.value)}
            onBlur={commitCost}
            disabled={pending}
            aria-label="Cost per unit"
            className="h-8 w-full rounded-full border border-line bg-paper pl-5 pr-2 font-data text-xs text-ink outline-none focus:border-emerald disabled:opacity-60"
          />
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">
        {marketPrice != null ? priceFormatter.format(marketPrice) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink">
        {marketValue != null ? priceFormatter.format(marketValue) : "—"}
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2 font-data text-xs font-medium ${
          unrealizedAbs == null ? "text-ink-muted" : unrealizedAbs < 0 ? "text-amber" : "text-emerald-strong"
        }`}
      >
        {unrealizedAbs != null ? signedPrice(unrealizedAbs) : "—"}
        {unrealizedPct != null && (
          <span className="ml-1 font-body font-normal text-ink-muted">({signedPercent(unrealizedPct)})</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="font-body text-xs font-medium text-ink-muted hover:text-ink"
          >
            History
          </button>
          <SellOrDeleteButton collectionItemId={collectionItemId} quantity={quantity} marketPrice={marketPrice} />
        </div>
        <PositionActivityModal
          collectionItemId={historyOpen ? collectionItemId : null}
          itemName={name}
          onClose={() => setHistoryOpen(false)}
        />
      </td>
    </tr>
  );
}
