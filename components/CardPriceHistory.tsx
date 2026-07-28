"use client";

import { useState } from "react";
import type { PricePoint } from "@/lib/cards";
import { PriceChart } from "./PriceChart";

type Series = { points: PricePoint[]; source: string | null };

export function CardPriceHistory({
  normal,
  reverseHolo,
}: {
  normal: Series;
  reverseHolo: Series | null;
}) {
  const [variant, setVariant] = useState<"normal" | "reverseHolo">("normal");

  if (!reverseHolo) {
    return <PriceChart points={normal.points} source={normal.source} showRangeControls />;
  }

  const active = variant === "normal" ? normal : reverseHolo;

  return (
    <div>
      <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-line p-0.5">
        {(
          [
            ["normal", "Normal"],
            ["reverseHolo", "Reverse Holo"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setVariant(key)}
            className={`rounded-full px-2.5 py-1 font-body text-xs font-medium transition ${
              variant === key
                ? "bg-ink text-paper"
                : "text-ink-muted hover:bg-paper hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <PriceChart points={active.points} source={active.source} showRangeControls />
    </div>
  );
}
