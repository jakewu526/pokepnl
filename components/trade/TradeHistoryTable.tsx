import Image from "next/image";
import type { TradeListItem, TradeMovement } from "@/lib/pnl";

function RowThumb({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  return (
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-line/40 sm:h-10 sm:w-10">
      {imageUrl && <Image src={imageUrl} alt={name} fill sizes="40px" className="object-contain" />}
    </div>
  );
}

function MovementList({ items }: { items: TradeMovement[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 sm:gap-2">
          <RowThumb imageUrl={item.imageUrl} name={item.itemName} />
          <span>
            {item.itemName}
            {item.quantity > 1 && <span className="text-ink-muted"> ×{item.quantity}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// Modeled after BuyTable/SellTable in RecentTransactions.tsx, but no price or
// P/L column -- a trade is never shown as a sale (see the plain-language
// rule in app/actions/trades.ts). One row per grouped trade event -- a
// multi-item trade lists every given/received card in its own cell rather
// than splitting into separate rows.
export function TradeHistoryTable({ trades }: { trades: TradeListItem[] }) {
  if (trades.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-paper-raised">
      <table className="w-full text-left font-body text-sm sm:min-w-[640px]">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="px-2 py-2 sm:px-3 font-medium">Date</th>
            <th className="px-2 py-2 sm:px-3 font-medium">You gave</th>
            <th className="px-2 py-2 sm:px-3 font-medium">You got</th>
            <th className="hidden px-2 py-2 sm:px-3 font-medium sm:table-cell">With</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.groupId} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-2 py-2 sm:px-3 font-data text-xs text-ink-muted align-top">{t.tradedAt}</td>
              <td className="px-2 py-2 sm:px-3 text-ink align-top">
                <MovementList items={t.givenItems} />
              </td>
              <td className="px-2 py-2 sm:px-3 text-ink align-top">
                <MovementList items={t.receivedItems} />
              </td>
              <td className="hidden px-2 py-2 sm:px-3 font-data text-xs text-ink-muted align-top sm:table-cell">
                {t.counterpartyLabel ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
