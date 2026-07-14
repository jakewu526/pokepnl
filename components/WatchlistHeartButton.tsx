"use client";

import { useState, useTransition } from "react";
import {
  addCardToWatchlist,
  removeCardFromWatchlist,
  addSealedToWatchlist,
  removeSealedFromWatchlist,
} from "@/app/actions/watchlist";

type Target = { cardId: string; sealedProductId?: undefined } | { sealedProductId: string; cardId?: undefined };

export function WatchlistHeartButton({
  target,
  initialWatched,
  className = "",
}: {
  target: Target;
  initialWatched: boolean;
  className?: string;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    // Tiles wrap their whole card in a <Link> -- this button sits alongside
    // it (never nested inside the anchor), but stopping propagation here is
    // a cheap guard against ever bubbling into a parent navigation handler.
    e.preventDefault();
    e.stopPropagation();

    const next = !watched;
    const isCard = target.cardId != null;
    const id = (target.cardId ?? target.sealedProductId)!;

    setWatched(next); // optimistic
    startTransition(async () => {
      try {
        if (isCard) {
          await (next ? addCardToWatchlist(id) : removeCardFromWatchlist(id));
        } else {
          await (next ? addSealedToWatchlist(id) : removeSealedFromWatchlist(id));
        }
      } catch {
        setWatched(!next); // revert on failure
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={watched}
      aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-raised/90 shadow-sm backdrop-blur transition-transform hover:scale-105 disabled:opacity-70 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={watched ? "var(--emerald)" : "none"}
        stroke={watched ? "var(--emerald)" : "var(--ink-muted)"}
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 20.5s-7.5-4.6-10-9.3C.5 8 2 4.5 5.5 4c2.1-.3 4 .8 6.5 3.4C14.5 4.8 16.4 3.7 18.5 4 22 4.5 23.5 8 22 11.2 19.5 15.9 12 20.5 12 20.5Z"
        />
      </svg>
    </button>
  );
}
