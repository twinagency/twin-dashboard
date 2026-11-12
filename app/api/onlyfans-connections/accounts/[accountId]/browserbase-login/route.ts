import { NextRequest, NextResponse } from "next/server";
import { requestId } from "@/lib/onlyfans/route";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { CONNECTION_SCHEMA, object } from "@/lib/onlyfans-connections/contract";
import { connectionAnswer, connectionRefusal, connectionCommandContext } from "@/lib/onlyfans-connections/route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string }> };
export async function POST(request: NextRequest, context: Context) {
  const ctx = await connectionCommandContext(request); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId) return connectionRefusal(400, "That account reference is invalid.");
  const body = ctx.body;
  if (!object(body) || Object.keys(body).length) return connectionRefusal(400, "The Browserbase login request is invalid.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const result = await backend.browserbaseStart(accountId);
  if (result.ok) return connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: true, ...result.data });
  return result.code
    ? connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: false, outcome: "refused", code: result.code, error: result.error }, result.status)
    : connectionRefusal(result.status, result.error);
}
