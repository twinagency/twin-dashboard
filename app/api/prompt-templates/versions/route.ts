import { NextRequest, NextResponse } from "next/server";
import { isAgentType, listVersions } from "@/lib/prompt-templates-data";

export const dynamic = "force-dynamic";

// GET ?agentType=text — full version history for one agent type, newest
// first. Powers the editor's version-history panel, one-click restore, and
// the diff view (each row already carries its full template body, so a
// restore-preview diff needs no extra round trip).
export async function GET(req: NextRequest) {
  const agentType = req.nextUrl.searchParams.get("agentType") ?? "";
  if (!isAgentType(agentType)) {
    return NextResponse.json({ error: `unknown agentType "${agentType}"` }, { status: 400 });
  }
  try {
    const versions = await listVersions(agentType);
    return NextResponse.json({ versions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
