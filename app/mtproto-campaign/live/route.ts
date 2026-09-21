import { NextResponse } from "next/server";
import { listEvents } from "@/lib/mtproto/events";

export const dynamic = "force-dynamic";

// Poll endpoint behind the MTProto Campaign live feed
// (components/mtproto/LiveFeed.tsx). Lives under app/mtproto-campaign/ (not
// app/api/admin/v1/ or app/api/v1/, so middleware.ts's
// SELF_AUTHENTICATED_PREFIXES doesn't apply) — it inherits the ordinary
// session-cookie gate the same way every other page under /mtproto-campaign
// does (same posture as the existing /api/users/live SSE route, see its own
// header comment). It is a poll, not SSE, per the build instruction ("SSE
// only if it needs no changes to existing files" — polling needs none at
// all, so that's the simpler, zero-risk choice here).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const runId = params.get("runId") ?? undefined;
  const cloneId = params.get("cloneId") ?? undefined;
  const afterIdRaw = params.get("afterId");
  const afterId = afterIdRaw ? Number(afterIdRaw) : undefined;
  if (!runId && !cloneId) {
    return NextResponse.json({ error: "runId or cloneId is required" }, { status: 400 });
  }
  const events = await listEvents({ runId, cloneId, afterId, limit: 200 });
  return NextResponse.json({ events });
}
