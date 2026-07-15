import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Please try again.",
  email_not_verified: "Your Google account's email isn't verified.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const oauthError = params.error ? OAUTH_ERROR_MESSAGES[params.error] : undefined;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-6 flex items-baseline gap-3">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Log in
        </h1>
      </div>
      {oauthError && <p className="mb-4 font-body text-sm text-amber">{oauthError}</p>}
      <LoginForm />
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="font-body text-xs text-ink-muted">or</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <GoogleSignInButton />
      <p className="mt-6 font-body text-sm text-ink-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-emerald-strong hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
