import { verifySession } from "@/lib/dal";
import { LiveTradeScreen } from "@/components/trade/LiveTradeScreen";

export default async function LiveTradePage({ params }: { params: Promise<{ offerId: string }> }) {
  await verifySession();
  const { offerId } = await params;

  return (
    <div className="flex min-h-full flex-col">
      <LiveTradeScreen offerId={offerId} />
    </div>
  );
}
