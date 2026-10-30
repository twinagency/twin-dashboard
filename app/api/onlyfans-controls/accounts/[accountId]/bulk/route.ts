import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredBulkControlBackend } from "@/lib/onlyfans/bulk-controls-backend";
import { validBulkRequest } from "@/lib/onlyfans/bulk-controls";
import { CONTROL_SCHEMA } from "@/lib/onlyfans/controls";
import { readCommandJson, CommandBodyTooLarge } from "@/lib/onlyfans/command-json";
import { trustedFormOrigin } from "@/lib/form-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: CONTROL_SCHEMA, ok: false, outcome: "refused", error }, status);
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true });
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return refuse(403, "Management permission is required.");
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return refuse(403, "Request this change from the dashboard.");
  const accountId = requestId((await context.params).accountId);
  if (!accountId) return refuse(400, "That account reference is invalid.");
  let body: unknown;
  try { body = await readCommandJson(request); }
  catch (error) { return refuse(error instanceof CommandBodyTooLarge ? 413 : 400, "That bulk request is invalid."); }
  if (!validBulkRequest(body)) return refuse(400, "That bulk request is invalid.");
  const backend = configuredBulkControlBackend(ctx.fetch);
  if (!backend) return refuse(503, "Conversation controls are not configured.");
  const commandKey = createHash("sha256").update(JSON.stringify([ctx.actor, accountId, body.action,
    body.items.map(item => [item.conversationId, item.expectedRevision])])).digest("hex");
  const result = await backend({ ...body, accountId, actor: ctx.actor, commandKey });
  return result.ok ? answer(result.ack) : answer({ schemaVersion: CONTROL_SCHEMA, ...result }, result.status);
}
