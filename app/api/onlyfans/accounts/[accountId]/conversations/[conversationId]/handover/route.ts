import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS, badRequest } from "@/lib/onlyfans/route";
import { configuredBackendPurpose } from "@/lib/onlyfans/backend-transport";
import { handoverForViewer } from "@/lib/onlyfans/handover";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "@/lib/onlyfans-preview/types";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const params = await context.params, accountId = requestId(params.accountId), conversationId = requestId(params.conversationId);
  if (!accountId || !conversationId) return badRequest("That conversation reference is invalid.");
  const purpose = configuredBackendPurpose("API");
  if (purpose) try {
    const response = await ctx.fetch(purpose.baseUrl.replace(/\/+$/, "") + `/onlyfans/api/v1/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/handover`, {
      method: "GET", cache: "no-store", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${purpose.token}`, "X-OnlyFans-Schema-Version": ONLYFANS_PREVIEW_SCHEMA_VERSION } });
    const value = response.ok ? handoverForViewer(await response.json(), accountId, conversationId, ctx.actor, ctx.canManage, ctx.auth.agency) : null;
    if (value) return NextResponse.json(value, { headers: PRIVATE_HEADERS });
    if ([403, 404].includes(response.status)) return NextResponse.json({ error: "That conversation is not available." }, { status: 404, headers: PRIVATE_HEADERS });
  } catch { /* fail closed: uncertain ownership cannot enable staff controls */ }
  return NextResponse.json({ error: "Conversation ownership could not be refreshed." }, { status: 503, headers: PRIVATE_HEADERS });
}
