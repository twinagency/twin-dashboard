import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { readCommandJson, CommandBodyTooLarge } from "@/lib/onlyfans/command-json";
import { trustedFormOrigin } from "@/lib/form-origin";
import type { EngineEnvironment } from "@/lib/onlyfans/engine-status";
import { configuredEngineOperatorBackend, ENGINE_OPERATOR_SCHEMA, engineActionNeedsNote, isEngineEnvironment, isEngineOperatorAction } from "@/lib/onlyfans/engine-operator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: false, outcome: "refused", error }, status);

export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; conversationId: string; requestId: string }> }) {
  // The backend binds a handover to the exact actor (accept, complete, decline): the named owner keeps it across sign-ins.
  const ctx = await authorizeOnlyFansRead({ agency: true, write: true, capability: "chat", pilotIdentity: true });
  // Raised before any upstream call, so nothing was applied: tagged as this route's refusal, never left to the client to infer.
  if ("ok" in ctx) return refuse(ctx.status, ctx.error);
  const actor = ctx.pilotActor ?? ctx.actor;
  if (!ctx.canChat || !actor) return refuse(403, "Your team access is read-only.");
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return refuse(403, "This change must be requested from this dashboard.");
  const params = await context.params;
  const accountId = requestId(params.accountId), conversationId = requestId(params.conversationId);
  if (!accountId || !conversationId || !/^[0-9a-f-]{36}$/.test(params.requestId)) return refuse(400, "That request reference is invalid.");
  let body: Record<string, unknown>;
  try {
    body = await readCommandJson(request) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) || !isEngineOperatorAction(body.action) ||
        !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) >= 2 ** 31 - 1) throw new Error();
    const resolution = engineActionNeedsNote(body.action);
    const allowed = new Set(["action", "expectedRevision", "environment", ...(resolution ? ["note"] : [])]);
    if (Object.keys(body).some(key => !allowed.has(key)) || (resolution && !Object.hasOwn(body, "note")) ||
        // Every action names its environment; the dashboard never picks one for it.
        !isEngineEnvironment(body.environment) ||
        (resolution && (typeof body.note !== "string" || !body.note.trim() || body.note !== body.note.trim() || body.note.length > 108 || /[\u0000-\u001f]/.test(body.note)))) throw new Error();
  } catch (error) { return refuse(error instanceof CommandBodyTooLarge ? 413 : 400, "That request action is invalid."); }
  const backend = configuredEngineOperatorBackend(ctx.fetch);
  if (!backend || !isEngineOperatorAction(body.action)) return refuse(503, "Request actions are not configured.");
  const action = body.action, environment = body.environment as EngineEnvironment, expectedRevision = body.expectedRevision as number, note = typeof body.note === "string" ? body.note : undefined;
  // A chat grant may handle requests; marking one reconciled stays with managers and the operator (RISKS D6), refused before upstream.
  if (action === "mark_reconciled" && !ctx.canManage) return refuse(403, "Only a manager can mark a request reconciled.");
  // `environment` is a label for the audit string only. The backend decides whether this binding is simulated or real and refuses a mismatch.
  const commandKey = createHash("sha256").update(JSON.stringify([actor, accountId, conversationId, params.requestId, action, expectedRevision, note ?? null, ...(environment === "simulation" ? [] : [environment])])).digest("hex");
  const result = await backend({ accountId, conversationId, requestId: params.requestId, action, expectedRevision, actor, commandKey, note, environment });
  return result.ok ? answer({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: true, outcome: "recorded" }) :
    answer({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: false, outcome: result.outcome, error: result.error }, result.status ?? 502);
}
