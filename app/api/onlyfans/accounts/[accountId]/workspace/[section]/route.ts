import { NextResponse } from "next/server";
import { PRIVATE_HEADERS, badRequest, requestId, requireOnlyFansRead } from "@/lib/onlyfans/route";
import { NATIVE_SECTIONS, type NativeSection } from "@/lib/onlyfans/workspace";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "@/lib/onlyfans-preview/types";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ accountId: string; section: string }> }) {
  const ctx = await requireOnlyFansRead();
  if (ctx instanceof NextResponse) return ctx;
  const params = await context.params;
  const accountId = requestId(params.accountId);
  const url = new URL(request.url);
  const cursors = url.searchParams.getAll("cursor");
  if (!accountId || !NATIVE_SECTIONS.includes(params.section as NativeSection) || cursors.length > 1) return badRequest("That account or page reference is invalid.");
  if (!ctx.backend?.getWorkspace) return NextResponse.json({ ok: false, state: "unavailable", code: "workspace_unavailable", error: "This section is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  const result = await ctx.backend.getWorkspace(accountId, params.section as NativeSection, cursors[0] ?? null);
  if (!result.ok) return NextResponse.json({ ok: false, state: [401, 403, 404].includes(result.status) ? "denied" : result.status === 503 ? "unavailable" : "error", code: result.code, error: result.error }, { status: result.status, headers: PRIVATE_HEADERS });
  return NextResponse.json({ schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION, workspace: result.data }, { headers: PRIVATE_HEADERS });
}
