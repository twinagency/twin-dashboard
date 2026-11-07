/**
 * Browser side of the Plan C operator surface. It talks only to this dashboard's own routes, which hold the
 * backend token. Nothing here imports plan-c-backend.ts or reads an environment variable.
 *
 * Design rules, all asserted in tests/contracts/plan-c.test.ts:
 *  - One command per call, one draft or conversation per call. There is no bulk form and no function that decides by itself.
 *  - Every command carries a random 64-hex commandKey. The key for an intent is kept until the outcome is known, so a retry
 *    after a lost reply or a double click reuses it and the backend replays instead of acting twice.
 *  - A 409 (version or revision conflict) is returned as `conflict` with `reload: true`; it is never retried.
 */
import { PLAN_C_CONFLICT_TEXT, PLAN_C_SCHEMA, PLAN_C_UNCONFIRMED_TEXT, newCommandKey, parsePlanCDrafts, parsePlanCUnresolved,
  validateEditedParts, validateEvidenceRef, validateRejectReason,
  type PlanCCommandResult, type PlanCConversationAction, type PlanCDraft, type PlanCDraftList, type PlanCUnresolvedItem, type PlanCUnresolvedList } from "./plan-c";

export type PlanCReadOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** Keys by intent. An intent is the exact action on the exact version, so a different edit text or reason is a different intent. */
export function createCommandKeyStore(random: () => string = newCommandKey) {
  const keys = new Map<string, string>();
  return {
    keyFor(intent: string): string { let key = keys.get(intent); if (!key) { key = random(); keys.set(intent, key); } return key; },
    forget(intent: string) { keys.delete(intent); },
    size: () => keys.size,
  };
}

const base = (accountId: string) => `/api/onlyfans-controls/accounts/${encodeURIComponent(accountId)}/plan-c`;
const unconfirmed = (): PlanCCommandResult => ({ ok: false, outcome: "unconfirmed", reload: true, error: PLAN_C_UNCONFIRMED_TEXT });
const invalid = (error: string): PlanCCommandResult => ({ ok: false, outcome: "refused", reload: false, error });

export function createPlanCClient(options: { accountId: string; fetchImpl?: typeof fetch; keys?: ReturnType<typeof createCommandKeyStore> }) {
  const { accountId } = options, fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const keys = options.keys ?? createCommandKeyStore();
  const init = { credentials: "same-origin", cache: "no-store", redirect: "error" } as const;

  async function read<T>(path: string, parse: (value: unknown) => T | null, what: string): Promise<PlanCReadOutcome<T>> {
    try {
      const response = await fetchImpl(base(accountId) + path, { ...init, method: "GET", signal: AbortSignal.timeout(8000) });
      const data = response.ok ? parse(await response.json()) : null;
      if (data) return { ok: true, data };
      return { ok: false, error: response.ok ? `${what} could not be read.` : `${what} is unavailable.` };
    } catch { return { ok: false, error: `${what} is unavailable.` }; }
  }

  /** `intent` ties the key to this exact action. The key is dropped once the outcome is definite and kept when it is not. */
  async function send(path: string, intent: string, body: (commandKey: string) => Record<string, unknown>): Promise<PlanCCommandResult> {
    const commandKey = keys.keyFor(intent);
    let result: PlanCCommandResult = unconfirmed();
    try {
      const response = await fetchImpl(base(accountId) + path, { ...init, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(commandKey)), signal: AbortSignal.timeout(10_000) });
      const data: unknown = await response.json();
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        if (record.schemaVersion === PLAN_C_SCHEMA && record.ok === true && record.outcome === "recorded")
          result = { ok: true, replayed: record.replayed === true, recordedVersion: typeof record.recordedVersion === "number" ? record.recordedVersion : null,
            recordedRevision: typeof record.recordedRevision === "number" ? record.recordedRevision : null };
        else if (record.schemaVersion === PLAN_C_SCHEMA && record.ok === false && (record.outcome === "refused" || record.outcome === "conflict" || record.outcome === "unconfirmed") && typeof record.error === "string")
          result = { ok: false, outcome: record.outcome, error: record.outcome === "conflict" ? PLAN_C_CONFLICT_TEXT : record.error, reload: record.reload === true || record.outcome === "conflict" };
      }
    } catch { /* A lost reply does not prove the command failed. */ }
    // Only a definite answer releases the key. Unconfirmed keeps it so that retrying is idempotent.
    if (result.ok || result.outcome !== "unconfirmed") keys.forget(intent);
    return result;
  }

  const draftPath = (draft: PlanCDraft, action: string) => `/drafts/${encodeURIComponent(draft.requestId)}/${draft.generation}/${action}`;
  const draftIntent = (draft: PlanCDraft, action: string, extra = "") => `draft:${action}:${draft.requestId}:${draft.generation}:v${draft.draftVersion}${extra}`;
  const conversationPath = (conversationId: string, action: PlanCConversationAction) => `/conversations/${encodeURIComponent(conversationId)}/${action}`;

  return {
    listDrafts: (): Promise<PlanCReadOutcome<PlanCDraftList>> => read("/drafts", value => parsePlanCDrafts(value, accountId), "Drafts awaiting approval"),
    listUnresolved: (): Promise<PlanCReadOutcome<PlanCUnresolvedList>> => read("/unresolved", value => parsePlanCUnresolved(value, accountId), "Unresolved work"),
    /** Approve this one draft version. Called only from an operator's click on one draft. */
    approveDraft: (draft: PlanCDraft) => send(draftPath(draft, "approve"), draftIntent(draft, "approve"),
      commandKey => ({ expectedVersion: draft.draftVersion, commandKey })),
    rejectDraft: async (draft: PlanCDraft, reason: string) => {
      const problem = validateRejectReason(reason); if (problem) return invalid(problem);
      return send(draftPath(draft, "reject"), draftIntent(draft, "reject", `:${reason.trim()}`), commandKey => ({ expectedVersion: draft.draftVersion, commandKey, reason: reason.trim() }));
    },
    editDraft: async (draft: PlanCDraft, parts: string[]) => {
      const problem = validateEditedParts(draft, parts); if (problem) return invalid(problem);
      return send(draftPath(draft, "edit"), draftIntent(draft, "edit", `:${JSON.stringify(parts)}`), commandKey => ({ expectedVersion: draft.draftVersion, commandKey, parts }));
    },
    /** stop, takeover or handback. `expectedRevision` is the revision the operator was shown. */
    conversationCommand: (conversationId: string, action: PlanCConversationAction, expectedRevision: number) =>
      send(conversationPath(conversationId, action), `conversation:${action}:${conversationId}:r${expectedRevision}`, commandKey => ({ expectedRevision, commandKey })),
    reconcile: async (item: PlanCUnresolvedItem, evidence: string) => {
      const problem = validateEvidenceRef(evidence); if (problem) return invalid(problem);
      return send(`/unresolved/${encodeURIComponent(item.id)}/reconcile`, `reconcile:${item.id}:${evidence.trim()}`, commandKey => ({ commandKey, evidence: evidence.trim() }));
    },
  };
}
export type PlanCClient = ReturnType<typeof createPlanCClient>;
