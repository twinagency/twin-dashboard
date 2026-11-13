/**
 * Pure request handling for the Plan C proxy routes: what the browser may send and what the backend is told.
 * No cookie, header or Next import, so every rule here is testable offline. The route files add authentication.
 *
 * The actor is always the logged-in operator passed in by the route. A browser-supplied `actor` is refused, not ignored.
 */
import { PLAN_C_MAX_BODY_BYTES, PLAN_C_SCHEMA, isPlanCCommandKey, isPlanCConversationAction, isPlanCDraftAction, isPlanCId, isPlanCRequestId,
  planCEvidenceRef, validateEditTexts, validateEvidenceRef, validateRejectReason, type PlanCDraftAction } from "./plan-c";
import type { PlanCBackend } from "./plan-c-backend";
import { createHash } from "node:crypto";
import { isOperatorActor } from "./upload-permission";

export type PlanCHttp = { status: number; body: Record<string, unknown> };
/** A Plan C refusal: nothing was applied. Shared by the proxy rules here and the route gate in plan-c-guard.ts. */
export const planCRefused = (status: number, error: string): PlanCHttp => ({ status, body: { schemaVersion: PLAN_C_SCHEMA, ok: false, outcome: "refused", error, reload: false } });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactly = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(body, key));
const version = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value < 2 ** 31 - 1;
const revision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2 ** 31 - 1;

/** Who may use the Plan C surface: the verified internal operator session, nobody else. Agency, view-as and chat-only grants are refused. */
export function planCOperatorOnly(ctx: { auth: { operatorSession: boolean; agency: boolean; viewAs: boolean; agencyGrant?: unknown }; actor: string | null; pilotActor?: string | null; canManage: boolean }):
  { ok: true; actor: string } | { ok: false; status: 401 | 403; error: string } {
  if (!ctx.auth.operatorSession) return { ok: false, status: 401, error: "Sign in as the operator to use Plan C approvals." };
  if (ctx.auth.agency || ctx.auth.agencyGrant || ctx.auth.viewAs || !ctx.canManage || !isOperatorActor(ctx.pilotActor))
    return { ok: false, status: 403, error: "Plan C approvals are available to the operator only." };
  return { ok: true, actor: ctx.pilotActor };
}

/** Names the operator's saved Plan C command keys in the browser tab. A hash, so the backend actor never reaches the browser. */
export const planCKeyScope = (actor: string) => createHash("sha256").update(`plan-c-keys:${actor}`).digest("hex").slice(0, 16);

export const planCReadDrafts = async (backend: PlanCBackend, accountId: string, actor?: string): Promise<PlanCHttp> => {
  const result = await backend.drafts(accountId, actor);
  return result.ok ? { status: 200, body: { schemaVersion: PLAN_C_SCHEMA, ok: true, ...result.data } }
    : { status: result.status, body: { schemaVersion: PLAN_C_SCHEMA, ok: false, error: result.error, ...(result.stopTargets ? { stopTargets: result.stopTargets } : {}) } };
};
export const planCReadUnresolved = async (backend: PlanCBackend, accountId: string, actor?: string): Promise<PlanCHttp> => {
  const result = await backend.unresolved(accountId, actor);
  return result.ok ? { status: 200, body: { schemaVersion: PLAN_C_SCHEMA, ok: true, ...result.data } } : { status: result.status, body: { schemaVersion: PLAN_C_SCHEMA, ok: false, error: result.error } };
};

const answer = (result: Awaited<ReturnType<PlanCBackend["draft"]>>): PlanCHttp => result.ok
  ? { status: 200, body: { schemaVersion: PLAN_C_SCHEMA, ok: true, outcome: "recorded", replayed: result.replayed, recordedVersion: result.recordedVersion, recordedRevision: result.recordedRevision } }
  : { status: result.outcome === "conflict" ? 409 : result.outcome === "unconfirmed" ? 502 : 400, body: { schemaVersion: PLAN_C_SCHEMA, ok: false, outcome: result.outcome, error: result.error, reload: result.reload } };

