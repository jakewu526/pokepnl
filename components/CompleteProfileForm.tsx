"use client";

import { useActionState } from "react";
import { completeProfile } from "@/app/actions/auth";

export function CompleteProfileForm() {
  const [state, action, pending] = useActionState(completeProfile, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="font-body text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          autoFocus
          className="rounded-card border border-line bg-paper-raised px-3 py-2 font-body text-sm text-ink outline-none focus:border-emerald"
        />
        {state?.errors?.name && (
          <p className="font-body text-xs text-amber">{state.errors.name[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
