import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { internalOperator } from "@/lib/onlyfans/reads";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { CONNECTION_SCHEMA, object, validConnectionRequest } from "@/lib/onlyfans-connections/contract";
import { connectionAnswer, connectionRefusal, connectionCommandContext } from "@/lib/onlyfans-connections/route";
import { peekCapture } from "@/lib/onlyfans-connections/capture-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string }> };
/** A save's `payload.captureRef` replaced by the capture held server-side; no ref: the body unchanged. Unknown, expired, other-account
 * and other-session refs all answer 410 capture_expired (no existence oracle). An ownerId mismatch then fails validConnectionRequest. */
function swapCaptureRef(body: unknown, scope: { accountId: string; actor: string }): { body: unknown } | NextResponse {
  if (!object(body) || !object(body.payload) || !("captureRef" in body.payload)) return { body };
  const { captureRef: handle, ...rest } = body.payload;
  if (typeof handle !== "string" || body.action !== "save") return connectionRefusal(400, "That connection request is invalid.", "invalid_request");
  const stored = peekCapture(handle, scope);
  if (!stored) return connectionRefusal(410, "That capture expired. Capture the session again.", "capture_expired");
  return { body: { ...body, payload: { ...rest, capture: stored.capture, xHash: stored.xHash } } };
}
export async function GET(_request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId) return connectionRefusal(400, "That account reference is invalid.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const result = await backend.get(accountId, internalOperator(ctx.auth));
  return result.ok ? connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: true, connection: result.data }) : connectionRefusal(result.status, result.error);
}
export async function POST(request: NextRequest, context: Context) {
  const ctx = await connectionCommandContext(request); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId) return connectionRefusal(400, "That connection request is invalid.");
  // payload.captureRef: the capture held server-side is swapped in before validation and before the commandKey is hashed.
  const swapped = swapCaptureRef(ctx.body, { accountId, actor: ctx.actor }); if (swapped instanceof NextResponse) return swapped;
  const { body } = swapped; if (!validConnectionRequest(body)) return connectionRefusal(400, "That connection request is invalid.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const result = await backend.command(accountId, { ...body, ...ctx.identity(accountId, body) });
  // The handle is not consumed on ack: a lost ack must let "Retry same command" reach the backend. The 15 min TTL expires it.
  return result.ok ? connectionAnswer(result.ack) : connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ...result }, result.status);
}
