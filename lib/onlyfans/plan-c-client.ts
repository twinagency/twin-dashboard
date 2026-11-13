/**
 * Browser side of the Plan C operator surface. It talks only to this dashboard's own routes, which hold the
 * backend token. Nothing here imports plan-c-backend.ts or reads an environment variable.
 *
 * Design rules, all asserted in tests/contracts/plan-c.test.ts:
 *  - One command per call, one draft or conversation per call. There is no bulk form and no function that decides by itself.
 *  - Every command carries a random 64-hex commandKey. The key for an intent is kept until the outcome is known, so a retry
 *    after a lost reply or a double click reuses it and the backend replays instead of acting twice. After an unconfirmed
 *    attempt only a recorded ack releases it.
 *  - A 409 (version or revision conflict) is returned as `conflict` with `reload: true`; it is never retried.
 */
import { PLAN_C_CONFLICT_TEXT, PLAN_C_SCHEMA, PLAN_C_UNCONFIRMED_TEXT, newCommandKey, parsePlanCDrafts, parsePlanCUnresolved, planCStopTargets,
  validateEditedParts, validateEvidenceRef, validateRejectReason,
  type PlanCCommandResult, type PlanCConversationAction, type PlanCDraft, type PlanCDraftList, type PlanCStopTarget, type PlanCUnresolvedItem, type PlanCUnresolvedList } from "./plan-c";

export type PlanCReadOutcome<T> = { ok: true; data: T } | { ok: false; error: string };
/** `stopTargets`: what a refused draft list can still be stopped on (plan-c.ts planCStopTargets), re-checked here; none when nothing was read. */
export type PlanCDraftsOutcome = { ok: true; data: PlanCDraftList } | { ok: false; error: string; stopTargets: PlanCStopTarget[] };

/**
 * Stored entries are named by this hash instead of the intent, which can hold a rejection reason, edited text or evidence, so that
 * text is not written to storage verbatim. A 64-bit non-cryptographic hash: it does not hide a short or guessable intent.
 */
function intentHash(intent: string): string {
  let a = 0x811c9dc5, b = 0x1b873593;
  for (let i = 0; i < intent.length; i++) { const c = intent.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 0x5bd1e995); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
const KEEP_MS = 24 * 3600_000;
type Entry = { key: string; held: boolean; at: number; request?: unknown };
/** Pending keys a `persistAs` store saved in this tab's sessionStorage. Anything malformed or older than a day is dropped. */
function storedKeys(name: string | undefined, now: number, keepRequests: boolean): [string, Entry][] {
  try {
    const value: unknown = name ? JSON.parse(globalThis.sessionStorage?.getItem(name) ?? "{}") : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value).flatMap(([id, item]): [string, Entry][] => Array.isArray(item) && typeof item[0] === "string" && /^[a-f0-9]{64}$/.test(item[0])
      && typeof item[1] === "number" && now - item[1] < KEEP_MS && (keepRequests ? item.length === 3 : /^[a-f0-9]{16}$/.test(id))
      ? [[id, { key: item[0], held: true, at: item[1], ...(keepRequests ? { request: item[2] } : {}) }]] : []);
  } catch { return []; }
}
export type Settled = "ack" | "unconfirmed" | "refused";

/**
 * Keys by intent. An intent is the exact action on the exact version, so a different edit text or reason is a different intent.
 * With `persistAs` (a name that carries the operator and account), every pending key is mirrored to this tab's sessionStorage
 * under the intent's hash, so a reload by the same operator keeps it. Entries expire after a day, in memory and storage alike.
 * There is no count cap: every entry is either an attempt in flight or a held key (its attempt was unconfirmed), and dropping
 * either would let a retry act twice. Age alone bounds the store, checked before every read.
 * With `keepRequests` (G04c2, fan-visible writes) an entry is named by the full intent, not its hash, and also keeps the exact
 * request, so after a reload `pending()` gives back what to retry. Both are written to storage verbatim.
 */
