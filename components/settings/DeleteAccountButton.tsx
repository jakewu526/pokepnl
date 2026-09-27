"use client";

import { useActionState, useState } from "react";
import { DialogShell } from "@/components/DialogShell";
import { deleteAccount } from "@/app/actions/auth";

// Lives at the bottom of Settings → Account. The dialog spells out exactly
// what goes, because there is no undo -- the rows are gone, not flagged.
export function DeleteAccountButton({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [state, action, pending] = useActionState(deleteAccount, undefined);

  function close() {
    setOpen(false);
    setConfirm("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-card px-4 py-3 font-body text-sm font-medium text-amber transition-colors hover:bg-paper sm:w-auto"
      >
        Delete account
      </button>

      {open && (
        <DialogShell title="Delete your account?" onClose={close}>
          <p className="font-body text-sm text-ink-muted">
            This permanently deletes your binder, purchase and sale history, watchlist, trades, friends and eBay
            connection. It can&apos;t be undone.
          </p>

          <form action={action} className="mt-4 flex flex-col gap-3">
            {hasPassword && (
              <label className="flex flex-col gap-1 font-body text-sm text-ink">
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  className="h-11 rounded-card border border-line bg-paper px-3 font-body text-sm text-ink outline-none focus:border-emerald"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 font-body text-sm text-ink">
              <span>
                Type <span className="font-data font-semibold">DELETE</span> to confirm
              </span>
              <input
                type="text"
                name="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-11 rounded-card border border-line bg-paper px-3 font-data text-sm text-ink outline-none focus:border-emerald"
              />
            </label>

            {state?.message && <p className="font-body text-xs text-amber">{state.message}</p>}

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-full border border-line px-4 py-2.5 font-body text-sm font-medium text-ink transition-colors hover:bg-paper-raised"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || confirm.trim() !== "DELETE"}
                className="flex-1 rounded-full bg-amber px-4 py-2.5 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </form>
        </DialogShell>
      )}
    </>
  );
}
