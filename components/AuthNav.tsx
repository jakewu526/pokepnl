import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { logout } from "@/app/actions/auth";

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
    <div className="flex items-center gap-3 font-body text-sm">
      <Link href="/collection" className="font-medium text-emerald-strong hover:underline">
        My Collection
      </Link>
      <Link href="/watchlist" className="font-medium text-emerald-strong hover:underline">
        Watchlist
      </Link>
      <span className="hidden text-ink-muted sm:inline">{user.name ?? user.email}</span>
      <form action={logout}>
        <button type="submit" className="font-medium text-ink-muted hover:text-ink">
          Log out
        </button>
      </form>
    </div>
  );
}
