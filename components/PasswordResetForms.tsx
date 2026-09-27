"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, resetPassword } from "@/app/actions/password-reset";

const INPUT =
  "rounded-card border border-line bg-paper-raised px-3 py-2 font-body text-sm text-ink outline-none focus:border-emerald";
const SUBMIT =
  "mt-2 rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  if (state?.sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-body text-sm text-ink">
          If there&apos;s an account with that email, we&apos;ve sent a link to reset the password. It expires in 1
          hour.
        </p>
        <p className="font-body text-sm text-ink-muted">Don&apos;t see it? Check your spam folder.</p>
        <Link href="/login" className="font-body text-sm font-medium text-emerald-strong hover:underline">
          ← Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="font-body text-sm font-medium text-ink">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={INPUT} />
        {state?.errors?.email && <p className="font-body text-xs text-amber">{state.errors.email[0]}</p>}
      </div>
      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="font-body text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={INPUT}
        />
        {state?.errors?.password && <p className="font-body text-xs text-amber">{state.errors.password[0]}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirm" className="font-body text-sm font-medium text-ink">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={INPUT} />
        {state?.errors?.confirm && <p className="font-body text-xs text-amber">{state.errors.confirm[0]}</p>}
      </div>

      {state?.message && (
        <p className="font-body text-sm text-amber">
          {state.message}{" "}
          <Link href="/forgot-password" className="font-medium text-emerald-strong hover:underline">
            Get a new link
          </Link>
        </p>
      )}

      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
