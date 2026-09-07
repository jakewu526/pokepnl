import { SellOrDeleteButton } from "@/components/SellOrDeleteButton";
import { CONDITION_LABELS, type Condition } from "@/lib/condition";
import type { Holding } from "@/lib/portfolio";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// "In your binder" -- the card/sealed-product detail page's own record of
// what the signed-in viewer owns of *this* item. Neither /cards/[id] nor
// /sealed/[id] had any such block before this: the page could tell you the
// market price of a card but never that you already held it. That gap is
// what forces Sell/Delete onto the mobile Portfolio tile today; this panel
// is what lets step 6 of the mobile batch move those actions here instead.
//
// A card (or sealed product) can be held in more than one condition at once
// -- CollectionItem is uniquely keyed on (userId, cardId, condition) -- so
// `holdings` is a list, one row per position, not a single value.
export function HoldingPanel({ holdings, imageUrl }: { holdings: Holding[]; imageUrl: string | null }) {
  if (holdings.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-paper-raised p-4 sm:p-5">
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">In your binder</h2>
      <ul className="flex flex-col gap-3">
        {holdings.map((holding) => (
          <li
            key={holding.id}
            className="flex flex-col gap-2 rounded-card border border-line px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-data text-[13px] text-ink-muted">
              {holding.condition && (
                <span className="font-body font-medium text-ink">
                  {CONDITION_LABELS[holding.condition as Condition] ?? holding.condition}
                </span>
              )}
              <span>Qty {holding.quantity}</span>
              <span>Cost {holding.cost != null ? priceFormatter.format(holding.cost) : "—"}</span>
              <span>Market {holding.marketPrice != null ? priceFormatter.format(holding.marketPrice) : "—"}</span>
              <span>Value {holding.marketValue != null ? priceFormatter.format(holding.marketValue) : "—"}</span>
              {holding.unrealized != null && (
                <span className={`font-medium ${holding.unrealized < 0 ? "text-amber" : "text-emerald-strong"}`}>
                  {signedPrice(holding.unrealized)}
                  {holding.unrealizedPct != null && (
                    <span className="ml-1 font-body font-normal text-ink-muted">
                      ({signedPercent(holding.unrealizedPct)})
                    </span>
                  )}
                </span>
              )}
            </div>
            <SellOrDeleteButton
              collectionItemId={holding.id}
              itemName={CONDITION_LABELS[holding.condition as Condition] ?? holding.condition ?? "This position"}
              imageUrl={imageUrl}
              quantity={holding.quantity}
              marketPrice={holding.marketPrice}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
