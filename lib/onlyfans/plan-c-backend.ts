/**
 * Server-only transport for the Plan C operator contract (backend: /onlyfans/control/v2/...).
 *
 * This is the only Plan C module that sees the backend token. The browser bundle must never import it;
 * tests/contracts/plan-c.test.ts scans the client graph for that. Reads are attempted once and fail closed.
 * A write that gets no readable acknowledgement is "unconfirmed", never "failed": the backend may have committed.
 */
import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { PLAN_C_CONFLICT_TEXT, PLAN_C_HEADER, PLAN_C_REFUSED_TEXT, PLAN_C_SCHEMA, PLAN_C_UNCONFIRMED_TEXT, parsePlanCDrafts, parsePlanCUnresolved,
  type PlanCCommandResult, type PlanCConversationAction, type PlanCDraftAction, type PlanCDraftList, type PlanCUnresolvedList } from "./plan-c";

export type PlanCReadResult<T> = { ok: true; data: T } | { ok: false; status: 404 | 502 | 503; error: string };

export type PlanCDraftCommand = { requestId: string; generation: number; action: PlanCDraftAction; expectedVersion: number; commandKey: string; actor: string;
  reason?: string; parts?: string[] };
export type PlanCConversationCommand = { conversationId: string; action: PlanCConversationAction; expectedRevision: number; commandKey: string; actor: string };
export type PlanCReconcileCommand = { id: string; commandKey: string; actor: string; evidenceRef: string };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** Statuses that prove the backend did not apply the command. Everything else (5xx, timeouts, odd bodies) is unconfirmed. */
const REFUSED = new Set([400, 401, 403, 404, 405, 409, 410, 413, 422]);

export function createPlanCBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const root = (accountId: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/control/v2/accounts/${encodeURIComponent(accountId)}/`;
  const headers = { Authorization: `Bearer ${options.token}`, [PLAN_C_HEADER]: PLAN_C_SCHEMA };

  async function read<T>(url: string, parse: (value: unknown) => T | null, what: string, actor?: string): Promise<PlanCReadResult<T>> {
    try {
      const response = await call(url, { method: "GET", headers: { ...headers, ...(actor ? { "X-Plan-C-Actor": actor } : {}) } });
      if (response.status === 404) { await response.body?.cancel(); return { ok: false, status: 404, error: `${what} is not available.` }; }
      if (response.ok) { const data = parse(await response.json()); return data ? { ok: true, data } : { ok: false, status: 502, error: `${what} could not be read.` }; }
      await response.body?.cancel();
    } catch { /* fall through */ }
    return { ok: false, status: 503, error: `${what} is unavailable.` };
  }

  async function write(url: string, body: Record<string, unknown>, expect: { commandKey: string; accountId: string; requestId?: string; conversationId?: string; id?: string }): Promise<PlanCCommandResult> {
    try {
      const response = await call(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (REFUSED.has(response.status)) {
        await response.body?.cancel();
        // 409 is a version or revision conflict. 404 and 410 mean the draft is gone. All three need a fresh read.
        const reload = [404, 409, 410].includes(response.status);
        return { ok: false, outcome: response.status === 409 ? "conflict" : "refused", reload, error: reload ? PLAN_C_CONFLICT_TEXT : PLAN_C_REFUSED_TEXT };
      }
      if (response.ok) {
        const ack: unknown = await response.json();
        if (record(ack) && ack.schemaVersion === PLAN_C_SCHEMA && ack.ok === true && ack.commandKey === expect.commandKey &&
            (ack.accountId === undefined || ack.accountId === expect.accountId) && (ack.requestId === undefined || ack.requestId === expect.requestId) &&
            (ack.conversationId === undefined || ack.conversationId === expect.conversationId) && (ack.id === undefined || ack.id === expect.id) &&
            (ack.replayed === undefined || typeof ack.replayed === "boolean")) {
          const version = ack.recordedVersion ?? ack.draftVersion, revision = ack.recordedRevision;
          return { ok: true, replayed: ack.replayed === true,
            recordedVersion: typeof version === "number" && Number.isInteger(version) ? version : null,
            recordedRevision: typeof revision === "number" && Number.isInteger(revision) ? revision : null };
        }
      }
    } catch { /* The backend may have committed before the connection failed. */ }
    return { ok: false, outcome: "unconfirmed", reload: true, error: PLAN_C_UNCONFIRMED_TEXT };
  }

  return {
    drafts: (accountId: string, actor?: string): Promise<PlanCReadResult<PlanCDraftList>> =>
      read(root(accountId) + "drafts", value => parsePlanCDrafts(value, accountId), "Drafts awaiting approval", actor),
    unresolved: (accountId: string, actor?: string): Promise<PlanCReadResult<PlanCUnresolvedList>> =>
      read(root(accountId) + "unresolved", value => parsePlanCUnresolved(value, accountId), "Unresolved work", actor),
    draft: (accountId: string, command: PlanCDraftCommand) => write(
      root(accountId) + `drafts/${encodeURIComponent(command.requestId)}/${command.generation}/${command.action}`,
      { expectedVersion: command.expectedVersion, commandKey: command.commandKey, actor: command.actor,
        ...(command.action === "reject" ? { reason: command.reason } : {}), ...(command.action === "edit" ? { parts: command.parts } : {}) },
      { commandKey: command.commandKey, accountId, requestId: command.requestId }),
    conversation: (accountId: string, command: PlanCConversationCommand) => write(
      root(accountId) + `conversations/${encodeURIComponent(command.conversationId)}/${command.action}`,
      { commandKey: command.commandKey, actor: command.actor, expectedRevision: command.expectedRevision },
      { commandKey: command.commandKey, accountId, conversationId: command.conversationId }),
    reconcile: (accountId: string, command: PlanCReconcileCommand) => write(
      root(accountId) + `unresolved/${encodeURIComponent(command.id)}/reconcile`,
      { commandKey: command.commandKey, actor: command.actor, evidenceRef: command.evidenceRef },
      { commandKey: command.commandKey, accountId, id: command.id }),
  };
}
export type PlanCBackend = ReturnType<typeof createPlanCBackend>;

/** Same CONTROL credential as the request-action route, the contract's "same auth as engine_operator_api". Null when not configured. */
export function configuredPlanCBackend(fetchImpl?: typeof fetch): PlanCBackend | null {
  const options = configuredBackendPurpose("CONTROL");
  return options ? createPlanCBackend({ ...options, fetchImpl }) : null;
}
