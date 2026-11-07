import { NextRequest, NextResponse } from "next/server";
import { planCGate, planCJson } from "@/lib/onlyfans/plan-c-guard";
import { planCReadUnresolved } from "@/lib/onlyfans/plan-c-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Unknown sends, unlinked transactions and unreconciled access evidence, each with an owner and a next step. Read only. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const gate = await planCGate(request, (await context.params).accountId, false);
  return gate instanceof NextResponse ? gate : planCJson(await planCReadUnresolved(gate.backend, gate.accountId));
}
