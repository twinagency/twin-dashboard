import type { NextRequest } from "next/server";
import { bGate, bPending } from "@/lib/onlyfans/launch/b-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Contract pending (Chat 2): GET fans memory coverage. Authenticated, never fabricates data. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const gate = await bGate(request, (await context.params).accountId, false);
  return "ctx" in gate ? bPending("GET /onlyfans/memory/v1/accounts/{accountId}/fans") : gate;
}
