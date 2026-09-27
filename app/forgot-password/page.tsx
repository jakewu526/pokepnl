import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ForgotPasswordForm } from "@/components/PasswordResetForms";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <Link
        href="/login"
        className="mb-6 self-start font-body text-sm font-medium text-emerald-strong hover:underline"
      >
        ← Log in
      </Link>
      <div className="mb-2 flex items-center gap-3">
        <BrandMark />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Reset password</h1>
      </div>
      <p className="mb-6 font-body text-sm text-ink-muted">
        Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
