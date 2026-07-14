import Image from "next/image";
import Link from "next/link";
import type { SealedProductListItem } from "@/lib/sealed";
import { SEALED_TYPE_LABELS } from "@/lib/sealed";
import { WatchlistHeartButton } from "@/components/WatchlistHeartButton";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// `watched` is `undefined` for signed-out visitors (no heart rendered at
// all, since there's nowhere for it to save) vs. a real boolean once a user
// is logged in.
export function SealedProductTile({
  product,
  watched,
}: {
  product: SealedProductListItem;
  watched?: boolean;
}) {
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
      {watched != null && (
        <WatchlistHeartButton
          target={{ sealedProductId: product.id }}
          initialWatched={watched}
          className="absolute bottom-3 right-3"
        />
      )}
    </div>
  );
}
