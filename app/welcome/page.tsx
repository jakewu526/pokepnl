import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { CompleteProfileForm } from "@/components/CompleteProfileForm";

// The one-time name-completion gate. Reached only via lib/dal.ts's
// verifySession() redirecting here when an account has no name yet -- a
// Google sign-in whose claim omitted one, or a legacy account from before
// the field was required. This page deliberately calls getCurrentUser()
// instead of verifySession() for its own auth check: verifySession() would
// redirect back here forever since it's the thing enforcing the name in the
// first place. A signed-in user who already has a name (and so has no
// reason to be here) is bounced straight to /dashboard rather than shown the
// form again.
export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.name) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-6 flex items-baseline gap-3">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          What should we call you?
        </h1>
      </div>
      <p className="mb-6 font-body text-sm text-ink-muted">
        One last thing before your binder&rsquo;s ready.
      </p>
      <CompleteProfileForm />
    </div>
  );
}
