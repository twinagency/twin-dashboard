import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/prompt-templates-data";

export const dynamic = "force-dynamic";

// GET: the six live prompt_templates rows, for the editor's initial load and
// for refreshing the tab list after a save elsewhere.
export async function GET() {
  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
