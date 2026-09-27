import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL, TRADEMARK_DISCLAIMER, legalValue } from "@/lib/legal";

export const metadata: Metadata = { title: `Terms of Use — ${LEGAL.appName}` };

// Plain-language terms sized for a free hobby app. Worth a once-over by a
// parent/guardian (who likely holds the store accounts) before launch.
export default function TermsPage() {
  const email = legalValue("contactEmail");

  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms are the rules for using {LEGAL.appName}, which is run by {legalValue("operatorName")}{" "}
        (&ldquo;we&rdquo;). By creating an account or using the app, you agree to them. Please also read our{" "}
        <Link href="/privacy" className="text-emerald-strong hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <LegalSection heading="Who can use it">
        <p>
          You must be at least {LEGAL.minimumAge} years old. If you&apos;re under 18, please make sure a parent or
          guardian is OK with you using the app. You&apos;re responsible for keeping your password safe and for what
          happens on your account.
        </p>
      </LegalSection>

      <LegalSection heading="Prices are estimates, not advice">
        <p>
          Card and product prices come from third-party market data and are updated about once a day. They can be
          late, incomplete or wrong, and what something actually sells for can differ a lot. {LEGAL.appName} is a
          tracking tool for fun. It isn&apos;t financial advice. Don&apos;t rely on it alone when you buy, sell or
          trade.
        </p>
      </LegalSection>

      <LegalSection heading="Trading with friends">
        <p>
          The in-app trade feature only updates what each person&apos;s binder shows. It doesn&apos;t move any real
          cards or money. Any real-world exchange is between you and the other person, and we&apos;re not
          responsible for it. Only trade with people you actually know and trust.
        </p>
      </LegalSection>

      <LegalSection heading="Be decent">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "use an offensive or impersonating name, or harass, threaten, scam or spam other people;",
            "try to access other people's accounts or data, or break or overload the app;",
            "scrape or copy the app's data in bulk, or use the app for anything illegal.",
          ]}
        />
        <p>
          You can block or report anyone from your friends list. We review reports and may suspend or delete
          accounts that break these rules.
        </p>
      </LegalSection>

      <LegalSection heading="Your stuff and ours">
        <p>
          The collection data you enter is yours. We only use it to run the app for you. The app&apos;s own design
          and code belong to us.
        </p>
        <p>{TRADEMARK_DISCLAIMER} Card images and names are shown only to identify the cards you collect.</p>
      </LegalSection>

      <LegalSection heading="Ending your account">
        <p>
          You can delete your account anytime in{" "}
          <Link href="/settings" className="text-emerald-strong hover:underline">
            Settings → Account
          </Link>
          . We may suspend or close accounts that break these terms. We may also change or shut down the app, and
          we&apos;ll try to give notice first.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          The app is provided &ldquo;as is&rdquo;, without warranties of any kind. As far as the law allows, we
          aren&apos;t liable for losses from using the app, including decisions you make based on its prices, or from
          it being unavailable.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and governing law">
        <p>
          We may update these terms. If we do, we&apos;ll change the date at the top and tell you in the app if the
          change is significant. These terms are governed by the laws of {legalValue("governingLaw")}, United States.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions? Email{" "}
          <a href={`mailto:${email}`} className="text-emerald-strong hover:underline">
            {email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
