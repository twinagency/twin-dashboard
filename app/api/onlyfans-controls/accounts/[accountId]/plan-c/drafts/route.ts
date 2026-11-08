import { NextRequest, NextResponse } from "next/server";
import { planCGate, planCJson } from "@/lib/onlyfans/plan-c-guard";
import { planCReadDrafts } from "@/lib/onlyfans/plan-c-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Drafts awaiting a decision, with the exact ordered parts. Read only. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const gate = await planCGate(request, (await context.params).accountId, false);
  return gate instanceof NextResponse ? gate : planCJson(await planCReadDrafts(gate.backend, gate.accountId, gate.actor));
}
