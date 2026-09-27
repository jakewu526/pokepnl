import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ResetPasswordForm } from "@/components/PasswordResetForms";
import { isResetTokenValid } from "@/app/actions/password-reset";

// Landing page for the emailed link. Checks the token up front so an
// expired or already-used link says so immediately instead of after the
// user has typed a new password twice.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const valid = await isResetTokenValid(token);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Choose a new password</h1>
      </div>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-body text-sm text-ink">This reset link has expired or was already used.</p>
          <Link href="/forgot-password" className="font-body text-sm font-medium text-emerald-strong hover:underline">
            Send me a new link →
          </Link>
        </div>
      )}
    </div>
  );
}
