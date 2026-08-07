"use client";

import { useEffect, useState } from "react";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function signedCurrency(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// Named formatter keys, not functions -- a function prop can't cross the
// Server -> Client boundary (React errors: "Functions cannot be passed
// directly to Client Components"). Server Component callers like StatTile
// pass one of these strings instead, and the actual formatter is resolved
// here, inside client-only code.
const FORMATTERS = {
  currency: (n: number) => priceFormatter.format(n),
  "signed-currency": signedCurrency,
} satisfies Record<string, (n: number) => string>;

export type NumberFormatKey = keyof typeof FORMATTERS;

// Counts up from 0 to `value` on mount. Renders the *final* formatted value
// during SSR and the initial client render -- the count-up only starts once
// an effect runs post-hydration, so server and first-paint markup match
// exactly (no hydration warning) and no-JS clients simply see the real
// number. Callers must wrap this in a `.rise-in` element: that's what hides
// the animation's first frame (which briefly renders 0) behind the
// container's own opacity:0 -> 1 fade. Under prefers-reduced-motion, both
// this component and .rise-in collapse to their end states instantly.
export function AnimatedNumber({
  value,
  format = "currency",
  durationMs = 600,
  className = "",
}: {
  value: number;
  format?: NumberFormatKey;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const formatFn = FORMATTERS[format];

  useEffect(() => {
    // Reduced motion collapses to a single, immediate-next-frame tick (t=1)
    // rather than calling setState synchronously in the effect body itself --
    // every setState here happens inside the rAF callback, an external
    // timing subscription, never as a direct side effect of mounting.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const effectiveDuration = reduced ? 0 : durationMs;
    const start = performance.now();
    let raf = 0;

    function tick(now: number) {
      const t = effectiveDuration === 0 ? 1 : Math.min(1, (now - start) / effectiveDuration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={`tabular-nums ${className}`}>{formatFn(display)}</span>;
}
