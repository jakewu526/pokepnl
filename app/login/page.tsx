import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { BrandMark } from "@/components/BrandMark";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Please try again.",
  email_not_verified: "Your Google account's email isn't verified.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const oauthError = params.error ? OAUTH_ERROR_MESSAGES[params.error] : undefined;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <Link
        href="/"
        className="mb-6 self-start font-body text-sm font-medium text-emerald-strong hover:underline"
      >
        ← PokePnL
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <BrandMark />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Log in
        </h1>
      </div>
      {params.deleted && (
        <p className="mb-4 font-body text-sm text-ink-muted">Your account and all its data have been deleted.</p>
      )}
      {params.reset && (
        <p className="mb-4 font-body text-sm text-emerald-strong">Password updated. Log in with your new password.</p>
      )}
      {oauthError && <p className="mb-4 font-body text-sm text-amber">{oauthError}</p>}
      <LoginForm />
      <Link
        href="/forgot-password"
        className="mt-3 inline-flex min-h-10 items-center self-start font-body text-sm text-emerald-strong hover:underline"
      >
        Forgot password?
      </Link>
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
