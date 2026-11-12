import { NextRequest, NextResponse } from "next/server";
import { requestId } from "@/lib/onlyfans/route";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { browserbaseJobId } from "@/lib/onlyfans-connections/browserbase";
import { CONNECTION_SCHEMA } from "@/lib/onlyfans-connections/contract";
import { connectionAnswer, connectionRefusal, connectionSessionContext } from "@/lib/onlyfans-connections/route";
import { putCapture } from "@/lib/onlyfans-connections/capture-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; jobId: string }> };
/** Holds the capture once the job is done and answers its handle, so it carries the same session gate as the write routes. */
export async function GET(request: NextRequest, context: Context) {
  const ctx = await connectionSessionContext(request); if (ctx instanceof NextResponse) return ctx;
  const params = await context.params, accountId = requestId(params.accountId), jobId = browserbaseJobId(params.jobId);
  if (!accountId || !jobId) return connectionRefusal(400, "That Browserbase login reference is invalid.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const result = await backend.browserbaseStatus(accountId, jobId);
  if (!result.ok) return connectionRefusal(result.status, result.error);
  const { state, liveViewUrl, capture, xHash, ownerId } = result.data;
  const held = state === "done" && capture && xHash && ownerId ? { captureId: putCapture({ accountId, actor: ctx.actor, jobId }, { capture, xHash, ownerId }) } : {};
  // By-name projection: capture, X-Hash and the backend's free-text error never reach the browser (rule: OnlyFans session data never
  // reaches the browser). The error is arbitrary exception text, so it is dropped, not filtered; the editor shows its fixed failure copy.
  return connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: true, jobId: result.data.jobId, state, liveViewUrl, error: null, ownerId, ...held });
}
