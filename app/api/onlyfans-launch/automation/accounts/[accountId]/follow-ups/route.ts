import type { NextRequest } from "next/server";
import { bGate, bPending } from "@/lib/onlyfans/launch/b-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Contract pending (Chat 4): scheduled follow-ups list and cancellation. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const gate = await bGate(request, (await context.params).accountId, false);
  return "ctx" in gate ? bPending("GET /onlyfans/engagement/v1/accounts/{accountId}/follow-ups") : gate;
}
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const gate = await bGate(request, (await context.params).accountId, true);
  return "ctx" in gate ? bPending("POST /onlyfans/engagement/v1/accounts/{accountId}/follow-ups/{followUpId}/cancel") : gate;
}
