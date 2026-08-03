"use client";

import Image from "next/image";
import Link from "next/link";
import type { CardListItem } from "@/lib/cards";
import { WatchlistHeartButton } from "@/components/WatchlistHeartButton";
import { QuickAddToCollectionButton } from "@/components/QuickAddToCollectionButton";
import { useBinderSelection } from "@/components/BinderSelection";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatNumber(number: string, setTotal: number | null): string {
  if (!setTotal) return number;
  const padded = number.padStart(String(setTotal).length, "0");
  return `${padded}/${setTotal}`;
}

// `watched` is `undefined` for signed-out visitors -- the buttons still
// render (so the feature is discoverable), they just redirect to signup
// instead of saving anything, since there's nowhere yet for them to save it.
export function CardTile({ card, watched }: { card: CardListItem; watched?: boolean }) {
  const isAuthed = watched != null;
  const { active, selected, toggle } = useBinderSelection();
  const isSelected = selected.has(card.id);

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-card border bg-paper-raised transition-shadow hover:shadow-[0_2px_0_var(--line)] ${
        isSelected ? "border-emerald ring-2 ring-emerald" : "border-line"
      }`}
    >
      <Link
        href={`/cards/${card.id}`}
        className="flex flex-1 flex-col"
        onClick={(e) => {
          if (!active) return;
          e.preventDefault();
          toggle(card.id, card.price);
        }}
      >
        {active && (
          <span
            aria-hidden="true"
            className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
              isSelected ? "border-emerald bg-emerald" : "border-line bg-paper-raised/90"
            }`}
          >
            {isSelected && (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="var(--paper-raised)" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            )}
          </span>
        )}
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
      </Link>
      {!active && (
        <>
          <WatchlistHeartButton
            target={{ cardId: card.id }}
            initialWatched={watched ?? false}
            isAuthed={isAuthed}
            className="absolute top-2 right-2"
          />
          <QuickAddToCollectionButton
            cardId={card.id}
            marketPrice={card.price}
            isAuthed={isAuthed}
            className="absolute bottom-3 right-3"
          />
        </>
      )}
    </div>
  );
}
