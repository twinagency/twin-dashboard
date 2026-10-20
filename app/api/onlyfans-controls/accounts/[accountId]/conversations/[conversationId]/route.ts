import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredControlBackend } from "@/lib/onlyfans/controls-backend";
import { CONTROL_SCHEMA, isControlAction } from "@/lib/onlyfans/controls";
import { readCommandJson, CommandBodyTooLarge } from "@/lib/onlyfans/command-json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: CONTROL_SCHEMA,
  ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: NextRequest, context: {
  params: Promise<{ accountId: string; conversationId: string }>;
}) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true });
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return refuse(403, "Your team access is read-only.");
  // Next may canonicalize nextUrl's hostname to localhost. The HTTP Host is
  // the browser-facing authority; do not trust a forwarded-host override.
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin ||
      ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return refuse(403, "This change must be requested from this dashboard.");
  }
  const params = await context.params;
  const accountId = requestId(params.accountId), conversationId = requestId(params.conversationId);
  if (!accountId || !conversationId) return refuse(400, "That conversation reference is invalid.");
  let body: Record<string, unknown>;
  try {
    body = await readCommandJson(request) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !isControlAction(body.action) || !Number.isInteger(body.expectedRevision) ||
        (body.expectedRevision as number) < 0 || (body.expectedRevision as number) >= 2 ** 31 - 1) throw new Error();
    const manual = body.action === "manual_message";
    const manualKeys = ["action", "body", "expectedRevision", "requestKey", ...(Object.hasOwn(body, "catalogItemId") ? ["catalogItemId"] : [])].sort().join(",");
    if (Object.keys(body).sort().join(",") !== (manual ? manualKeys : "action,expectedRevision")) throw new Error();
    if (manual && (typeof body.body !== "string" || !body.body.trim() || new TextEncoder().encode(body.body).length > 4000 ||
        typeof body.requestKey !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.requestKey))) throw new Error();
    if (manual && Object.hasOwn(body, "catalogItemId") && body.catalogItemId !== null &&
        (!Number.isInteger(body.catalogItemId) || (body.catalogItemId as number) <= 0 || (body.catalogItemId as number) >= 2 ** 31)) throw new Error();
  } catch (error) { return refuse(error instanceof CommandBodyTooLarge ? 413 : 400, "That conversation control request is invalid."); }
  const backend = configuredControlBackend(ctx.fetch);
  if (!backend) return refuse(503, "Conversation controls are not configured.");
  const action = body.action;
  if (!isControlAction(action)) return refuse(400, "That conversation control is unavailable.");
  const expectedRevision = body.expectedRevision as number;
  // This shared-password dashboard has sessions, not individually named staff.
  // Audit the verified session without storing its reusable credential.
  const actor = ctx.actor;
  const commandKey = digest(JSON.stringify([actor, accountId, conversationId, action, expectedRevision,
    ...(action === "manual_message" ? [body.body, body.requestKey, ...(Object.hasOwn(body, "catalogItemId") ? [body.catalogItemId] : [])] : [])]));
  const result = await backend({ accountId, conversationId, action, expectedRevision, actor, commandKey,
    ...(action === "manual_message" ? { body: body.body as string,
      ...(Object.hasOwn(body, "catalogItemId") ? { catalogItemId: body.catalogItemId as number | null } : {}) } : {}) });
  return result.ok ? answer(result.ack) : answer({ schemaVersion: CONTROL_SCHEMA,
    ok: false, outcome: result.outcome, error: result.error }, result.status);
}
