import Link from "next/link";
import Image from "next/image";
import { SellOrDeleteButton } from "@/components/SellOrDeleteButton";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// Shared tile for both cards and sealed product holdings -- the two blocks in
// the old collection page were identical apart from the image fallback label
// and the subtitle string, so the caller builds those and this just renders.
export function PortfolioItemTile({
  href,
  imageUrl,
  imageAlt,
  fallbackLabel,
  name,
  subtitle,
  quantity,
  cost,
  unrealized,
  unrealizedPct,
  collectionItemId,
  marketPrice,
}: {
  href: string;
  imageUrl: string | null;
  imageAlt: string;
  fallbackLabel: string;
  name: string;
  subtitle: string;
  quantity: number;
  cost: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  collectionItemId: string;
  marketPrice: number | null;
}) {
  const marketValue = marketPrice != null ? marketPrice * quantity : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised">
      <Link href={href} className="relative aspect-[5/7] bg-line/40">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw"
            className="object-contain p-2"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            {fallbackLabel}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 border-t border-line px-3 py-3">
        <h2 className="font-body text-[15px] font-semibold leading-snug text-ink">{name}</h2>
        <p className="font-body text-[13px] text-ink-muted">{subtitle}</p>
        <p className="font-data text-[13px] text-ink-muted">Qty {quantity}</p>
        <p className="font-data text-[13px] text-ink-muted">
          Cost {cost != null ? priceFormatter.format(cost) : "—"}
        </p>
        <p className="font-data text-[13px] text-ink-muted">
          Value {marketValue != null ? priceFormatter.format(marketValue) : "—"}
          {marketPrice != null && (
            <span className="text-ink-muted/70"> ({priceFormatter.format(marketPrice)}/ea)</span>
          )}
        </p>
        {unrealized != null && (
          <p
            className={`font-data text-[13px] font-medium ${
              unrealized < 0 ? "text-amber" : "text-emerald-strong"
            }`}
          >
            {signedPrice(unrealized)}
            {unrealizedPct != null && (
              <span className="ml-1 font-body font-normal text-ink-muted">({signedPercent(unrealizedPct)})</span>
            )}
          </p>
        )}
        <div className="mt-auto pt-2">
          <SellOrDeleteButton
            collectionItemId={collectionItemId}
            itemName={name}
            imageUrl={imageUrl}
            quantity={quantity}
            marketPrice={marketPrice}
          />
        </div>
      </div>
    </div>
  );
}