export function createCommandKeyStore(random: () => string = newCommandKey, persistAs?: string, now: () => number = Date.now, keepRequests = false) {
  // A key read back from an earlier page load had an unknown outcome there, so it is held.
  const keys = new Map(storedKeys(persistAs, now(), keepRequests));
  const id = (intent: string) => keepRequests ? intent : intentHash(intent);
  const live = () => { const t = now(); for (const [name, entry] of keys) if (t - entry.at >= KEEP_MS) keys.delete(name); return keys; };
  const save = () => {
    if (persistAs) try {
      if (live().size) globalThis.sessionStorage.setItem(persistAs, JSON.stringify(Object.fromEntries([...keys].map(([name, entry]) =>
        [name, keepRequests ? [entry.key, entry.at, entry.request ?? null] : [entry.key, entry.at]]))));
      else globalThis.sessionStorage.removeItem(persistAs);
    } catch { /* No storage: the in-memory key still covers this page load. */ }
  };
  return {
    /** `request` is kept with the key (a `keepRequests` store persists it) until the outcome releases both. */
    keyFor(intent: string, request?: unknown): string {
      let entry = live().get(id(intent));
      if (!entry) { keys.set(id(intent), entry = { key: random(), held: false, at: now(), request }); save(); }
      return entry.key;
    },
    /**
     * A recorded ack releases the key. Unconfirmed keeps it so a retry is idempotent. A refusal or conflict releases it only if no
     * earlier attempt was unconfirmed: that attempt may have committed, and a fresh key on the next retry could act twice.
     */
    settle(intent: string, outcome: Settled) {
      const name = id(intent), entry = live().get(name);
      if (outcome === "ack") keys.delete(name);
      else if (outcome === "unconfirmed") { if (entry) entry.held = true; }
      else if (!entry?.held) keys.delete(name);
      save();
    },
    /** Whether an earlier attempt of this intent was unconfirmed, so only a recorded ack releases it. */
    isHeld: (intent: string) => live().get(id(intent))?.held === true,
    /** The request of every entry not yet released: held, or in flight (unknown to a remount or a reload). */
    pending: () => [...live().values()].map(entry => entry.request),
    size: () => live().size,
  };
}

/**
 * One key store per operator and account, so a remounted console (navigation, a new client) still holds the key of an unconfirmed
 * attempt. It is also persisted in sessionStorage under the operator scope (lib/onlyfans/plan-c-route.ts planCKeyScope), so a
 * reload in the same tab by the same operator does too; another operator signing in on that tab never sees it.
 */
const accountStores = new Map<string, ReturnType<typeof createCommandKeyStore>>();
function sharedStore(name: string, persist: boolean, keepRequests: boolean) {
  let store = accountStores.get(name);
  if (!store) accountStores.set(name, store = createCommandKeyStore(newCommandKey, persist ? name : undefined, Date.now, keepRequests));
  return store;
}
const accountKeyStore = (accountId: string, operatorScope: string) => sharedStore(`plan-c-keys:${operatorScope}:${accountId}`, true, false);
/**
 * The same store for a write whose double could reach a fan (G04c2: a manual send, a campaign write), one per kind, operator scope and
 * account, keeping each pending request with its key. Persisted only with an operator scope; without one it covers a remount, not a reload.
 */
export const heldKeyStore = (kind: "of-send-keys" | "of-campaign-keys", accountId: string, operatorScope?: string) =>
  sharedStore(`${kind}:${operatorScope ?? ""}:${accountId}`, !!operatorScope, true);

const base = (accountId: string) => `/api/onlyfans-controls/accounts/${encodeURIComponent(accountId)}/plan-c`;
const unconfirmed = (): PlanCCommandResult => ({ ok: false, outcome: "unconfirmed", reload: true, error: PLAN_C_UNCONFIRMED_TEXT });
const invalid = (error: string): PlanCCommandResult => ({ ok: false, outcome: "refused", reload: false, error });

