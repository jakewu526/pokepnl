"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DialogShell } from "@/components/DialogShell";
import { MultiItemPicker } from "@/components/trade/MultiItemPicker";
import { MultiSelectBar } from "@/components/trade/MultiSelectBar";
import { getAcceptedFriends, type FriendSummary } from "@/app/actions/friends";
import { getMyCollectionForTrade, proposeTradeOffer, type TradeableItem } from "@/app/actions/trades";

type Step = "pick-friend" | "pick-items";

// Friend picker + multi-item card picker for a live in-app trade -- requires
// an accepted Friendship (enforced server-side in proposeTradeOffer). On
// submit this hands off to the live trade screen, which polls for the
// friend's response since this codebase has no push/websocket layer.
export function ProposeTradeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick-friend");
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [friend, setFriend] = useState<FriendSummary | null>(null);
  const [portfolio, setPortfolio] = useState<TradeableItem[] | null>(null);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getAcceptedFriends().then(setFriends);
    getMyCollectionForTrade().then(setPortfolio);
  }, []);

  function toggle(item: TradeableItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.collectionItemId)) next.delete(item.collectionItemId);
      else next.set(item.collectionItemId, item.quantity);
      return next;
    });
  }

  function setQuantity(collectionItemId: string, quantity: number) {
    setSelected((prev) => new Map(prev).set(collectionItemId, quantity));
  }

  function handlePropose() {
    if (!friend || selected.size === 0) return;
    setError(null);
    const items = Array.from(selected, ([collectionItemId, quantity]) => ({ collectionItemId, quantity }));
    startTransition(async () => {
      const result = await proposeTradeOffer(friend.userId, items);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onClose();
      router.push(`/trades/live/${result.offerId}`);
    });
  }

  return (
    <DialogShell
      onClose={onClose}
      title={step === "pick-friend" ? "Trade with a friend" : "Pick cards to offer"}
      titleClassName="text-lg"
      maxWidthClassName="max-w-lg"
      scrollable
    >
      {step === "pick-friend" &&
        (friends == null ? (
          <p className="font-body text-sm text-ink-muted">Loading friends…</p>
        ) : friends.length === 0 ? (
          <p className="font-body text-sm text-ink-muted">
            Add a friend in Settings first — trading needs someone to trade with.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {friends.map((f) => (
              <button
                key={f.friendshipId}
                type="button"
                onClick={() => {
                  setFriend(f);
                  setStep("pick-items");
                }}
                className="flex items-center justify-between rounded-card border border-line bg-paper-raised px-4 py-3 text-left transition-colors hover:border-emerald"
              >
                <span className="font-body text-sm font-medium text-ink">{f.name ?? f.email}</span>
                <span className="font-body text-xs text-ink-muted">Select →</span>
              </button>
            ))}
          </div>
        ))}

      {step === "pick-items" && friend && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setStep("pick-friend")}
            className="self-start font-body text-xs font-medium text-ink-muted hover:text-ink"
          >
            ← Back
          </button>
          <p className="font-body text-sm text-ink-muted">
            Offering to <span className="font-medium text-ink">{friend.name ?? friend.email}</span>
          </p>
          {portfolio === null ? (
            <p className="font-body text-sm text-ink-muted">Loading your collection…</p>
          ) : (
            <MultiItemPicker items={portfolio} selected={selected} onToggle={toggle} onQuantityChange={setQuantity} />
          )}
          {error && <p className="font-body text-xs text-amber">{error}</p>}
          <MultiSelectBar
            count={selected.size}
            actionLabel={pending ? "Sending…" : "Propose trade"}
            onAction={handlePropose}
            onClear={() => setSelected(new Map())}
            disabled={pending}
          />
        </div>
      )}
    </DialogShell>
  );
}
