import { NextRequest, NextResponse } from "next/server";
import { planCGate, planCJson } from "@/lib/onlyfans/plan-c-guard";
import { planCConversationCommand } from "@/lib/onlyfans/plan-c-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** stop, take over or hand back one conversation. Handing back is always an explicit operator request. */
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; conversationId: string; action: string }> }) {
  const params = await context.params;
  const gate = await planCGate(request, { accountId: params.accountId, action: params.action }, true);
  if (gate instanceof NextResponse) return gate;
  return planCJson(await planCConversationCommand(gate.backend, { actor: gate.actor, accountId: gate.accountId, conversationId: params.conversationId,
    action: params.action, body: gate.body }));
}
