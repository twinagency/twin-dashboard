import { NextResponse } from "next/server";
import { computeSuggestions } from "../suggestions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const suggestions = await computeSuggestions();
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
