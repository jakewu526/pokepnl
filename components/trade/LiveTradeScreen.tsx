"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getTradeOfferState,
  setMyOfferedItems,
  confirmTradeOffer,
  cancelTradeOffer,
  getMyCollectionForTrade,
  type TradeOfferState,
  type TradeOfferItemView,
  type TradeableItem,
} from "@/app/actions/trades";
import { MultiItemPicker } from "@/components/trade/MultiItemPicker";

const POLL_MS = 2000;

// Polls getTradeOfferState on a short interval instead of pushing updates --
// this codebase has no websocket/Pusher layer, and short polling is enough
// to make the negotiation feel live without standing up a new service just
// for this. Paused while the tab is hidden.
export function LiveTradeScreen({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [state, setState] = useState<TradeOfferState | null>(null);
  const [picking, setPicking] = useState(false);
  const [portfolio, setPortfolio] = useState<TradeableItem[] | null>(null);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const result = await getTradeOfferState(offerId);
      if (!cancelled) setState(result);
    }
    poll();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [offerId]);

  useEffect(() => {
    if (state && !("error" in state) && state.status === "COMPLETED") {
      const timeout = setTimeout(() => router.push("/portfolio"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [state, router]);

  if (!state) {
    return <p className="p-6 text-center font-body text-sm text-ink-muted">Loading trade…</p>;
  }
  if ("error" in state) {
    return <p className="p-6 text-center font-body text-sm text-amber">{state.error}</p>;
  }

  const isProposer = state.viewerRole === "proposer";
  const myItems = isProposer ? state.proposerItems : state.recipientItems;
  const theirItems = isProposer ? state.recipientItems : state.proposerItems;
  const myConfirmed = isProposer ? state.proposerConfirmed : state.recipientConfirmed;
  const theirConfirmed = isProposer ? state.recipientConfirmed : state.proposerConfirmed;
  const myName = isProposer ? state.proposerName : state.recipientName;
  const theirName = isProposer ? state.recipientName : state.proposerName;

  async function openPicker() {
    setError(null);
    setPicking(true);
    if (portfolio === null) setPortfolio(await getMyCollectionForTrade());
    setSelected(new Map(myItems.map((i) => [i.collectionItemId, i.quantity])));
  }

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

  async function handleSaveItems() {
    setPending(true);
    setError(null);
    const items = Array.from(selected, ([collectionItemId, quantity]) => ({ collectionItemId, quantity }));
    const result = await setMyOfferedItems(offerId, items);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPicking(false);
    setState(await getTradeOfferState(offerId));
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await confirmTradeOffer(offerId);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setState(await getTradeOfferState(offerId));
  }

  async function handleCancel() {
    setPending(true);
    await cancelTradeOffer(offerId);
    router.push("/portfolio");
  }

  if (state.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-body text-lg font-medium text-ink">Trade cancelled</p>
        <button
          type="button"
          onClick={() => router.push("/portfolio")}
          className="mt-4 font-body text-sm font-medium text-emerald-strong hover:underline"
        >
          Back to portfolio
        </button>
      </div>
    );
  }

  if (state.status === "COMPLETED") {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-body text-lg font-medium text-ink">Trade complete!</p>
        <p className="font-body text-sm text-ink-muted">Taking you to your portfolio…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 p-4">
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink">Trading with {theirName}</h1>

      <div className="grid grid-cols-2 gap-4">
        <TradeSlot label={`You (${myName})`} items={myItems} confirmed={myConfirmed} pickable={!myConfirmed} onPickClick={openPicker} />
        <TradeSlot label={theirName} items={theirItems} confirmed={theirConfirmed} />
      </div>

      {picking && (
        <div className="flex flex-col gap-3">
          <p className="font-body text-xs font-medium text-ink-muted">Pick cards to offer</p>
          {portfolio === null ? (
            <p className="font-body text-sm text-ink-muted">Loading your collection…</p>
          ) : (
            <MultiItemPicker items={portfolio} selected={selected} onToggle={toggle} onQuantityChange={setQuantity} />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending || selected.size === 0}
              onClick={handleSaveItems}
              className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save selection"}
            </button>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="font-body text-xs font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="font-body text-sm text-amber">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || myItems.length === 0 || myConfirmed}
          onClick={handleConfirm}
          className="rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {myConfirmed ? `Waiting on ${theirName}…` : "Confirm trade"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleCancel}
          className="font-body text-xs font-medium text-ink-muted hover:text-amber disabled:opacity-60"
        >
          Cancel trade
        </button>
      </div>
    </div>
  );
}

function TradeSlot({
  label,
  items,
  confirmed,
  onPickClick,
  pickable,
}: {
  label: string;
  items: TradeOfferItemView[];
  confirmed: boolean;
  onPickClick?: () => void;
  pickable?: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised">
      <div className="border-b border-line px-3 py-2">
        <p className="truncate font-body text-xs font-medium text-ink-muted">{label}</p>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-col gap-2 p-3">
          {items.map((item) => (
            <div key={item.collectionItemId} className="flex items-center gap-2">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
                {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill sizes="40px" className="object-contain" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-body text-xs font-medium text-ink">{item.name}</p>
                <p className="font-data text-[11px] text-ink-muted">Qty {item.quantity}</p>
              </div>
            </div>
          ))}
          {confirmed && <p className="font-body text-xs font-medium text-emerald-strong">Confirmed</p>}
          {pickable && (
            <button type="button" onClick={onPickClick} className="self-start font-body text-xs font-medium text-emerald-strong hover:underline">
              Change
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          {pickable ? (
            <button type="button" onClick={onPickClick} className="font-body text-sm font-medium text-emerald-strong hover:underline">
              Pick cards
            </button>
          ) : (
            <p className="font-body text-sm text-ink-muted">Waiting…</p>
          )}
        </div>
      )}
    </div>
  );
}
