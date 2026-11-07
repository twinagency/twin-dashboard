import { NextRequest, NextResponse } from "next/server";
import { planCGate, planCJson } from "@/lib/onlyfans/plan-c-guard";
import { planCDraftCommand } from "@/lib/onlyfans/plan-c-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** approve, reject or edit exactly one draft version. One draft per request: there is no batch form of this route. */
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; requestId: string; generation: string; action: string }> }) {
  const params = await context.params;
  const gate = await planCGate(request, params.accountId, true);
  if (gate instanceof NextResponse) return gate;
  return planCJson(await planCDraftCommand(gate.backend, { actor: gate.actor, accountId: gate.accountId, requestId: params.requestId,
    generation: params.generation, action: params.action, body: gate.body }));
}
