/**
 * An in-memory, typed stand-in for the Plan C backend (PLAN-C/OPERATOR-API-CONTRACT.md). It is a `fetch` replacement:
 * no socket, no real service. It enforces what the contract says the real service enforces (bearer token, schema header,
 * 8 KB JSON, exact keys, expectedVersion / expectedRevision conflicts, idempotent commandKey, edit invalidates approval,
 * handback never creates or replays a draft) so that client tests fail if the dashboard drifts from the contract.
 */
export const MOCK_TOKEN = "mock-control-token-not-a-secret";
export const MOCK_ACCOUNT = "of-plan-c-a";
export const MOCK_SCHEMA = "of-engine-operator.v2";
const HEADER = "X-OnlyFans-Engine-Operator-Version";

export type RawPart = { part_index: number; action: "reply" | "offer"; body: string; price_cents: number | null; currency: string | null; media_ids: string[]; preview_ids: string[]; catalog_item_id: string | null };
export type RawDraft = { requestId: string; generation: number; draftVersion: number; draftHash: string; status: "awaiting" | "approved" | "rejected" | "invalidated";
  action: "reply" | "offer"; fanId: string; expiresAt: string; parts: RawPart[]; conversation: { revision: number; messages: Array<{ direction: string; text: string; at: string }> };
  evidence: string | null; approvedBy: string | null; approvedAt: string | null; rejectReason?: string };
export type RawUnresolved = { id: string; kind: string; owner: string; nextStep: string; summary: string; conversationId: string | null; revision: number | null; createdAt: string };
export type Call = { method: string; path: string; headers: Headers; body: Record<string, unknown> | null; status: number };

let counter = 0;
const hex = (n: number) => (n.toString(16) + "0".repeat(64)).slice(0, 64);
export const requestUuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export function seedDraft(overrides: Partial<RawDraft> & { fanId?: string } = {}): RawDraft {
  const n = ++counter, fanId = overrides.fanId ?? "900000000001";
  return { requestId: requestUuid(n), generation: 1, draftVersion: 1, draftHash: hex(0xabc000 + n), status: "awaiting", action: "reply", fanId,
    expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(),
    parts: [{ part_index: 0, action: "reply", body: "Hey you, I got your message.", price_cents: null, currency: null, media_ids: [], preview_ids: [], catalog_item_id: null },
            { part_index: 1, action: "reply", body: "What are you after tonight?", price_cents: null, currency: null, media_ids: [], preview_ids: [], catalog_item_id: null }],
    conversation: { revision: 7, messages: [{ direction: "fan", text: "hi are you there", at: new Date(Date.now() - 120_000).toISOString() }, { direction: "creator", text: "yes!", at: new Date(Date.now() - 60_000).toISOString() }] },
    evidence: null, approvedBy: null, approvedAt: null, ...overrides };
}
export function seedOffer(overrides: Partial<RawDraft> = {}): RawDraft {
  return seedDraft({ action: "offer", parts: [
    { part_index: 0, action: "reply", body: "Got something for you.", price_cents: null, currency: null, media_ids: [], preview_ids: [], catalog_item_id: null },
    { part_index: 1, action: "offer", body: "Plan C test set, 3 items", price_cents: 600, currency: "USD", media_ids: ["m1", "m2", "m3"], preview_ids: ["p1"], catalog_item_id: "set-1" }], ...overrides });
}

