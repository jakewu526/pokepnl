import Link from "next/link";
import { TRADEMARK_DISCLAIMER } from "@/lib/legal";

// Rendered once from the root layout, under every page. The store review
// checklists want the privacy policy reachable from inside the app, and the
// trademark disclaimer belongs anywhere card names and images are shown.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:px-6">
        <nav className="flex flex-wrap gap-x-5 gap-y-1 font-body text-sm">
          <Link href="/privacy" className="inline-flex min-h-10 items-center text-ink-muted hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center text-ink-muted hover:text-ink">
            Terms
          </Link>
          <Link href="/support" className="inline-flex min-h-10 items-center text-ink-muted hover:text-ink">
            Support
          </Link>
        </nav>
        <p className="max-w-3xl font-body text-xs leading-relaxed text-ink-muted">{TRADEMARK_DISCLAIMER}</p>
      </div>
    </footer>
  );
}