/** approve, reject or edit one draft version. The body carries the version the operator saw; the backend refuses a stale one with 409. */
export async function planCDraftCommand(backend: PlanCBackend, input: { actor: string; accountId: string; requestId: string; generation: string; action: string; body: unknown }): Promise<PlanCHttp> {
  const { actor, accountId, requestId, generation, action, body } = input;
  if (!isPlanCId(accountId) || !isPlanCRequestId(requestId) || !/^[0-9]{1,9}$/.test(generation) || !isPlanCDraftAction(action)) return planCRefused(400, "That draft reference is invalid.");
  if (!record(body) || !isPlanCCommandKey(body.commandKey) || !version(body.expectedVersion)) return planCRefused(400, "That draft action is invalid.");
  const common = { requestId, generation: Number(generation), action: action as PlanCDraftAction, expectedVersion: body.expectedVersion, commandKey: body.commandKey, actor };
  if (action === "approve") {
    if (!exactly(body, ["expectedVersion", "commandKey"])) return planCRefused(400, "That draft action is invalid.");
    return answer(await backend.draft(accountId, common));
  }
  if (action === "reject") {
    if (!exactly(body, ["expectedVersion", "commandKey", "reason"]) || typeof body.reason !== "string" || validateRejectReason(body.reason)) return planCRefused(400, "A rejection needs a reason.");
    return answer(await backend.draft(accountId, { ...common, reason: body.reason.trim() }));
  }
  if (!exactly(body, ["expectedVersion", "commandKey", "parts"]) || !Array.isArray(body.parts) || !body.parts.length || body.parts.length > 8 || body.parts.some(part => typeof part !== "string"))
    return planCRefused(400, "That edit is invalid.");
  const parts = body.parts as string[];
  // The proxy has not seen the draft, so "unchanged" and part count are the backend's call; text rules are enforced here too.
  if (validateEditTexts(parts)) return planCRefused(400, "That edit is invalid.");
  return answer(await backend.draft(accountId, { ...common, parts }));
}

/** stop, take over or hand back. A hand back restores planning eligibility only; the backend never replays a draft from it. */
export async function planCConversationCommand(backend: PlanCBackend, input: { actor: string; accountId: string; conversationId: string; action: string; body: unknown }): Promise<PlanCHttp> {
  const { actor, accountId, conversationId, action, body } = input;
  if (!isPlanCId(accountId) || !isPlanCId(conversationId) || !conversationId.startsWith(`${accountId}:`) || !isPlanCConversationAction(action)) return planCRefused(400, "That conversation reference is invalid.");
  if (!record(body) || !exactly(body, ["expectedRevision", "commandKey"]) || !isPlanCCommandKey(body.commandKey) || !revision(body.expectedRevision)) return planCRefused(400, "That conversation action is invalid.");
  return answer(await backend.conversation(accountId, { conversationId, action, expectedRevision: body.expectedRevision, commandKey: body.commandKey, actor }));
}

/** Reconcile one unresolved item. Refused without an evidence reference. */
export async function planCReconcile(backend: PlanCBackend, input: { actor: string; accountId: string; id: string; body: unknown }): Promise<PlanCHttp> {
  const { actor, accountId, id, body } = input;
  if (!isPlanCId(accountId) || !/^[A-Za-z0-9._:-]{1,100}$/.test(id)) return planCRefused(400, "That item reference is invalid.");
  if (!record(body) || !exactly(body, ["commandKey", "evidence"]) || !isPlanCCommandKey(body.commandKey) || typeof body.evidence !== "string" || validateEvidenceRef(body.evidence))
    return planCRefused(400, "Reconciling needs the evidence you checked.");
  return answer(await backend.reconcile(accountId, { id, commandKey: body.commandKey, actor, evidenceRef: planCEvidenceRef(body.evidence) }));
}

export { PLAN_C_MAX_BODY_BYTES };
