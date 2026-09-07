"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { SellOrDeleteButton } from "@/components/SellOrDeleteButton";
import { PositionActivityModal, type PositionActivityKey } from "@/components/PositionActivityModal";
import { CONDITION_LABELS, isCondition, type Condition } from "@/lib/condition";

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
// sell/delete actions, just laid out for the table view. Condition, quantity,
// and cost are all read-only here -- condition is part of the same
// (userId, cardId|sealedProductId, condition) key that groups a position's
// PurchaseLot/Transaction rows, and quantity/cost are computed from those rows
// (see recomputePosition in collection.ts), so all three would drift from the
// ledger if edited directly on CollectionItem. Fix them via the History
// modal's per-lot/per-sale forms instead.
// `status: "open"` is a live position -- Sell/Delete act on it and the
// Market/Value/Unrealized columns compare current holdings to today's price.
// `status: "closed"` is a fully-sold-out position with no CollectionItem
// (see getClosedPositions in lib/pnl.ts) -- there's nothing left to sell or
// delete, so those columns show what actually happened at sale (avg sale
// price, proceeds, realized P/L) instead.
type OpenProps = {
  status?: "open";
  quantity: number;
  cost: number | null;
  marketPrice: number | null;
  unrealizedAbs: number | null;
  unrealizedPct: number | null;
  collectionItemId: string;
};
type ClosedProps = {
  status: "closed";
  quantity: number;
  cost: number | null;
  avgSalePrice: number;
  realizedProfit: number | null;
  realizedProfitPct: number | null;
  cardId: string | null;
  sealedProductId: string | null;
  condition: string | null;
};

export function PortfolioTableRow(
  props: {
    href: string;
    imageUrl: string | null;
    imageAlt: string;
    itemType: "card" | "sealed";
    name: string;
    setName: string | null;
    condition: string | null;
  } & (OpenProps | ClosedProps)
) {
  const { href, imageUrl, imageAlt, itemType, name, setName, condition, quantity, cost } = props;
  const closed = props.status === "closed";
  const [historyOpen, setHistoryOpen] = useState(false);

  const marketPrice = closed ? props.avgSalePrice : props.marketPrice;
  const value = closed ? props.avgSalePrice * quantity : props.marketPrice != null ? props.marketPrice * quantity : null;
  const pnlAbs = closed ? props.realizedProfit : props.unrealizedAbs;
  const pnlPct = closed ? props.realizedProfitPct : props.unrealizedPct;

  const positionKey: PositionActivityKey = closed
    ? { cardId: props.cardId, sealedProductId: props.sealedProductId, condition: props.condition }
    : { collectionItemId: props.collectionItemId };

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
            {imageUrl && <Image src={imageUrl} alt={imageAlt} fill sizes="40px" className="object-contain" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link href={href} className="block truncate font-body text-sm font-medium text-ink hover:underline">
                {name}
              </Link>
              {closed && (
                <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  Closed
                </span>
              )}
            </div>
            {setName && <p className="truncate font-body text-xs text-ink-muted">{setName}</p>}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-body text-xs text-ink">
        {itemType === "card"
          ? isCondition(condition ?? undefined)
            ? CONDITION_LABELS[condition as Condition]
            : "—"
          : condition || "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink">{quantity}</td>
      <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink">
        {cost != null ? priceFormatter.format(cost) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink-muted">
        {marketPrice != null ? priceFormatter.format(marketPrice) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink">
        {value != null ? priceFormatter.format(value) : "—"}
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2 font-data text-xs font-medium ${
          pnlAbs == null ? "text-ink-muted" : pnlAbs < 0 ? "text-amber" : "text-emerald-strong"
        }`}
      >
        {pnlAbs != null ? signedPrice(pnlAbs) : "—"}
        {pnlPct != null && <span className="ml-1 font-body font-normal text-ink-muted">({signedPercent(pnlPct)})</span>}
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
          {!closed && (
            <SellOrDeleteButton
              collectionItemId={props.collectionItemId}
              itemName={name}
              imageUrl={imageUrl}
              quantity={quantity}
              marketPrice={props.marketPrice}
            />
          )}
        </div>
        <PositionActivityModal
          positionKey={historyOpen ? positionKey : null}
          itemName={name}
          onClose={() => setHistoryOpen(false)}
        />
      </td>
    </tr>
  );
}
