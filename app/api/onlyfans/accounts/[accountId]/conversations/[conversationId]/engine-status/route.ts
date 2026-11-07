import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS, badRequest } from "@/lib/onlyfans/route";
import { configuredEngineStatusBackend, parseEnginePageQuery } from "@/lib/onlyfans/engine-status-backend";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One page of a conversation's engine requests, unresolved first. The cursor is opaque and only passed through. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const params = await context.params, accountId = requestId(params.accountId), conversationId = requestId(params.conversationId);
  if (!accountId || !conversationId) return badRequest("That conversation reference is invalid.");
  const page = parseEnginePageQuery(request.nextUrl.searchParams);
  if (!page) return badRequest("That page request is invalid.");
  const backend = configuredEngineStatusBackend(ctx.fetch);
  if (!backend) return NextResponse.json({ error: "Request status is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  const result = await backend.conversation(accountId, conversationId, page);
  return result.ok ? NextResponse.json(result.data, { headers: PRIVATE_HEADERS })
    : NextResponse.json({ error: result.error }, { status: result.status, headers: PRIVATE_HEADERS });
}
