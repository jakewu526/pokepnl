import Link from "next/link";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { EbayConnectionCard } from "@/components/EbayConnectionCard";
import { FriendsSection } from "@/components/settings/FriendsSection";
import { logout } from "@/app/actions/auth";
import { getFriendsData } from "@/app/actions/friends";
import { getPendingTradeOffers } from "@/app/actions/trades";

export default async function SettingsPage() {
  const session = await verifySession();
  const [ebayAccount, user, friendsData, pendingTrades] = await Promise.all([
    prisma.ebayAccount.findUnique({ where: { userId: session.userId } }),
    // verifySession() already guarantees this account has a name/email --
    // getCurrentUser() is cached, so this doesn't add a second query.
    getCurrentUser(),
    getFriendsData(session.userId),
    getPendingTradeOffers(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link href="/dashboard" className="font-body text-sm font-medium text-emerald-strong hover:underline">
            ← Dashboard
          </Link>
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
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Preferences</h2>
          <p className="font-body text-sm text-ink-muted">More settings coming soon.</p>
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
            <form action={logout} className="mt-4">
              <button
                type="submit"
                className="w-full rounded-card border border-line px-4 py-3 font-body text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:w-auto"
              >
                Log out
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
