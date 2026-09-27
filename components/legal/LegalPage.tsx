import type { ReactNode } from "react";
import Link from "next/link";
import { AuthNav } from "@/components/AuthNav";
import { BrandLink } from "@/components/BrandLink";
import { LEGAL, LEGAL_PLACEHOLDERS_REMAINING } from "@/lib/legal";

// Shared shell for /privacy, /terms and /support: the same sticky header as
// the rest of the app, a readable single column, and a "Draft" banner while
// lib/legal.ts still has placeholders.
export function LegalPage({
  title,
  showEffectiveDate = true,
  children,
}: {
  title: string;
  showEffectiveDate?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <BrandLink />
          <AuthNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {LEGAL_PLACEHOLDERS_REMAINING.length > 0 && (
          <p className="mb-6 rounded-card border border-amber/40 bg-amber/10 px-4 py-3 font-body text-sm text-ink">
            <span className="font-semibold">Draft.</span> This page still has placeholders to fill in before
            launch ({LEGAL_PLACEHOLDERS_REMAINING.join(", ")} in <code className="font-data">lib/legal.ts</code>).
          </p>
        )}

        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {showEffectiveDate && (
          <p className="mt-2 font-body text-sm text-ink-muted">Effective {LEGAL.effectiveDate}</p>
        )}

        <div className="mt-8 flex flex-col gap-4 font-body text-[15px] leading-relaxed text-ink">
          {children}
        </div>

        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 font-body text-sm">
          <Link href="/privacy" className="text-emerald-strong hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-emerald-strong hover:underline">
            Terms of Use
          </Link>
          <Link href="/support" className="text-emerald-strong hover:underline">
            Support
          </Link>
        </nav>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 pt-2">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{heading}</h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
