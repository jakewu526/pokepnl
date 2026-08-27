import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AuthNav } from "@/components/AuthNav";
import { EbayConnectionCard } from "@/components/EbayConnectionCard";

export default async function SettingsPage() {
  const session = await verifySession();
  const ebayAccount = await prisma.ebayAccount.findUnique({ where: { userId: session.userId } });

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

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Preferences</h2>
          <p className="font-body text-sm text-ink-muted">More settings coming soon.</p>
        </section>
      </main>
    </div>
  );
}
