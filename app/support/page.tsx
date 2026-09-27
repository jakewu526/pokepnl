import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL, legalValue } from "@/lib/legal";

export const metadata: Metadata = { title: `Support — ${LEGAL.appName}` };

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Where do the prices come from?",
    a: "Market prices from PriceCharting, TCGplayer and Cardmarket, refreshed about once a day. A card whose price hasn't updated in a while shows a warning on its page.",
  },
  {
    q: "Why is a card's price missing or off?",
    a: "Some cards (especially promos and rare variants) have few recent sales, so there's little data to price them. Email us the card and set and we'll take a look.",
  },
  {
    q: "How do I add a friend?",
    a: (
      <>
        Open{" "}
        <Link href="/settings" className="text-emerald-strong hover:underline">
          Settings
        </Link>
        , share your friend code, or type in theirs under &ldquo;Add a friend&rdquo;. You need to be friends to
        start a trade.
      </>
    ),
  },
  {
    q: "Does trading in the app move real cards or money?",
    a: "No. It only updates what each person's binder shows. Any real-world exchange is up to the two of you.",
  },
  {
    q: "How do I block or report someone?",
    a: "In Settings, tap ••• next to their name in your friends or requests list, then choose Block or Report.",
  },
  {
    q: "How do I disconnect eBay?",
    a: "In Settings → Integrations, choose Disconnect on the eBay card.",
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Go to{" "}
        <Link href="/settings" className="text-emerald-strong hover:underline">
          Settings → Account
        </Link>{" "}
        and choose Delete account. This permanently removes everything and can&apos;t be undone.
      </>
    ),
  },
];

export default function SupportPage() {
  const email = legalValue("contactEmail");

  return (
    <LegalPage title="Support" showEffectiveDate={false}>
      <p>
        Found a bug, have a question, or want to suggest something? Email{" "}
        <a href={`mailto:${email}`} className="font-medium text-emerald-strong hover:underline">
          {email}
        </a>{" "}
        and we&apos;ll get back to you, usually within a couple of days.
      </p>

      <LegalSection heading="Common questions">
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-paper-raised">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-4">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium text-ink">
                {item.q}
                <span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-4 text-ink-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </LegalSection>
    </LegalPage>
  );
}
