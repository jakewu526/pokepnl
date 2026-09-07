import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { logout } from "@/app/actions/auth";
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
      {/* Six links + name + Log out is ~600px wide with no wrap -- wider
          than any phone viewport, and the reason the mobile layout used to
          overflow horizontally (see the overflow-x: clip guard in
          globals.css). Hidden below md; UserMenuButton stands in for all of
          it there. */}
      <div className="hidden items-center gap-3 font-body text-sm md:flex">
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
        <span className="hidden text-ink-muted sm:inline">{user.name ?? user.email}</span>
        <form action={logout}>
          <button type="submit" className="font-medium text-ink-muted hover:text-ink">
            Log out
          </button>
        </form>
      </div>
      <div className="md:hidden">
        <UserMenuButton />
      </div>
    </>
  );
}
