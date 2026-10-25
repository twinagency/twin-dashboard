import { NextResponse } from "next/server";
import { PRIVATE_HEADERS, badRequest, requestId, requireOnlyFansRead } from "@/lib/onlyfans/route";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await params).accountId);
  if (!accountId) return badRequest("That account reference is not a valid identifier.");
  if (!ctx.backend?.getOperations) {
    return NextResponse.json({ ok: false, state: "unavailable", code: "operations_unavailable", error: "Operational status is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const result = await ctx.backend.getOperations(accountId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, state: [401, 403, 404].includes(result.status) ? "denied" : result.status === 503 ? "unavailable" : "error", code: result.code, error: result.error }, { status: result.status, headers: PRIVATE_HEADERS });
  }
  return NextResponse.json({ operations: result.data }, { headers: PRIVATE_HEADERS });
}
