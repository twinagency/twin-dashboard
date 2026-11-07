import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS, badRequest } from "@/lib/onlyfans/route";
import { configuredEngineStatusBackend, parseEnginePageQuery } from "@/lib/onlyfans/engine-status-backend";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Account-wide requests and sends that still need a person, unresolved first. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId);
  if (!accountId) return badRequest("That account reference is invalid.");
  const page = parseEnginePageQuery(request.nextUrl.searchParams);
  if (!page) return badRequest("That page request is invalid.");
  const backend = configuredEngineStatusBackend(ctx.fetch);
  if (!backend) return NextResponse.json({ error: "Request status is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  const result = await backend.unresolved(accountId, page);
  return result.ok ? NextResponse.json(result.data, { headers: PRIVATE_HEADERS })
    : NextResponse.json({ error: result.error }, { status: result.status, headers: PRIVATE_HEADERS });
}
