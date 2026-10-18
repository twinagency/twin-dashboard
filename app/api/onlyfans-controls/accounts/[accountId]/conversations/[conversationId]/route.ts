import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredControlBackend } from "@/lib/onlyfans/controls-backend";
import { CONTROL_SCHEMA, isControlAction } from "@/lib/onlyfans/controls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: CONTROL_SCHEMA,
  ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: NextRequest, context: {
  params: Promise<{ accountId: string; conversationId: string }>;
}) {
  const ctx = await requireOnlyFansRead();
  if (ctx instanceof NextResponse) return ctx;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!await verifySessionToken(session)) return refuse(401, "Sign in again before changing this conversation.");
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
    const reader = request.body?.getReader();
    if (!reader) return refuse(400, "The control request is missing.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 4096) { await reader.cancel(); return refuse(413, "The control request is too large."); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const raw = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (!body || Array.isArray(body) || Object.keys(body).sort().join(",") !== "action,expectedRevision" ||
        !isControlAction(body.action) || !Number.isInteger(body.expectedRevision) ||
        (body.expectedRevision as number) < 0 || (body.expectedRevision as number) >= 2 ** 31 - 1) throw new Error();
  } catch { return refuse(400, "That conversation control request is invalid."); }
  const backend = configuredControlBackend();
  if (!backend) return refuse(503, "Conversation controls are not configured.");
  const action = body.action;
  if (!isControlAction(action)) return refuse(400, "That conversation control is unavailable.");
  const expectedRevision = body.expectedRevision as number;
  // This shared-password dashboard has sessions, not individually named staff.
  // Audit the verified session without storing its reusable credential.
  const actor = `op-session:${digest(session!)}`;
  const commandKey = digest(JSON.stringify([actor, accountId, conversationId, action, expectedRevision]));
  const result = await backend({ accountId, conversationId, action, expectedRevision, actor, commandKey });
  return result.ok ? answer(result.ack) : answer({ schemaVersion: CONTROL_SCHEMA,
    ok: false, outcome: result.outcome, error: result.error }, result.status);
}
