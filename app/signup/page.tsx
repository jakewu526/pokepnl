import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { BrandMark } from "@/components/BrandMark";
import { LEGAL } from "@/lib/legal";

export default function SignupPage() {
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
          Sign up
        </h1>
      </div>
      <SignupForm />
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="font-body text-xs text-ink-muted">or</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <GoogleSignInButton />
      {/* Covers both paths above -- Google sign-in creates an account too. */}
      <p className="mt-4 font-body text-xs leading-relaxed text-ink-muted">
        By signing up you confirm you&apos;re {LEGAL.minimumAge} or older and agree to our{" "}
        <Link href="/terms" className="text-emerald-strong hover:underline">
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-emerald-strong hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="mt-6 font-body text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-emerald-strong hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
