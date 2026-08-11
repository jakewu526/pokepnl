import { NextRequest, NextResponse } from "next/server";
import { getSealedSuggestions } from "@/lib/sealed";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const suggestions = await getSealedSuggestions(query);
  return NextResponse.json({ suggestions });
}
