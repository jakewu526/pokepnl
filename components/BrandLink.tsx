import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

// The wordmark as a link home, for every page that isn't the catalog itself.
// Replaces the old per-page "← Cards" / "← Dashboard" back links: those sat
// at a different size and baseline than the catalog's own wordmark, so the
// top-left corner jumped every time you navigated. Keeping the mark and
// wordmark byte-identical to app/page.tsx's header (same classes, same
// px-4/sm:px-6 py-5 container) is what holds that corner still.
export function BrandLink() {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <BrandMark />
      <span className="font-display text-2xl font-semibold tracking-tight text-ink group-hover:underline sm:text-3xl">
        PokePnL
      </span>
    </Link>
  );
}
