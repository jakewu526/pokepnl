import { NextRequest, NextResponse } from "next/server";
import { getCardSuggestions } from "@/lib/cards";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const suggestions = await getCardSuggestions(query);
  return NextResponse.json({ suggestions });
}
