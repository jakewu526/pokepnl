import { AnimatedNumber, type NumberFormatKey } from "@/components/AnimatedNumber";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function signedCurrency(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// `value` is always the raw number, never a pre-formatted string -- that's
// what lets AnimatedNumber count up to it. `format` is a named key, not a
// function -- StatTile itself is a Server Component, and a function prop
// can't cross into AnimatedNumber (a Client Component) from here. Callers
// with signed output (P&L tiles) pass "signed-currency"; every other caller
// relies on the plain-currency default.
export function StatTile({
  label,
  value,
  format = "currency",
  sublabel,
  delta,
  deltaLabel = "vs 30d",
  tone = "neutral",
}: {
  label: string;
  value: number;
  format?: NumberFormatKey;
  sublabel?: string;
  delta?: { abs: number; pct: number } | null;
  deltaLabel?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueClass =
    tone === "positive" ? "text-emerald-strong" : tone === "negative" ? "text-amber" : "text-ink";

  return (
    <div className="rounded-card border border-line bg-paper-raised px-3 py-2.5 transition-shadow duration-200 hover:shadow-md sm:px-4 sm:py-4">
      <p className="font-body text-xs text-ink-muted sm:text-sm">
        {label}
        {sublabel && <span className="text-ink-muted/80"> · {sublabel}</span>}
      </p>
      <p className={`rise-in mt-1 font-data text-xl font-medium sm:text-3xl ${valueClass}`}>
        <AnimatedNumber value={value} format={format} />
      </p>
      {delta && delta.abs !== 0 && (
        <p
          className={`mt-1 font-data text-[10px] font-medium sm:text-xs ${
            delta.abs < 0 ? "text-amber" : "text-emerald-strong"
          }`}
        >
          {delta.abs < 0 ? "▼" : "▲"} {signedCurrency(delta.abs)} · {signedPercent(delta.pct)}{" "}
          <span className="hidden sm:inline">{deltaLabel}</span>
        </p>
      )}
    </div>
  );
}
