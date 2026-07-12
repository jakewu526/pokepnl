import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSealedProductDetail, SEALED_TYPE_LABELS } from "@/lib/sealed";
import { PriceChart } from "@/components/PriceChart";
import { AuthNav } from "@/components/AuthNav";
import { AddSealedToCollectionButton } from "@/components/AddSealedToCollectionButton";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function SealedProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getSealedProductDetail(id);
  if (!product) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link
            href="/sealed"
            className="font-body text-sm font-medium text-emerald-strong hover:underline"
          >
            ← Binder
          </Link>
          <Suspense fallback={null}>
            <AuthNav />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <div className="relative aspect-[5/7] w-full max-w-[280px] overflow-hidden rounded-card border border-line bg-paper-raised">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="280px"
                className="object-contain p-3"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                {SEALED_TYPE_LABELS[product.type]}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
                {product.name}
              </h1>
              <p className="mt-1 font-body text-sm text-ink-muted">
                {product.setName}
                {product.setSeries ? ` · ${product.setSeries}` : ""}
              </p>
              <p className="mt-1 font-body text-xs text-ink-muted">
                {SEALED_TYPE_LABELS[product.type]}
              </p>

              <div className="mt-4">
                {product.price != null ? (
                  <>
                    <p className="font-data text-3xl font-medium text-emerald-strong">
                      {priceFormatter.format(product.price)}
                    </p>
                    {product.priceSource && (
                      <p className="mt-1 font-body text-xs text-ink-muted">
                        {product.priceSource === "PRICECHARTING" ? "PriceCharting" : "eBay listings"}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="font-data text-lg text-ink-muted">No price yet</p>
                )}
              </div>

              <div className="mt-4">
                <Suspense fallback={null}>
                  <AddSealedToCollectionButton sealedProductId={product.id} marketPrice={product.price} />
                </Suspense>
              </div>
            </div>

            <div>
              <h2 className="mb-2 font-body text-sm font-semibold text-ink">Price history</h2>
              <PriceChart points={product.history} source={product.priceSource ?? null} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-line px-4 py-4 text-center font-data text-xs text-ink-muted sm:px-6">
        Prices from PriceCharting and eBay, captured daily
      </footer>
    </div>
  );
}
