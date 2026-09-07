import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";

// Mobile replacement for AuthNav's full link row -- see AuthNav.tsx, which
// renders this inside a `md:hidden` wrapper instead of the six text links.
// Signed-in state is a single tappable circle (a placeholder pfp for now,
// swappable for a real uploaded avatar later without touching callers)
// that goes straight to Settings, which is also where Log out now lives.
export async function UserMenuButton() {
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
    <Link
      href="/settings"
      aria-label="Account settings"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald text-paper-raised"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path strokeLinecap="round" d="M4.5 20c1.4-3.8 4.6-6 7.5-6s6.1 2.2 7.5 6" />
      </svg>
    </Link>
  );
}
