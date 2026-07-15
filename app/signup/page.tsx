import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-6 flex items-baseline gap-3">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
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
      <p className="mt-6 font-body text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-emerald-strong hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
