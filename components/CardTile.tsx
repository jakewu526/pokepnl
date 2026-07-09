import Image from "next/image";
import type { CardListItem } from "@/lib/cards";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatNumber(number: string, setTotal: number | null): string {
  if (!setTotal) return number;
  const padded = number.padStart(String(setTotal).length, "0");
  return `${padded}/${setTotal}`;
}

export function CardTile({ card }: { card: CardListItem }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised transition-shadow hover:shadow-[0_2px_0_var(--line)]">
      <div className="relative aspect-[5/7] bg-line/40">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={`${card.name}, ${card.setName} #${card.number}`}
            fill
            sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw"
            className="object-contain p-2"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            No image
          </div>
        )}
        {card.rarity && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-tint px-2 py-0.5 font-body text-[11px] font-medium text-amber">
            {card.rarity}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
        <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">
          {card.name}
        </h2>
        <p className="font-body text-[13px] text-ink-muted">
          {card.setName} ·{" "}
          <span className="font-data">{formatNumber(card.number, card.setTotal)}</span>
        </p>
        <div className="mt-auto pt-2">
          {card.price != null ? (
            <p className="font-data text-lg font-medium text-emerald-strong">
              {priceFormatter.format(card.price)}
            </p>
          ) : (
            <p className="font-data text-sm text-ink-muted">No price yet</p>
          )}
        </div>
      </div>
    </article>
  );
}
