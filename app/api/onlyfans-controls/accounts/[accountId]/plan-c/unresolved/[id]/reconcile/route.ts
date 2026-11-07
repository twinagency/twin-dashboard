import { NextRequest, NextResponse } from "next/server";
import { planCGate, planCJson } from "@/lib/onlyfans/plan-c-guard";
import { planCReconcile } from "@/lib/onlyfans/plan-c-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reconcile one unresolved item. Needs an evidence reference; refused without one. */
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; id: string }> }) {
  const params = await context.params;
  const gate = await planCGate(request, params.accountId, true);
  if (gate instanceof NextResponse) return gate;
  return planCJson(await planCReconcile(gate.backend, { actor: gate.actor, accountId: gate.accountId, id: params.id, body: gate.body }));
}
