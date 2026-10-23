import type { NextRequest } from "next/server";
import { bGate, bPending } from "@/lib/onlyfans/launch/b-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Contract pending: account-level emergency stop. Never reports success. */
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const gate = await bGate(request, (await context.params).accountId, true);
  return "ctx" in gate ? bPending("POST /onlyfans/control/v1/accounts/{accountId}/emergency-stop") : gate;
}
