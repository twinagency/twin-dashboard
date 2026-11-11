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
  if (!object(body) || !Object.keys(body).every(key => key === "curl" || key === "staticParamOverride") ||
    typeof body.curl !== "string" || !body.curl.trim() || body.curl.length > 65_536 ||
    ("staticParamOverride" in body && body.staticParamOverride !== null && typeof body.staticParamOverride !== "string"))
    return connectionRefusal(400, "Paste a single curl command copied from DevTools.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const result = await backend.captureFromCurl(accountId, body.curl, typeof body.staticParamOverride === "string" ? body.staticParamOverride : null);
  return result.ok
    ? connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: true, ...result.data })
    : connectionRefusal(result.status, result.error);
}