/** Either the operator scope (the shared, persisted store) or an injected store; never neither. */
export function createPlanCClient(options: { accountId: string; fetchImpl?: typeof fetch }
  & ({ operatorScope: string; keys?: undefined } | { keys: ReturnType<typeof createCommandKeyStore>; operatorScope?: undefined })) {
  const { accountId } = options, fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const keys = options.keys ?? accountKeyStore(accountId, options.operatorScope);
  const init = { credentials: "same-origin", cache: "no-store", redirect: "error" } as const;

  /** One GET: whether it was 2xx and its body (a refusal's is undefined when unreadable). null: no readable answer. */
  async function get(path: string): Promise<{ ok: boolean; value: unknown } | null> {
    try {
      const response = await fetchImpl(base(accountId) + path, { ...init, method: "GET", signal: AbortSignal.timeout(8000) });
      return { ok: response.ok, value: response.ok ? await response.json() : await response.json().catch(() => undefined) };
    } catch { return null; }
  }
  function outcome<T>(answer: { ok: boolean; value: unknown } | null, parse: (value: unknown) => T | null, what: string): PlanCReadOutcome<T> {
    const data = answer?.ok ? parse(answer.value) : null;
    return data ? { ok: true, data } : { ok: false, error: answer?.ok ? `${what} could not be read.` : `${what} is unavailable.` };
  }

  /** `intent` ties the key to this exact action; the key store decides when the outcome releases it. */
  async function send(path: string, intent: string, body: (commandKey: string) => Record<string, unknown>): Promise<PlanCCommandResult> {
    const commandKey = keys.keyFor(intent);
    let result: PlanCCommandResult = unconfirmed();
    try {
      const response = await fetchImpl(base(accountId) + path, { ...init, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(commandKey)), signal: AbortSignal.timeout(10_000) });
      const data: unknown = await response.json();
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        // Success needs a 2xx AND a recorded body; a recorded body on any other status contradicts itself and stays unconfirmed.
        if (response.ok && record.schemaVersion === PLAN_C_SCHEMA && record.ok === true && record.outcome === "recorded")
          result = { ok: true, replayed: record.replayed === true, recordedVersion: typeof record.recordedVersion === "number" ? record.recordedVersion : null,
            recordedRevision: typeof record.recordedRevision === "number" ? record.recordedRevision : null };
        else if (record.schemaVersion === PLAN_C_SCHEMA && record.ok === false && (record.outcome === "refused" || record.outcome === "conflict" || record.outcome === "unconfirmed") && typeof record.error === "string")
          result = { ok: false, outcome: record.outcome, error: record.outcome === "conflict" ? PLAN_C_CONFLICT_TEXT : record.error, reload: record.reload === true || record.outcome === "conflict" };
      }
    } catch { /* A lost reply does not prove the command failed. */ }
    keys.settle(intent, result.ok ? "ack" : result.outcome === "unconfirmed" ? "unconfirmed" : "refused");
    return result;
  }

  const draftPath = (draft: PlanCDraft, action: string) => `/drafts/${encodeURIComponent(draft.requestId)}/${draft.generation}/${action}`;
  const draftIntent = (draft: PlanCDraft, action: string, extra = "") => `draft:${action}:${draft.requestId}:${draft.generation}:v${draft.draftVersion}${extra}`;
  const conversationPath = (conversationId: string, action: PlanCConversationAction) => `/conversations/${encodeURIComponent(conversationId)}/${action}`;

  return {
    listDrafts: async (): Promise<PlanCDraftsOutcome> => {
      const answer = await get("/drafts"), result = outcome(answer, value => parsePlanCDrafts(value, accountId), "Drafts awaiting approval");
      return result.ok ? result : { ...result, stopTargets: planCStopTargets(answer?.value, accountId) };
    },
    listUnresolved: async (): Promise<PlanCReadOutcome<PlanCUnresolvedList>> => outcome(await get("/unresolved"), value => parsePlanCUnresolved(value, accountId), "Unresolved work"),
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
      return send(`/unresolved/${encodeURIComponent(item.id)}/reconcile`, JSON.stringify(["reconcile", item.id, evidence.trim()]), commandKey => ({ commandKey, evidence: evidence.trim() }));
    },
  };
}
export type PlanCClient = ReturnType<typeof createPlanCClient>;
