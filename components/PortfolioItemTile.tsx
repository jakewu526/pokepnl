"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SellOrDeleteButton } from "@/components/SellOrDeleteButton";
import { ItemInfoModal } from "@/components/ItemInfoModal";
import { PositionActivityModal, type PositionActivityKey } from "@/components/PositionActivityModal";

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

// `status: "open"` is a live position -- Sell/Delete act on it and Value
// compares current holdings to today's price. `status: "closed"` is a
// fully-sold-out position with no CollectionItem (see getClosedPositions in
// lib/pnl.ts) -- there's nothing left to sell or delete, so it shows what
// actually happened at sale (avg sale price, proceeds, realized P/L) instead,
// with a History button in place of Sell/Delete.
type OpenProps = {
  status?: "open";
  quantity: number;
  cost: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  collectionItemId: string;
  marketPrice: number | null;
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

// Shared tile for both cards and sealed product holdings -- the two blocks in
// the old collection page were identical apart from the image fallback label
// and the subtitle string, so the caller builds those and this just renders.
//
// Below md, an *open* position renders a slimmed-down body -- image, name,
// subtitle, one per-unit price (same meaning as CardTile's price line, so a
// tile reads the same everywhere in the app), and a plain-text "More Info"
// link that opens ItemInfoModal with everything else. Sell/Delete are
// dropped from the mobile tile entirely -- those actions now live on the
// item's own page (see HoldingPanel), reachable from the modal's "View item
// page" link. At md and up an open position is unchanged from before this
// batch. A *closed* position (no live holding left to act on) keeps its
// existing Qty/Cost/Value/P&L + History layout at every width -- it's a
// read-only history view already, so it doesn't need the same decluttering.
export function PortfolioItemTile(
  props: {
    href: string;
    imageUrl: string | null;
    imageAlt: string;
    fallbackLabel: string;
    name: string;
    subtitle: string;
  } & (OpenProps | ClosedProps)
) {
  const { href, imageUrl, imageAlt, fallbackLabel, name, subtitle, quantity, cost } = props;
  const closed = props.status === "closed";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const marketPrice = closed ? props.avgSalePrice : props.marketPrice;
  const value = closed ? props.avgSalePrice * quantity : props.marketPrice != null ? props.marketPrice * quantity : null;
  const pnl = closed ? props.realizedProfit : props.unrealized;
  const pnlPct = closed ? props.realizedProfitPct : props.unrealizedPct;

  const positionKey: PositionActivityKey = closed
    ? { cardId: props.cardId, sealedProductId: props.sealedProductId, condition: props.condition }
    : { collectionItemId: props.collectionItemId };

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised">
      <Link href={href} className="relative aspect-[5/7] bg-line/40">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw"
            className="object-contain p-2"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            {fallbackLabel}
          </div>
        )}
        {closed && (
          <span className="absolute left-2 top-2 rounded-full border border-line bg-paper/90 px-1.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-wide text-ink-muted backdrop-blur">
            Closed
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
        <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">{name}</h2>
        <p className="font-body text-[13px] text-ink-muted">{subtitle}</p>

        {closed ? (
          <>
            <p className="font-data text-[13px] text-ink-muted">Qty {quantity}</p>
            <p className="font-data text-[13px] text-ink-muted">
              Cost {cost != null ? priceFormatter.format(cost) : "—"}
            </p>
            <p className="font-data text-[13px] text-ink-muted">
              Value {value != null ? priceFormatter.format(value) : "—"}
              {marketPrice != null && (
                <span className="text-ink-muted/70"> ({priceFormatter.format(marketPrice)}/ea)</span>
              )}
            </p>
            {pnl != null && (
              <p className={`font-data text-[13px] font-medium ${pnl < 0 ? "text-amber" : "text-emerald-strong"}`}>
                {signedPrice(pnl)}
                {pnlPct != null && (
                  <span className="ml-1 font-body font-normal text-ink-muted">({signedPercent(pnlPct)})</span>
                )}
              </p>
            )}
            <div className="mt-auto pt-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="font-body text-xs font-medium text-ink-muted hover:text-ink"
              >
                History
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Mobile: one price, one "More Info" link. */}
            <div className="md:hidden">
              <p className="font-data text-lg font-medium text-emerald-strong">
                {marketPrice != null ? priceFormatter.format(marketPrice) : "—"}
              </p>
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="mt-1 font-body text-[13px] font-medium text-emerald-strong"
              >
                More Info
              </button>
            </div>

            {/* Desktop: full breakdown + Sell/Delete, unchanged from before. */}
            <div className="hidden md:contents">
              <p className="font-data text-[13px] text-ink-muted">Qty {quantity}</p>
              <p className="font-data text-[13px] text-ink-muted">
                Cost {cost != null ? priceFormatter.format(cost) : "—"}
              </p>
              <p className="font-data text-[13px] text-ink-muted">
                Value {value != null ? priceFormatter.format(value) : "—"}
                {marketPrice != null && (
                  <span className="text-ink-muted/70"> ({priceFormatter.format(marketPrice)}/ea)</span>
                )}
              </p>
              {pnl != null && (
                <p className={`font-data text-[13px] font-medium ${pnl < 0 ? "text-amber" : "text-emerald-strong"}`}>
                  {signedPrice(pnl)}
                  {pnlPct != null && (
                    <span className="ml-1 font-body font-normal text-ink-muted">({signedPercent(pnlPct)})</span>
                  )}
                </p>
              )}
              <div className="mt-auto pt-2">
                <SellOrDeleteButton
                  collectionItemId={props.collectionItemId}
                  itemName={name}
                  imageUrl={imageUrl}
                  quantity={quantity}
                  marketPrice={props.marketPrice}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {closed && (
        <PositionActivityModal
          positionKey={historyOpen ? positionKey : null}
          itemName={name}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {!closed && infoOpen && (
        <ItemInfoModal
          name={name}
          imageUrl={imageUrl}
          subtitle={subtitle}
          quantity={quantity}
          cost={cost}
          marketPrice={marketPrice}
          marketValue={value}
          unrealized={pnl}
          unrealizedPct={pnlPct}
          href={href}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </div>
  );
}
