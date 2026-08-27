import { NextRequest, NextResponse } from "next/server";
import { getLatestPrices } from "@/lib/cards";
import { getLatestSealedPrices } from "@/lib/sealed";

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get("cardId");
  const sealedProductId = request.nextUrl.searchParams.get("sealedProductId");

  if (cardId) {
    const prices = await getLatestPrices([cardId]);
    return NextResponse.json({ price: prices.get(cardId)?.price ?? null });
  }
  if (sealedProductId) {
    const prices = await getLatestSealedPrices([sealedProductId]);
    return NextResponse.json({ price: prices.get(sealedProductId)?.price ?? null });
  }
  return NextResponse.json({ price: null });
}