export type MockOptions = { token?: string; drafts?: RawDraft[]; unresolved?: RawUnresolved[]; conversations?: Record<string, { revision: number; owner: string }> };
export function createPlanCMock(options: MockOptions = {}) {
  const token = options.token ?? MOCK_TOKEN;
  const state = { drafts: options.drafts ?? [] as RawDraft[], unresolved: options.unresolved ?? [] as RawUnresolved[],
    conversations: options.conversations ?? {} as Record<string, { revision: number; owner: string }>,
    applied: new Map<string, { fingerprint: string; ack: Record<string, unknown> }>(), calls: [] as Call[], commits: [] as Array<{ action: string; actor: string; target: string }> };
  /** Test hooks. `dropReplyAfterCommit` applies the command and then breaks the connection, the case the dashboard must call unconfirmed. */
  const faults = { status: null as number | null, dropReplyAfterCommit: false, dropBeforeCommit: false, garbageAck: false };
  const conversation = (id: string, fallback = 7) => (state.conversations[id] ??= { revision: fallback, owner: "engine" });
  const find = (requestId: string, generation: number) => state.drafts.find(d => d.requestId === requestId && d.generation === generation);
  const live = (d: RawDraft) => d.status === "awaiting" || d.status === "approved";

  const respond = (call: Call, status: number, body: unknown, headers: Record<string, string> = {}) => { call.status = status;
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }); };
  const strictKeys = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));
  const hexKey = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

  const mock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input)), method = init?.method ?? "GET", headers = new Headers(init?.headers);
    const call: Call = { method, path: decodeURIComponent(url.pathname), headers, body: null, status: 0 };
    state.calls.push(call);
    if (init?.redirect !== "error" || init.credentials !== "omit") throw new Error("the dashboard must call the backend with redirect: error and credentials: omit");
    if (faults.dropBeforeCommit && method === "POST") { faults.dropBeforeCommit = false; throw new TypeError("connection refused before the request was processed"); }
    if (faults.status !== null) return respond(call, faults.status, { ok: false });
    const auth = headers.get("authorization")?.split(" ");
    if (auth?.[0] !== "Bearer" || auth[1] !== token) return respond(call, 401, { schemaVersion: MOCK_SCHEMA, ok: false, code: "unauthorized" });
    if (headers.get(HEADER) !== MOCK_SCHEMA) return respond(call, 400, { schemaVersion: MOCK_SCHEMA, ok: false, code: "unsupported_schema" });
    const match = /^\/onlyfans\/control\/v2\/accounts\/([^/]+)\/(.*)$/.exec(call.path);
    if (!match || match[1] !== MOCK_ACCOUNT) return respond(call, 404, { ok: false });
    const rest = match[2];
    if (method === "GET") {
      if (rest === "drafts") return respond(call, 200, { schemaVersion: MOCK_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, drafts: state.drafts.filter(live) });
      if (rest === "unresolved") return respond(call, 200, { schemaVersion: MOCK_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, items: state.unresolved });
      return respond(call, 404, { ok: false });
    }
    if (method !== "POST") return respond(call, 405, { ok: false });
    if (headers.get("content-type")?.split(";")[0] !== "application/json") return respond(call, 400, { ok: false });
    const raw = String(init?.body ?? "");
    if (new TextEncoder().encode(raw).length > 8192) return respond(call, 413, { ok: false });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return respond(call, 400, { ok: false }); }
    call.body = body;
    if (typeof body.actor !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(body.actor) || !hexKey(body.commandKey)) return respond(call, 400, { ok: false });
    const fingerprint = JSON.stringify([call.path, { ...body, commandKey: undefined }]);
    const seen = state.applied.get(body.commandKey as string);
    const finish = (ack: Record<string, unknown>) => {
      state.applied.set(body.commandKey as string, { fingerprint, ack });
      if (faults.dropReplyAfterCommit) { faults.dropReplyAfterCommit = false; throw new TypeError("connection reset after commit"); }
      return respond(call, 200, faults.garbageAck ? { ok: true } : { schemaVersion: MOCK_SCHEMA, ...ack });
    };
    if (seen) return seen.fingerprint === fingerprint ? respond(call, 200, { schemaVersion: MOCK_SCHEMA, ...seen.ack, replayed: true }) : respond(call, 409, { ok: false, code: "command_key_reuse" });

    let m = /^drafts\/([^/]+)\/(\d+)\/(approve|reject|edit)$/.exec(rest);
    if (m) {
      const draft = find(m[1], Number(m[2])), action = m[3];
      if (!draft || !live(draft)) return respond(call, 404, { ok: false });
      const keys = action === "approve" ? ["expectedVersion", "commandKey", "actor"] : action === "reject" ? ["expectedVersion", "commandKey", "actor", "reason"] : ["expectedVersion", "commandKey", "actor", "parts"];
      if (!strictKeys(body, keys) || !Number.isInteger(body.expectedVersion)) return respond(call, 400, { ok: false });
      if (body.expectedVersion !== draft.draftVersion) return respond(call, 409, { ok: false, code: "version_conflict" });
      if (new Date(draft.expiresAt).getTime() <= Date.now()) return respond(call, 409, { ok: false, code: "expired" });
      if (action === "approve") { draft.status = "approved"; draft.approvedBy = body.actor as string; draft.approvedAt = new Date().toISOString(); }
      else if (action === "reject") { if (typeof body.reason !== "string" || !body.reason.trim()) return respond(call, 400, { ok: false }); draft.status = "rejected"; draft.rejectReason = body.reason; }
      else {
        const parts = body.parts;
        if (!Array.isArray(parts) || parts.length !== draft.parts.length || parts.some(p => typeof p !== "string" || !p.trim())) return respond(call, 400, { ok: false });
        // An edit never rewrites an approved version: it retires this one and inserts version + 1, awaiting approval again.
        draft.status = "invalidated";
        state.drafts.push({ ...draft, draftVersion: draft.draftVersion + 1, draftHash: hex(0xed17 + draft.draftVersion), status: "awaiting", approvedBy: null, approvedAt: null,
          parts: draft.parts.map((p, i) => ({ ...p, body: parts[i] as string })) });
      }
      state.commits.push({ action, actor: body.actor as string, target: draft.requestId });
      return finish({ ok: true, accountId: MOCK_ACCOUNT, requestId: draft.requestId, action, commandKey: body.commandKey, recordedVersion: draft.draftVersion + (action === "edit" ? 1 : 0), replayed: false });
    }
    m = /^conversations\/([^/]+)\/(stop|takeover|handback)$/.exec(rest);
    if (m) {
      const id = m[1], action = m[2];
      if (!id.startsWith(`${MOCK_ACCOUNT}:`)) return respond(call, 404, { ok: false });
      if (!strictKeys(body, ["commandKey", "actor", "expectedRevision"]) || !Number.isInteger(body.expectedRevision)) return respond(call, 400, { ok: false });
      const conv = conversation(id, state.drafts.find(d => `${MOCK_ACCOUNT}:${d.fanId}` === id)?.conversation.revision);
      if (body.expectedRevision !== conv.revision) return respond(call, 409, { ok: false, code: "revision_conflict" });
      conv.revision += 1;
      if (action === "stop") conv.owner = "stopped";
      if (action === "takeover") { conv.owner = "human"; for (const d of state.drafts) if (`${MOCK_ACCOUNT}:${d.fanId}` === id && live(d)) d.status = "invalidated"; }
      // A hand back only makes the conversation eligible for a NEW plan. It never touches or recreates a draft.
      if (action === "handback") conv.owner = "engine";
      state.commits.push({ action, actor: body.actor as string, target: id });
      return finish({ ok: true, accountId: MOCK_ACCOUNT, conversationId: id, action, commandKey: body.commandKey, recordedRevision: conv.revision, replayed: false });
    }
    m = /^unresolved\/([^/]+)\/reconcile$/.exec(rest);
    if (m) {
      const item = state.unresolved.find(u => u.id === m![1]);
      if (!item) return respond(call, 404, { ok: false });
      if (!strictKeys(body, ["commandKey", "actor", "evidenceRef"]) || typeof body.evidenceRef !== "string" || !body.evidenceRef.startsWith("operator:") || body.evidenceRef.length < 12) return respond(call, 400, { ok: false });
      if (!["unknown_send", "unlinked_transaction", "unreconciled_access"].includes(item.kind)) return respond(call, 409, { ok: false });
      const retained = item.kind === "unknown_send" || (item.kind === "unreconciled_access" && item.nextStep === "review_unlinked_financial_evidence");
      if (retained) {
        state.unresolved = state.unresolved.map(u => u.id === item.id
          ? { ...u, nextStep: item.kind === "unknown_send" ? "awaiting_provider_proof" : u.nextStep,
              summary: `${u.summary} Evidence was recorded; the issue remains.` } : u);
      } else state.unresolved = state.unresolved.filter(u => u.id !== item.id);
      state.commits.push({ action: "reconcile", actor: body.actor as string, target: item.id });
      return finish({ ok: true, accountId: MOCK_ACCOUNT, id: item.id, action: "reconcile", commandKey: body.commandKey,
        outcome: item.kind === "unknown_send" ? "evidence_recorded_hold_retained" : retained ? "evidence_recorded_finance_unlinked" : "dismissed",
        resolved: !retained, replayed: false });
    }
    return respond(call, 404, { ok: false });
  };
  return { fetch: mock as typeof fetch, state, faults, posts: () => state.calls.filter(c => c.method === "POST") };
}
export type PlanCMock = ReturnType<typeof createPlanCMock>;
