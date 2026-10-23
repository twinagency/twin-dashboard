import type { NextRequest } from "next/server";
import { bGate, bPending, bRefuse } from "@/lib/onlyfans/launch/b-route";
import { bId } from "@/lib/onlyfans/launch/b-common";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Contract pending (Chat 2): fan memory read and supported-field correction. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string; fanId: string }> }) {
  const p = await context.params;
  const gate = await bGate(request, p.accountId, false);
  if (!("ctx" in gate)) return gate;
  return bId(p.fanId) ? bPending("GET /onlyfans/memory/v1/accounts/{accountId}/fans/{fanId}") : bRefuse(400, "That fan reference is invalid.", "invalid_request");
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ accountId: string; fanId: string }> }) {
  const p = await context.params;
  const gate = await bGate(request, p.accountId, true);
  if (!("ctx" in gate)) return gate;
  return bId(p.fanId) ? bPending("PATCH /onlyfans/memory/v1/accounts/{accountId}/fans/{fanId}") : bRefuse(400, "That fan reference is invalid.", "invalid_request");
}
