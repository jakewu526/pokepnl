import Image from "next/image";
import Link from "next/link";
import type { SealedProductListItem } from "@/lib/sealed";
import { SEALED_TYPE_LABELS } from "@/lib/sealed";
import { WatchlistHeartButton } from "@/components/WatchlistHeartButton";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// `watched` is `undefined` for signed-out visitors -- the heart still
// renders (so the feature is discoverable), it just redirects to signup
// instead of saving anything, since there's nowhere yet for it to save it.
export function SealedProductTile({
  product,
  watched,
}: {
  product: SealedProductListItem;
  watched?: boolean;
}) {
  const isAuthed = watched != null;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised transition-shadow hover:shadow-[0_2px_0_var(--line)]">
      <Link href={`/sealed/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-[5/7] bg-line/40">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw"
              className="object-contain p-2"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">
              {SEALED_TYPE_LABELS[product.type]}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* The type is what separates a $315 display case from the $31
                single tin sharing its name -- worth showing on the tile, not
                just on the detail page. */}
            <span className="rounded-full bg-line/60 px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-ink-muted">
              {SEALED_TYPE_LABELS[product.type]}
            </span>
            {product.language === "JA" && (
              <span className="rounded-full bg-amber/20 px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-ink-muted">
                JP
              </span>
            )}
          </div>
          <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">
            {product.name}
          </h2>
          {product.setName && (
            <p className="font-body text-[13px] text-ink-muted">{product.setName}</p>
          )}
          <div className="mt-auto pt-2">
            {product.price != null ? (
              <p className="font-data text-lg font-medium text-emerald-strong">
                {priceFormatter.format(product.price)}
              </p>
            ) : (
              <p className="font-data text-sm text-ink-muted">No price yet</p>
            )}
          </div>
        </div>
      </Link>
      <WatchlistHeartButton
        target={{ sealedProductId: product.id }}
        initialWatched={watched ?? false}
        isAuthed={isAuthed}
        className="absolute top-2 right-2"
      />
    </div>
  );
}
