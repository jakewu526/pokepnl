import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL, legalValue } from "@/lib/legal";

export const metadata: Metadata = { title: `Privacy Policy — ${LEGAL.appName}` };

// Written against what the app actually stores (prisma/schema.prisma) --
// if a new table or third-party service starts holding user data, this page
// and the App Store / Play "data safety" answers need updating with it.
export default function PrivacyPage() {
  const email = legalValue("contactEmail");

  return (
    <LegalPage title="Privacy Policy">
      <p>
        {LEGAL.appName} helps you track your Pokémon card collection and what it&apos;s worth. This policy explains
        what we collect, why, and the choices you have. {LEGAL.appName} is run by {legalValue("operatorName")}{" "}
        (&ldquo;we&rdquo;).
      </p>
      <p className="font-semibold">
        The short version: we only collect what the app needs to work, we never sell your data, and there are no ads
        or third-party trackers. You can delete your account and everything in it at any time.
      </p>

      <LegalSection heading="What we collect">
        <LegalList
          items={[
            <>
              <strong>Account details</strong>: your name and email address. If you sign up with a password, we store
              only a one-way encrypted hash of it, never the password itself. If you sign in with Google, we store your
              Google account ID and the name and email Google shares with us.
            </>,
            <>
              <strong>What you add to the app</strong>: the cards and sealed products in your binder, what you paid
              and when, sales you record, your watchlist, and trades you log.
            </>,
            <>
              <strong>Friends and trading</strong>: your friend code, friend requests, the trades you set up with
              friends, and any accounts you block or report (including the reason and any note you write).
            </>,
            <>
              <strong>eBay (only if you connect it)</strong>: your eBay user ID, the access tokens eBay gives us to
              read your sold orders, and the details of those sales (item, price, fees, date). We can&apos;t list,
              buy or message on eBay for you.
            </>,
            <>
              <strong>Cookies</strong>: a sign-in cookie that keeps you logged in, and a few short-lived cookies used
              during Google or eBay sign-in. We don&apos;t use advertising or analytics cookies.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="How we use it">
        <LegalList
          items={[
            "To run the app: showing your collection, its value over time, and your history.",
            "To let you add friends and trade with them.",
            "To keep the app safe: reviewing reports and enforcing blocks.",
            "To answer you when you contact support.",
          ]}
        />
        <p>
          We don&apos;t sell your data, share it with advertisers, or use it to build advertising profiles.
        </p>
      </LegalSection>

      <LegalSection heading="Who else sees it">
        <LegalList
          items={[
            <>
              <strong>Your friends</strong> see your name (or email if you haven&apos;t set a name) and the items you
              put on the table in a trade with them. Nobody else can see your binder.
            </>,
            <>
              <strong>Google and eBay</strong> receive the sign-in or connection request when you choose to use them,
              under their own privacy policies.
            </>,
            <>
              <strong>Price sources</strong> such as PriceCharting, TCGplayer and Cardmarket: we download market
              prices from them, but we never send them anything about you.
            </>,
            "Authorities, if we're legally required to, or to protect someone's safety.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Where it's stored and for how long">
        <p>
          Your data is stored on servers in {LEGAL.dataLocation} and sent over encrypted connections. We keep it for as
          long as you have an account. If you delete your account, your data is removed from our database right away.
          Trades you completed with other people stay in their history, labeled &ldquo;a deleted account&rdquo; instead
          of your name.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <LegalList
          items={[
            <>
              <strong>Delete your account</strong> anytime in{" "}
              <Link href="/settings" className="text-emerald-strong hover:underline">
                Settings → Account
              </Link>
              . This permanently removes your account and everything in it.
            </>,
            "Disconnect eBay anytime in Settings. We stop reading your orders right away.",
            "Block or report any account from your friends list.",
            <>
              Ask for a copy of your data, or ask us to correct it, by emailing{" "}
              <a href={`mailto:${email}`} className="text-emerald-strong hover:underline">
                {email}
              </a>
              .
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          {LEGAL.appName} is for people {LEGAL.minimumAge} and older. We don&apos;t knowingly collect information
          from children under {LEGAL.minimumAge}. If you think a child under {LEGAL.minimumAge} has made an account,
          email us and we&apos;ll delete it.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          If we change this policy, we&apos;ll update the date at the top. If the change is significant, we&apos;ll
          tell you in the app before it takes effect.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about your privacy? Email{" "}
          <a href={`mailto:${email}`} className="text-emerald-strong hover:underline">
            {email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
