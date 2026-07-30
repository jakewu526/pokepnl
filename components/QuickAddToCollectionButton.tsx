"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCollection } from "@/app/actions/collection";

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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    // Tiles wrap their whole card in a <Link> -- this button sits alongside
    // it (never nested inside the anchor), but stopping propagation here is
    // a cheap guard against ever bubbling into a parent navigation handler.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthed) {
      router.push("/signup");
      return;
    }

    startTransition(async () => {
      await addToCollection(cardId);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1200);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Add to collection"
      title="Add to collection"
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-raised/90 shadow-sm backdrop-blur transition-transform hover:scale-105 disabled:opacity-70 ${className}`}
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
  );
}
