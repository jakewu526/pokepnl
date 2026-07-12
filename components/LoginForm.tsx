"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="font-body text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded-card border border-line bg-paper-raised px-3 py-2 font-body text-sm text-ink outline-none focus:border-emerald"
        />
        {state?.errors?.email && (
          <p className="font-body text-xs text-amber">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="font-body text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="rounded-card border border-line bg-paper-raised px-3 py-2 font-body text-sm text-ink outline-none focus:border-emerald"
        />
        {state?.errors?.password && (
          <p className="font-body text-xs text-amber">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.message && <p className="font-body text-sm text-amber">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
