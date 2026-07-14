import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { AddToCollectionForm } from "@/components/AddToCollectionForm";

export async function AddToCollectionButton({
  cardId,
  marketPrice,
}: {
  cardId: string;
  marketPrice: number | null;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-block rounded-full border border-line px-4 py-2 font-body text-sm font-medium text-ink-muted hover:text-ink"
      >
        Log in to add to collection
      </Link>
    );
  }

  return <AddToCollectionForm cardId={cardId} marketPrice={marketPrice} />;
}
