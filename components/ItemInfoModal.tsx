"use client";

import Link from "next/link";
import { DialogShell } from "@/components/DialogShell";

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

// Read-only. The mobile Portfolio tile shows only the per-unit price plus a
// "More Info" link to keep the grid scannable -- everything the desktop
// tile shows inline (qty, cost, value, unrealized) lives here instead. No
// Sell/Delete in this popup by design: those actions now live on the
// item's own page (see HoldingPanel), reachable via the link at the bottom.
export function ItemInfoModal({
  name,
  imageUrl,
  subtitle,
  quantity,
  cost,
  marketPrice,
  marketValue,
  unrealized,
  unrealizedPct,
  href,
  onClose,
}: {
  name: string;
  imageUrl: string | null;
  subtitle: string;
  quantity: number;
  cost: number | null;
  marketPrice: number | null;
  marketValue: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  href: string;
  onClose: () => void;
}) {
  const totalCost = cost != null ? cost * quantity : null;

  const rows: { label: string; value: string; tone?: "positive" | "negative" }[] = [
    { label: "Quantity", value: String(quantity) },
    { label: "Cost per unit", value: cost != null ? priceFormatter.format(cost) : "—" },
    { label: "Total cost", value: totalCost != null ? priceFormatter.format(totalCost) : "—" },
    { label: "Market price", value: marketPrice != null ? priceFormatter.format(marketPrice) : "—" },
    { label: "Total value", value: marketValue != null ? priceFormatter.format(marketValue) : "—" },
    {
      label: "Unrealized",
      value:
        unrealized != null
          ? `${signedPrice(unrealized)}${unrealizedPct != null ? ` (${signedPercent(unrealizedPct)})` : ""}`
          : "—",
      tone: unrealized != null ? (unrealized < 0 ? "negative" : "positive") : undefined,
    },
  ];

  return (
    <DialogShell onClose={onClose} title={name} subtitle={subtitle} imageUrl={imageUrl}>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="font-body text-sm text-ink-muted">{row.label}</dt>
            <dd
              className={`font-data text-sm font-medium ${
                row.tone === "negative" ? "text-amber" : row.tone === "positive" ? "text-emerald-strong" : "text-ink"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href={href}
        onClick={onClose}
        className="mt-4 inline-block font-body text-sm font-medium text-emerald-strong hover:underline"
      >
        View item page →
      </Link>
    </DialogShell>
  );
}
