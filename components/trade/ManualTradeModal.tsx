"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { DialogShell } from "@/components/DialogShell";
import { MultiItemPicker } from "@/components/trade/MultiItemPicker";
import { MultiSelectBar } from "@/components/trade/MultiSelectBar";
import { ProductSearchPicker, isCardSuggestion, type ProductSuggestion } from "@/components/ProductSearchPicker";
import { getMyCollectionForTrade, logManualTrade, type TradeableItem } from "@/app/actions/trades";
import { CONDITIONS, CONDITION_LABELS, type Condition } from "@/lib/condition";

type Step = "pick-given" | "pick-received" | "review";

type ReceivedItem = {
  key: string;
  product: ProductSuggestion;
  condition: Condition;
  quantity: number;
};

// For a trade already completed with someone who doesn't use this app --
// there's no counterparty account, so this just logs the swap: the given
// cards leave the collection, the received cards enter it. No sale price or
// profit anywhere here -- a trade isn't a sale (see logManualTrade).
export function ManualTradeModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("pick-given");
  const [portfolio, setPortfolio] = useState<TradeableItem[] | null>(null);
  const [givenSelected, setGivenSelected] = useState<Map<string, number>>(new Map());
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [addingReceived, setAddingReceived] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getMyCollectionForTrade().then(setPortfolio);
  }, []);

  function toggleGiven(item: TradeableItem) {
    setGivenSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.collectionItemId)) next.delete(item.collectionItemId);
      else next.set(item.collectionItemId, item.quantity);
      return next;
    });
  }

  function setGivenQuantity(collectionItemId: string, quantity: number) {
    setGivenSelected((prev) => new Map(prev).set(collectionItemId, quantity));
  }

  function addReceived(item: ProductSuggestion) {
    setReceivedItems((prev) => [
      ...prev,
      { key: `${item.kind}-${item.id}-${prev.length}`, product: item, condition: "NM", quantity: 1 },
    ]);
    setAddingReceived(false);
  }

  function removeReceived(key: string) {
    setReceivedItems((prev) => prev.filter((r) => r.key !== key));
  }

  function updateReceived(key: string, patch: Partial<ReceivedItem>) {
    setReceivedItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleSubmit() {
    setError(null);
    const givenItems = Array.from(givenSelected, ([collectionItemId, quantity]) => ({ collectionItemId, quantity }));
    const receivedPayload = receivedItems.map((r) => ({
      cardId: isCardSuggestion(r.product) ? r.product.id : undefined,
      sealedProductId: !isCardSuggestion(r.product) ? r.product.id : undefined,
      condition: isCardSuggestion(r.product) ? r.condition : undefined,
      quantity: r.quantity,
    }));
    startTransition(async () => {
      const result = await logManualTrade({ givenItems, receivedItems: receivedPayload, counterpartyNote: note.trim() || undefined });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const title = step === "pick-given" ? "What did you give away?" : step === "pick-received" ? "What did you get?" : "Confirm trade";

  return (
    <DialogShell onClose={onClose} title={title} titleClassName="text-lg" maxWidthClassName="max-w-lg" scrollable>
      {step === "pick-given" &&
        (portfolio === null ? (
          <p className="font-body text-sm text-ink-muted">Loading your collection…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <MultiItemPicker items={portfolio} selected={givenSelected} onToggle={toggleGiven} onQuantityChange={setGivenQuantity} />
            <MultiSelectBar
              count={givenSelected.size}
              actionLabel="Continue"
              onAction={() => setStep("pick-received")}
              onClear={() => setGivenSelected(new Map())}
            />
          </div>
        ))}

      {step === "pick-received" && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setStep("pick-given")}
            className="self-start font-body text-xs font-medium text-ink-muted hover:text-ink"
          >
            ← Back
          </button>

          {receivedItems.length > 0 && (
            <div className="flex flex-col gap-2">
              {receivedItems.map((r) => (
                <div key={r.key} className="flex items-center gap-3 rounded-card border border-line bg-paper-raised p-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
                    {r.product.imageUrl && <Image src={r.product.imageUrl} alt="" fill sizes="40px" className="object-contain" />}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-body text-sm text-ink">{r.product.name}</span>
                  <button
                    type="button"
                    onClick={() => removeReceived(r.key)}
                    className="shrink-0 font-body text-xs font-medium text-ink-muted hover:text-amber"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingReceived ? (
            <ProductSearchPicker onSelect={addReceived} />
          ) : (
            <button
              type="button"
              onClick={() => setAddingReceived(true)}
              className="rounded-full border border-line px-4 py-2 font-body text-sm font-medium text-ink-muted hover:text-ink"
            >
              + Add another
            </button>
          )}

          <button
            type="button"
            disabled={receivedItems.length === 0}
            onClick={() => setStep("review")}
            className="mt-1 rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Continue to review
          </button>
        </div>
      )}

      {step === "review" && portfolio && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setStep("pick-received")}
            className="self-start font-body text-xs font-medium text-ink-muted hover:text-ink"
          >
            ← Back
          </button>

          <div className="rounded-card border border-line bg-paper-raised p-3">
            <p className="mb-2 font-body text-xs text-ink-muted">You gave</p>
            <div className="flex flex-col gap-2">
              {Array.from(givenSelected, ([id, quantity]) => {
                const item = portfolio.find((i) => i.collectionItemId === id);
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
                      {item?.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="40px" className="object-contain" />}
                    </div>
                    <p className="font-body text-sm text-ink">
                      {item?.name ?? "Unknown item"} {quantity > 1 && <span className="text-ink-muted">×{quantity}</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-card border border-line bg-paper-raised p-3">
            <p className="mb-2 font-body text-xs text-ink-muted">You got</p>
            {receivedItems.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2 py-1">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-line/40">
                  {r.product.imageUrl && <Image src={r.product.imageUrl} alt="" fill sizes="40px" className="object-contain" />}
                </div>
                <span className="font-body text-sm text-ink">{r.product.name}</span>
                {isCardSuggestion(r.product) && (
                  <select
                    value={r.condition}
                    onChange={(e) => updateReceived(r.key, { condition: e.target.value as Condition })}
                    className="h-7 rounded-full border border-line bg-paper px-2 font-body text-xs text-ink outline-none focus:border-emerald"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {CONDITION_LABELS[c]}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={r.quantity}
                  onChange={(e) => updateReceived(r.key, { quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
                  className="h-7 w-16 rounded-full border border-line bg-paper px-2 font-data text-xs text-ink outline-none focus:border-emerald"
                />
              </div>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink-muted">Traded with (optional)</span>
            <input
              type="text"
              placeholder="e.g. Sam at school"
              maxLength={100}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-9 rounded-full border border-line bg-paper-raised px-3 font-body text-sm text-ink outline-none focus:border-emerald"
            />
          </label>

          {error && <p className="font-body text-xs text-amber">{error}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="mt-1 rounded-full bg-emerald px-4 py-2 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Logging…" : "Log trade"}
          </button>
        </div>
      )}
    </DialogShell>
  );
}
