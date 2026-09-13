import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { UserMenuButton } from "@/components/UserMenuButton";

// Signed-out state fits at 375px as-is -- UserMenuButton renders the same
// two links for that case, so there's nothing mobile-specific to swap here.
export async function AuthNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center gap-3 font-body text-sm">
        <Link href="/login" className="font-medium text-ink-muted hover:text-ink">
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-emerald px-3 py-1.5 font-medium text-paper-raised hover:opacity-90"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Five links + name is wider than any phone viewport, and the reason
          the mobile layout used to overflow horizontally (see the overflow-x:
          clip guard in globals.css). Hidden below md; UserMenuButton stands
          in for all of it there. Log out is deliberately not here -- Settings
          is the single logout path at every width. font-display (Fraunces) to
          match the wordmark, one step down from it in size. */}
      <div className="hidden items-center gap-3 font-display text-sm md:flex lg:text-base">
        <Link href="/dashboard" className="font-medium text-emerald-strong hover:underline">
          Dashboard
        </Link>
        <Link href="/portfolio" className="font-medium text-emerald-strong hover:underline">
          My Portfolio
        </Link>
        <Link href="/transactions" className="font-medium text-emerald-strong hover:underline">
          My Transactions
        </Link>
        <Link href="/watchlist" className="font-medium text-emerald-strong hover:underline">
          Watchlist
        </Link>
        <Link href="/settings" className="font-medium text-emerald-strong hover:underline">
          Settings
        </Link>
        <span className="hidden text-sm text-ink-muted lg:inline">{user.name ?? user.email}</span>
      </div>
      <div className="md:hidden">
        <UserMenuButton />
      </div>
    </>
  );
}
