"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getOrCreateFriendCode,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  type FriendsData,
} from "@/app/actions/friends";
import { formatFriendCode } from "@/lib/friend-code";
import type { TradeInviteSummary } from "@/app/actions/trades";

// Friends exist for exactly one reason: unlocking a live trade with another
// account -- no messaging, no activity feed. Mutations call router.refresh()
// instead of holding local copies of the lists, since every action already
// revalidates "/settings" server-side -- refresh just re-renders this
// section's parent with the fresh data as props.
export function FriendsSection({ data, pendingTrades }: { data: FriendsData; pendingTrades: TradeInviteSummary[] }) {
  const router = useRouter();
  const [code, setCode] = useState(data.code);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (code) return;
    getOrCreateFriendCode().then(setCode);
  }, [code]);

  function handleCopy() {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendFriendRequest(codeInput);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCodeInput("");
      router.refresh();
    });
  }

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-paper-raised p-5">
      <div>
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">Your code</h3>
        <p className="font-body text-sm text-ink-muted">Share this with a friend so they can add you.</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full border border-line bg-paper px-3 py-1.5 font-data text-sm text-ink">
            {code ? formatFriendCode(code) : "Generating…"}
          </span>
          {code && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-line px-3 py-1.5 font-body text-xs font-medium text-ink-muted hover:text-ink"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">Add a friend</h3>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            placeholder="Enter a friend code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            className="h-9 flex-1 rounded-full border border-line bg-paper px-3 font-data text-sm text-ink outline-none focus:border-emerald"
          />
          <button
            type="button"
            disabled={pending || !codeInput.trim()}
            onClick={handleSend}
            className="shrink-0 rounded-full bg-emerald px-3 py-1.5 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Send
          </button>
        </div>
        {error && <p className="mt-1 font-body text-xs text-amber">{error}</p>}
      </div>

      {data.incoming.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">Requests</h3>
          <div className="mt-2 flex flex-col gap-2">
            {data.incoming.map((r) => (
              <div key={r.friendshipId} className="flex items-center justify-between gap-3">
                <span className="font-body text-sm text-ink">{r.name ?? r.email}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => acceptFriendRequest(r.friendshipId))}
                    className="font-body text-xs font-medium text-emerald-strong hover:underline disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => declineFriendRequest(r.friendshipId))}
                    className="font-body text-xs font-medium text-ink-muted hover:text-amber disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.outgoing.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">Sent</h3>
          <div className="mt-2 flex flex-col gap-2">
            {data.outgoing.map((r) => (
              <div key={r.friendshipId} className="flex items-center justify-between gap-3">
                <span className="font-body text-sm text-ink-muted">{r.name ?? r.email}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => cancelFriendRequest(r.friendshipId))}
                  className="font-body text-xs font-medium text-ink-muted hover:text-amber disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingTrades.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">Pending trades</h3>
          <div className="mt-2 flex flex-col gap-2">
            {pendingTrades.map((t) => (
              <Link
                key={t.offerId}
                href={`/trades/live/${t.offerId}`}
                className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2 transition-colors hover:border-emerald"
              >
                <span className="font-body text-sm text-ink">
                  {t.role === "proposer" ? `Waiting on ${t.counterpartyName}` : `${t.counterpartyName} wants to trade`}
                </span>
                <span className="font-body text-xs font-medium text-emerald-strong">Open →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-4">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          Friends{" "}
          {data.friends.length > 0 && (
            <span className="font-data text-sm font-normal text-ink-muted">({data.friends.length})</span>
          )}
        </h3>
        {data.friends.length === 0 ? (
          <p className="mt-2 font-body text-sm text-ink-muted">No friends yet — trading needs someone to trade with.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {data.friends.map((f) => (
              <div key={f.friendshipId} className="flex items-center justify-between gap-3">
                <span className="font-body text-sm text-ink">{f.name ?? f.email}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => removeFriend(f.friendshipId))}
                  className="font-body text-xs font-medium text-ink-muted hover:text-amber disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
