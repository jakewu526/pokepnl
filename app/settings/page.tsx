import { verifySession, getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { EbayConnectionCard } from "@/components/EbayConnectionCard";
import { FriendsSection } from "@/components/settings/FriendsSection";
import { logout } from "@/app/actions/auth";
import { getFriendsData } from "@/app/actions/friends";
import { getPendingTradeOffers } from "@/app/actions/trades";
import Link from "next/link";
import { BrandLink } from "@/components/BrandLink";
import { DeleteAccountButton } from "@/components/settings/DeleteAccountButton";

export default async function SettingsPage() {
  const session = await verifySession();
  const [ebayAccount, user, friendsData, pendingTrades, auth] = await Promise.all([
    prisma.ebayAccount.findUnique({ where: { userId: session.userId } }),
    // verifySession() already guarantees this account has a name/email --
    // getCurrentUser() is cached, so this doesn't add a second query.
    getCurrentUser(),
    getFriendsData(session.userId),
    getPendingTradeOffers(),
    prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } }),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <BrandLink />
          <AuthNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ink">Settings</h1>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Integrations</h2>
          <EbayConnectionCard
            ebayUserId={ebayAccount?.ebayUserId ?? null}
            lastSyncedAt={ebayAccount?.lastSyncedAt?.toISOString() ?? null}
          />
        </section>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Friends</h2>
          <FriendsSection data={friendsData} pendingTrades={pendingTrades} />
        </section>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Help &amp; legal</h2>
          <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-paper-raised">
            {[
              { href: "/support", label: "Support & FAQ" },
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/terms", label: "Terms of Use" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex min-h-12 items-center justify-between px-4 font-body text-sm text-ink transition-colors hover:text-emerald-strong"
              >
                {l.label}
                <span aria-hidden="true" className="text-ink-muted">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Shown at every width -- this is the only logout path on mobile,
            now that AuthNav's full link row (which had its own Log out
            button) is hidden below md in favor of UserMenuButton. Harmless
            to also show it here on desktop. */}
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Account</h2>
          <div className="rounded-card border border-line bg-paper-raised p-4">
            <p className="font-body text-sm text-ink">{user?.name}</p>
            <p className="font-body text-xs text-ink-muted">{user?.email}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-card border border-line px-4 py-3 font-body text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:w-auto"
                >
                  Log out
                </button>
              </form>
              <DeleteAccountButton hasPassword={!!auth?.passwordHash} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
