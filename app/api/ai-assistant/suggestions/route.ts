import { NextResponse } from "next/server";
import { computeSuggestions } from "../suggestions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const suggestions = await computeSuggestions();
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("[ai-assistant/suggestions]", e);
    return NextResponse.json({ error: "suggestions unavailable" }, { status: 500 });
  }
}
