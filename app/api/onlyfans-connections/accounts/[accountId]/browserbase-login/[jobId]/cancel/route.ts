import { NextRequest, NextResponse } from "next/server";
import { requestId } from "@/lib/onlyfans/route";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { browserbaseJobId } from "@/lib/onlyfans-connections/browserbase";
import { CONNECTION_SCHEMA, object } from "@/lib/onlyfans-connections/contract";
import { connectionAnswer, connectionRefusal, connectionCommandContext } from "@/lib/onlyfans-connections/route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; jobId: string }> };
export async function POST(request: NextRequest, context: Context) {
  const ctx = await connectionCommandContext(request); if (ctx instanceof NextResponse) return ctx;
  const params = await context.params, accountId = requestId(params.accountId), jobId = browserbaseJobId(params.jobId);
  if (!accountId || !jobId) return connectionRefusal(400, "That Browserbase login reference is invalid.");
  const body = ctx.body;
  if (!object(body) || Object.keys(body).length) return connectionRefusal(400, "The Browserbase cancel request is invalid.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const result = await backend.browserbaseCancel(accountId, jobId);
  return result.ok ? connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: true, ...result.data }) : connectionRefusal(result.status, result.error);
}
