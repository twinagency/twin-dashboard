/** Plan C operator surface: contract tests for the client, the proxy handlers and the files that must stay out of the browser. Offline; the backend is a typed mock. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { createCommandKeyStore, createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { PLAN_C_HEADER, PLAN_C_SCHEMA, newCommandKey, parsePlanCDrafts, parsePlanCDraft, parsePlanCUnresolved, planCEvidenceRef, validateEditedParts, type PlanCDraft } from "../../lib/onlyfans/plan-c";
import { planCConversationCommand, planCDraftCommand, planCOperatorOnly, planCReconcile } from "../../lib/onlyfans/plan-c-route";
import { agencyOnlyFansRequest } from "../../lib/onlyfans/agency-scope";
import { engineOperatorEvidenceRef } from "../../lib/onlyfans/engine-operator";
import { MOCK_ACCOUNT, MOCK_TOKEN, createPlanCMock, seedDraft, seedOffer, type RawUnresolved } from "./plan-c-mock-backend";
import { OPERATOR_ACTOR, createPlanCProxy } from "./plan-c-proxy";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const HEX64 = /^[0-9a-f]{64}$/;
const unresolvedRow = (overrides: Partial<RawUnresolved> = {}): RawUnresolved => ({ id: "unk-1", kind: "unknown_send", owner: "engine", nextStep: "reconcile_with_provider",
  summary: "A send left the worker and no provider answer was recorded.", conversationId: `${MOCK_ACCOUNT}:900000000001`, revision: 7, createdAt: new Date().toISOString(), ...overrides });
function setup(options: Parameters<typeof createPlanCMock>[0] = {}) {
  const mock = createPlanCMock(options), proxy = createPlanCProxy(mock);
  const client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: proxy.fetch });
  return { mock, proxy, client };
}
async function firstDraft(client: ReturnType<typeof createPlanCClient>): Promise<PlanCDraft> {
  const list = await client.listDrafts(); assert.ok(list.ok); return list.data.drafts[0];
}

// ── idempotency keys ──────────────────────────────────────────────────────────
test("command keys are random 64-hex values, one per intent, and stay stable until the outcome is known", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) { const key = newCommandKey(); assert.match(key, HEX64); seen.add(key); }
  assert.equal(seen.size, 500);
  const keys = createCommandKeyStore();
  const a = keys.keyFor("approve:x:v1"); assert.match(a, HEX64);
  assert.equal(keys.keyFor("approve:x:v1"), a, "the same intent reuses its key");
  assert.notEqual(keys.keyFor("approve:x:v2"), a, "a different version is a different intent");
  keys.forget("approve:x:v1"); assert.notEqual(keys.keyFor("approve:x:v1"), a);
  assert.throws(() => newCommandKey(() => { throw new Error("no entropy"); }), /no entropy/, "never falls back to a guessable key");
});

test("every command sent by the client carries a 64-hex key and the exact version the operator saw", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()], unresolved: [unresolvedRow()], conversations: { [`${MOCK_ACCOUNT}:900000000001`]: { revision: 7, owner: "engine" } } });
  const draft = await firstDraft(client);
  assert.ok((await client.approveDraft(draft)).ok);
  assert.ok((await client.conversationCommand(`${MOCK_ACCOUNT}:900000000001`, "stop", 7)).ok);
  const list = await client.listUnresolved(); assert.ok(list.ok);
  assert.ok((await client.reconcile(list.data.items[0], "provider message 12345 shows no delivery")).ok);
  const posts = mock.posts(); assert.equal(posts.length, 3);
  for (const post of posts) { assert.match(String(post.body?.commandKey), HEX64); assert.equal(post.body?.actor, OPERATOR_ACTOR); }
  assert.equal(posts[0].body?.expectedVersion, draft.draftVersion);
  assert.equal(new Set(posts.map(p => p.body?.commandKey)).size, 3);
});

test("a lost reply is unconfirmed, and retrying reuses the same key so the backend applies the command once", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  const draft = await firstDraft(client);
  mock.faults.dropReplyAfterCommit = true;
  const first = await client.approveDraft(draft);
  assert.equal(first.ok, false); if (!first.ok) { assert.equal(first.outcome, "unconfirmed"); assert.equal(first.reload, true); }
  const again = await client.approveDraft(draft);
  assert.ok(again.ok); if (again.ok) assert.equal(again.replayed, true);
  const keys = mock.posts().map(p => p.body?.commandKey); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  assert.equal(mock.state.commits.filter(c => c.action === "approve").length, 1, "approved once");
  // After a definite answer the next click is a new intent with a new key.
  await client.approveDraft(draft);
  assert.notEqual(mock.posts().at(-1)?.body?.commandKey, keys[0]);
});

test("a 503 after an operator command is unconfirmed, not a proven refusal", async () => {
  const backend = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN,
    fetchImpl: async () => new Response(null, { status: 503 }) });
  const result = await backend.conversation(MOCK_ACCOUNT, {
    conversationId: `${MOCK_ACCOUNT}:1`, action: "stop", expectedRevision: 1,
    commandKey: newCommandKey(), actor: OPERATOR_ACTOR,
  });
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.outcome, "unconfirmed"); assert.equal(result.reload, true); }
});

test("a garbled acknowledgement is unconfirmed, never success", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  mock.faults.garbageAck = true;
  const result = await client.approveDraft(await firstDraft(client));
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

// ── 409 handling ──────────────────────────────────────────────────────────────
test("409 on a stale draft version is a conflict that asks for a reload, changes nothing, and is not retried", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  const shown = await firstDraft(client);
  mock.state.drafts[0].draftVersion = 2; // the backend moved on while the operator was reading
  const result = await client.approveDraft(shown);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.outcome, "conflict"); assert.equal(result.reload, true); assert.match(result.error, /changed/); }
  assert.equal(mock.state.drafts[0].status, "awaiting", "a stale approval approves nothing");
  assert.equal(mock.state.commits.length, 0);
  assert.equal(mock.posts().length, 1, "one attempt, no automatic retry");
  const fresh = await firstDraft(client); assert.equal(fresh.draftVersion, 2, "re-reading shows the current draft");
});

test("409 on a stale conversation revision is a conflict too", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  const result = await client.conversationCommand(`${MOCK_ACCOUNT}:900000000001`, "takeover", 3);
  assert.equal(result.ok, false); if (!result.ok) { assert.equal(result.outcome, "conflict"); assert.equal(result.reload, true); }
  assert.equal(mock.state.commits.length, 0);
});

test("404 and 410 mean the draft is gone: refused, with a reload", async () => {
  for (const status of [404, 410]) {
    const mock = createPlanCMock({ drafts: [seedDraft()] });
    const backend = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN, fetchImpl: async () => new Response(null, { status }) });
    const result = await backend.conversation(MOCK_ACCOUNT, { conversationId: `${MOCK_ACCOUNT}:1`, action: "stop", expectedRevision: 1, commandKey: newCommandKey(), actor: OPERATOR_ACTOR });
    assert.equal(result.ok, false); if (!result.ok) { assert.equal(result.outcome, "refused"); assert.equal(result.reload, true); }
    void mock;
  }
});

// ── the backend transport ────────────────────────────────────────────────────
test("the backend client sends the contract paths, bearer token, schema header and exactly the contract fields", async () => {
  const { mock, proxy, client } = setup({ drafts: [seedDraft(), seedOffer({ fanId: "900000000002" })], unresolved: [unresolvedRow()] });
  const list = await client.listDrafts(); assert.ok(list.ok);
  const [reply, offer] = list.data.drafts;
  await client.listUnresolved();
  await client.editDraft(reply, ["Hey you, got your message.", "Anything specific tonight?"]);
  await client.rejectDraft(offer, "price wording is wrong");
  await client.conversationCommand(`${MOCK_ACCOUNT}:900000000002`, "takeover", 7);
  await client.reconcile((await client.listUnresolved() as { ok: true; data: { items: Parameters<typeof client.reconcile>[0][] } }).data.items[0], "provider message 12345 shows no delivery");
  const paths = mock.state.calls.map(c => `${c.method} ${c.path.replace("/onlyfans/control/v2/accounts/" + MOCK_ACCOUNT + "/", "")}`);
  assert.deepEqual(paths.slice(0, 2), ["GET drafts", "GET unresolved"]);
  assert.ok(paths.includes(`POST drafts/${reply.requestId}/1/edit`));
  assert.ok(paths.includes(`POST drafts/${offer.requestId}/1/reject`));
  assert.ok(paths.includes(`POST conversations/${MOCK_ACCOUNT}:900000000002/takeover`));
  assert.ok(paths.includes("POST unresolved/unk-1/reconcile"));
  for (const call of mock.state.calls) {
    assert.equal(call.headers.get("authorization"), `Bearer ${MOCK_TOKEN}`);
    assert.equal(call.headers.get(PLAN_C_HEADER), PLAN_C_SCHEMA);
  }
  const edit = mock.posts().find(c => c.path.endsWith("/edit"))!; assert.deepEqual(Object.keys(edit.body!).sort(), ["actor", "commandKey", "expectedVersion", "parts"]);
  const reject = mock.posts().find(c => c.path.endsWith("/reject"))!; assert.deepEqual(Object.keys(reject.body!).sort(), ["actor", "commandKey", "expectedVersion", "reason"]);
  const takeover = mock.posts().find(c => c.path.endsWith("/takeover"))!; assert.deepEqual(Object.keys(takeover.body!).sort(), ["actor", "commandKey", "expectedRevision"]);
  const reconcile = mock.posts().find(c => c.path.endsWith("/reconcile"))!; assert.deepEqual(Object.keys(reconcile.body!).sort(), ["actor", "commandKey", "evidenceRef"]);
  assert.equal(reconcile.body?.evidenceRef, "operator:fansapi:provider message 12345 shows no delivery");
  assert.equal(proxy.posts().length, 4);
});

test("the browser never supplies the actor and the proxy refuses a body that tries", async () => {
  const { mock, proxy } = setup({ drafts: [seedDraft()] });
  const draft = mock.state.drafts[0], key = newCommandKey();
  const refused = await planCDraftCommand(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, requestId: draft.requestId, generation: "1", action: "approve",
    body: { expectedVersion: 1, commandKey: key, actor: "op-session:" + "d".repeat(64) } });
  assert.equal(refused.status, 400); assert.equal(mock.state.calls.length, 0, "nothing reached the backend");
  const ok = await planCDraftCommand(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, requestId: draft.requestId, generation: "1", action: "approve", body: { expectedVersion: 1, commandKey: key } });
  assert.equal(ok.status, 200); assert.equal(mock.posts()[0].body?.actor, OPERATOR_ACTOR, "the actor is the logged-in operator");
});

test("the proxy refuses malformed commands before the backend sees them", async () => {
  const { mock, proxy } = setup({ drafts: [seedDraft()] });
  const draft = mock.state.drafts[0], key = newCommandKey(), base = { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, requestId: draft.requestId, generation: "1" };
  const cases: Array<[string, Promise<{ status: number }>]> = [
    ["no commandKey", planCDraftCommand(proxy.backend, { ...base, action: "approve", body: { expectedVersion: 1 } })],
    ["short commandKey", planCDraftCommand(proxy.backend, { ...base, action: "approve", body: { expectedVersion: 1, commandKey: "abc" } })],
    ["uppercase commandKey", planCDraftCommand(proxy.backend, { ...base, action: "approve", body: { expectedVersion: 1, commandKey: key.toUpperCase() } })],
    ["no expectedVersion", planCDraftCommand(proxy.backend, { ...base, action: "approve", body: { commandKey: key } })],
    ["version zero", planCDraftCommand(proxy.backend, { ...base, action: "approve", body: { expectedVersion: 0, commandKey: key } })],
    ["extra field", planCDraftCommand(proxy.backend, { ...base, action: "approve", body: { expectedVersion: 1, commandKey: key, force: true } })],
    ["unknown action", planCDraftCommand(proxy.backend, { ...base, action: "approve-all", body: { expectedVersion: 1, commandKey: key } })],
    ["bad request id", planCDraftCommand(proxy.backend, { ...base, requestId: "../x", action: "approve", body: { expectedVersion: 1, commandKey: key } })],
    ["bad generation", planCDraftCommand(proxy.backend, { ...base, generation: "1/../2", action: "approve", body: { expectedVersion: 1, commandKey: key } })],
    ["reject without reason", planCDraftCommand(proxy.backend, { ...base, action: "reject", body: { expectedVersion: 1, commandKey: key } })],
    ["reject blank reason", planCDraftCommand(proxy.backend, { ...base, action: "reject", body: { expectedVersion: 1, commandKey: key, reason: "   " } })],
    ["edit with em dash", planCDraftCommand(proxy.backend, { ...base, action: "edit", body: { expectedVersion: 1, commandKey: key, parts: ["hey — you", "ok"] } })],
    ["edit with empty part", planCDraftCommand(proxy.backend, { ...base, action: "edit", body: { expectedVersion: 1, commandKey: key, parts: ["hey", " "] } })],
    ["edit not an array", planCDraftCommand(proxy.backend, { ...base, action: "edit", body: { expectedVersion: 1, commandKey: key, parts: "hey" } })],
    ["conversation of another account", planCConversationCommand(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, conversationId: "other:1", action: "stop", body: { expectedRevision: 1, commandKey: key } })],
    ["conversation action", planCConversationCommand(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, conversationId: `${MOCK_ACCOUNT}:1`, action: "handback-all", body: { expectedRevision: 1, commandKey: key } })],
    ["conversation without revision", planCConversationCommand(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, conversationId: `${MOCK_ACCOUNT}:1`, action: "handback", body: { commandKey: key } })],
    ["reconcile without evidence", planCReconcile(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, id: "unk-1", body: { commandKey: key } })],
    ["reconcile blank evidence", planCReconcile(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, id: "unk-1", body: { commandKey: key, evidence: "      " } })],
    ["reconcile brought its own evidenceRef", planCReconcile(proxy.backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, id: "unk-1", body: { commandKey: key, evidence: "provider message 1", evidenceRef: "x" } })],
  ];
  for (const [name, promise] of cases) assert.equal((await promise).status, 400, name);
  assert.equal(mock.state.calls.length, 0, "no refused command reached the backend");
});

test("a reject needs a reason and an unchanged edit is not an edit", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  const draft = await firstDraft(client);
  const noReason = await client.rejectDraft(draft, "  "); assert.equal(noReason.ok, false);
  const unchanged = await client.editDraft(draft, draft.parts.map(p => p.text)); assert.equal(unchanged.ok, false);
  const dash = await client.editDraft(draft, ["fine – not fine", "ok"]); assert.equal(dash.ok, false);
  const wrongCount = await client.editDraft(draft, ["only one"]); assert.equal(wrongCount.ok, false);
  const noEvidence = await client.reconcile({ id: "unk-1", kind: "unknown_send", owner: "engine", nextStep: "x", summary: null, conversationId: null, conversationRevision: null, createdAt: null }, "abc");
  assert.equal(noEvidence.ok, false);
  assert.equal(mock.state.calls.filter(c => c.method === "POST").length, 0, "validation happens before any request");
  assert.equal(validateEditedParts(draft, ["a", "b"]), null);
});

test("an edit retires the approved version and returns a new awaiting version: prior approval cannot carry over", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  const v1 = await firstDraft(client);
  assert.ok((await client.approveDraft(v1)).ok);
  const approved = await firstDraft(client); assert.equal(approved.status, "approved"); assert.equal(approved.approvedBy, OPERATOR_ACTOR);
  assert.ok((await client.editDraft(approved, ["Changed text one", "Changed text two"])).ok);
  const list = await client.listDrafts(); assert.ok(list.ok);
  assert.equal(list.data.drafts.length, 1);
  assert.equal(list.data.drafts[0].draftVersion, 2); assert.equal(list.data.drafts[0].status, "awaiting"); assert.equal(list.data.drafts[0].approvedBy, null);
  assert.deepEqual(list.data.drafts[0].parts.map(p => p.text), ["Changed text one", "Changed text two"]);
  // The old version can no longer be approved: its version is stale.
  const stale = await client.approveDraft(v1); assert.equal(stale.ok, false);
  assert.equal(mock.state.commits.filter(c => c.action === "approve").length, 1);
});

test("a hand back goes to the backend only on an explicit command and never creates or revives a draft", async () => {
  const { mock, client } = setup({ drafts: [seedDraft()] });
  const id = `${MOCK_ACCOUNT}:900000000001`;
  const taken = await client.conversationCommand(id, "takeover", 7); assert.ok(taken.ok);
  assert.equal(mock.state.drafts[0].status, "invalidated");
  assert.equal(mock.posts().filter(p => String(p.path).endsWith("/handback")).length, 0, "taking over does not hand back");
  if (taken.ok) assert.ok((await client.conversationCommand(id, "handback", taken.recordedRevision!)).ok);
  const list = await client.listDrafts(); assert.ok(list.ok); assert.equal(list.data.drafts.length, 0, "no draft came back with the hand back");
});

// ── parsing ───────────────────────────────────────────────────────────────────
test("drafts keep the exact ordered parts, offer terms, context and expiry; a half-read draft is refused whole", () => {
  const raw = seedOffer(); raw.parts.reverse();
  const list = parsePlanCDrafts({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, drafts: [raw] }, MOCK_ACCOUNT); assert.ok(list);
  const draft = list.drafts[0];
  assert.deepEqual(draft.parts.map(p => [p.index, p.text]), [[0, "Got something for you."], [1, "Plan C test set, 3 items"]], "ordered by part index");
  assert.equal(draft.action, "offer"); assert.equal(draft.draftVersion, 1); assert.equal(draft.expiresAt, raw.expiresAt);
  assert.deepEqual(draft.offer, { productId: "set-1", mediaCount: 3, mediaIds: ["m1", "m2", "m3"], priceCents: 600, currency: "USD" });
  assert.equal(draft.conversationId, `${MOCK_ACCOUNT}:900000000001`); assert.equal(draft.conversationRevision, 7); assert.equal(draft.messages.length, 2);
  const bad = (mutate: (d: Record<string, unknown>) => void) => { const d = JSON.parse(JSON.stringify(seedDraft())); mutate(d); return parsePlanCDrafts({ schemaVersion: PLAN_C_SCHEMA, ok: true, drafts: [seedDraft(), d] }, MOCK_ACCOUNT); };
  assert.equal(bad(d => { d.draftHash = "short"; }), null);
  assert.equal(bad(d => { d.draftVersion = 0; }), null);
  assert.equal(bad(d => { d.parts = []; }), null);
  assert.equal(bad(d => { d.expiresAt = "not a date"; }), null);
  assert.equal(bad(d => { d.requestId = "nope"; }), null);
  assert.equal(bad(d => { d.conversationId = "other-account:9"; }), null, "a draft from another account is refused");
  assert.equal(parsePlanCDrafts({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: "other", drafts: [] }, MOCK_ACCOUNT), null);
  assert.equal(parsePlanCDrafts({ schemaVersion: "of-engine-operator.v1", ok: true, drafts: [] }, MOCK_ACCOUNT), null);
  assert.equal(parsePlanCDraft({ ...raw, requestId: raw.requestId }, MOCK_ACCOUNT)?.requestId, raw.requestId);
  const many = { ...seedDraft(), conversation: { revision: 1, messages: Array.from({ length: 30 }, (_, i) => ({ direction: "fan", text: `m${i}`, at: new Date().toISOString() })) } };
  assert.deepEqual(parsePlanCDraft(many, MOCK_ACCOUNT)?.messages.map(m => m.text), Array.from({ length: 10 }, (_, i) => `m${i + 20}`), "last 10 messages");
});

test("receipt list accepts only bounded provider acceptances and distinguishes unavailable history", () => {
  const receipt = { intentId: "00000000-0000-4000-8000-000000000001", fanId: "101", messageId: "7001",
                    acceptedAt: "2026-11-07T10:00:00Z", action: "reply", projected: true };
  const base = { schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, drafts: [] };
  assert.equal(parsePlanCDrafts(base, MOCK_ACCOUNT)?.receipts, null);
  assert.deepEqual(parsePlanCDrafts({ ...base, receipts: [receipt] }, MOCK_ACCOUNT)?.receipts, [receipt]);
  for (const bad of [{ ...receipt, messageId: "0" }, { ...receipt, fanId: "other" },
                     { ...receipt, action: "purchase" }, { ...receipt, projected: "true" },
                     { ...receipt, acceptedAt: "invalid" }])
    assert.equal(parsePlanCDrafts({ ...base, receipts: [bad] }, MOCK_ACCOUNT), null);
  assert.equal(parsePlanCDrafts({ ...base, receipts: [receipt, receipt] }, MOCK_ACCOUNT), null);
});

test("unresolved items carry owner and next step and are refused when out of scope", () => {
  const ok = parsePlanCUnresolved({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, items: [unresolvedRow()] }, MOCK_ACCOUNT);
  assert.equal(ok?.items[0].owner, "engine"); assert.equal(ok?.items[0].nextStep, "reconcile_with_provider");
  assert.equal(parsePlanCUnresolved({ schemaVersion: PLAN_C_SCHEMA, ok: true, items: [unresolvedRow({ conversationId: "other:1" })] }, MOCK_ACCOUNT), null);
  assert.equal(parsePlanCUnresolved({ schemaVersion: PLAN_C_SCHEMA, ok: true, items: [unresolvedRow({ owner: "" })] }, MOCK_ACCOUNT), null);
  assert.equal(parsePlanCUnresolved({ schemaVersion: PLAN_C_SCHEMA, ok: true, items: [unresolvedRow(), unresolvedRow()] }, MOCK_ACCOUNT), null, "duplicate ids");
});

test("the reconcile evidence string is the same audit string the existing operator control builds", () => {
  assert.equal(planCEvidenceRef("  seen in provider log  "), engineOperatorEvidenceRef("fansapi", "seen in provider log"));
});

test("backend reads fail closed: auth failure, wrong schema, unreadable and unreachable all say unavailable", async () => {
  const wrong = createPlanCBackend({ baseUrl: "http://backend.invalid", token: "wrong", fetchImpl: createPlanCMock().fetch });
  const denied = await wrong.drafts(MOCK_ACCOUNT); assert.equal(denied.ok, false);
  const lost = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN, fetchImpl: async () => { throw new Error("down"); } });
  const down = await lost.drafts(MOCK_ACCOUNT); assert.equal(down.ok, false); if (!down.ok) assert.equal(down.status, 503);
  const junk = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN, fetchImpl: async () => Response.json({ schemaVersion: PLAN_C_SCHEMA, drafts: "x" }) });
  const unreadable = await junk.unresolved(MOCK_ACCOUNT); assert.equal(unreadable.ok, false); if (!unreadable.ok) assert.equal(unreadable.status, 502);
});

// ── who may use it ────────────────────────────────────────────────────────────
test("only the internal operator session may use Plan C: agency, view-as, chat-only and anonymous callers are refused", () => {
  const operator = { auth: { operatorSession: true, agency: false, viewAs: false }, actor: OPERATOR_ACTOR, canManage: true };
  assert.deepEqual(planCOperatorOnly(operator), { ok: true, actor: OPERATOR_ACTOR });
  const refused = (patch: object) => { const r = planCOperatorOnly({ ...operator, ...patch }); assert.equal(r.ok, false); return r; };
  assert.equal((refused({ auth: { ...operator.auth, operatorSession: false } }) as { status: number }).status, 401);
  refused({ auth: { ...operator.auth, agency: true } });
  refused({ auth: { ...operator.auth, agencyGrant: { creatorIds: [], actor: "agency-user:x", canManage: true } } });
  refused({ auth: { ...operator.auth, viewAs: true } });
  refused({ canManage: false });
  refused({ actor: null });
  refused({ actor: "agency-user:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222" });
});

test("agency identities cannot reach the Plan C page or routes even with manage or chat access", () => {
  const api = `/api/onlyfans-controls/accounts/${MOCK_ACCOUNT}/plan-c`;
  for (const [canManage, canChat] of [[true, true], [true, false], [false, true], [false, false]] as const) {
    for (const [method, p] of [["GET", `${api}/drafts`], ["GET", `${api}/unresolved`], ["POST", `${api}/drafts/${"0".repeat(8)}-0000-4000-8000-000000000001/1/approve`],
        ["POST", `${api}/conversations/${MOCK_ACCOUNT}:1/handback`], ["POST", `${api}/unresolved/unk-1/reconcile`], ["GET", "/onlyfans/plan-c"], ["GET", "/onlyfans/plan-c/"]] as const)
      assert.equal(agencyOnlyFansRequest(p, method, false, canManage, canChat), false, `${method} ${p} (${canManage}/${canChat})`);
  }
  // The existing chat route is untouched.
  assert.equal(agencyOnlyFansRequest(`/api/onlyfans-controls/accounts/${MOCK_ACCOUNT}/conversations/${MOCK_ACCOUNT}:1`, "POST", false, false, true), true);
});

// ── no token in the browser, no automatic approval ────────────────────────────
const SERVER_ONLY = ["plan-c-backend", "plan-c-guard", "plan-c-route", "backend-transport", "lib/onlyfans/route", "engine-operator", "command-json"];
function importGraph(entry: string): string[] {
  const seen = new Set<string>(), queue = [entry];
  while (queue.length) {
    const file = queue.pop()!; if (seen.has(file)) continue; seen.add(file);
    for (const match of read(file).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = match[1]; let target: string | null = null;
      if (spec.startsWith("@/")) target = spec.slice(2); else if (spec.startsWith(".")) target = path.posix.join(path.posix.dirname(file), spec); else continue;
      for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`, target]) if (existsSync(path.join(root, candidate)) && statSync(path.join(root, candidate)).isFile()) { queue.push(candidate); break; }
    }
  }
  return [...seen];
}

test("the browser import graph holds no server module, credential reader or token name", () => {
  for (const entry of ["components/onlyfans-preview/PlanCConsole.tsx", "lib/onlyfans/plan-c-client.ts"]) {
    const graph = importGraph(entry);
    assert.ok(graph.includes("lib/onlyfans/plan-c.ts"));
    for (const file of graph) {
      assert.ok(!SERVER_ONLY.some(name => file.includes(name)), `${entry} reaches ${file}`);
      const source = read(file);
      assert.ok(!/process\.env/.test(source), `${file} reads the environment`);
      assert.ok(!/ONLYFANS_[A-Z_]*TOKEN|Bearer /.test(source), `${file} names a credential`);
    }
  }
});

test("a real browser bundle of the Plan C screen contains no token, credential reader or backend transport", async () => {
  const sentinel = "SENTINEL-CONTROL-TOKEN-7f3a9c";
  const result = await build({ absWorkingDir: root, stdin: { contents: 'export { default } from "./components/onlyfans-preview/PlanCConsole"; export * from "./lib/onlyfans/plan-c-client";', resolveDir: root, loader: "tsx" },
    bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", minify: false, logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"', "process.env.ONLYFANS_CONTROL_TOKEN": JSON.stringify(sentinel), "process.env.ONLYFANS_API_BASE_URL": '"https://backend.sentinel.invalid"' } });
  const code = result.outputFiles[0].text;
  assert.ok(code.length > 10_000, "the bundle is real");
  for (const needle of [sentinel, "backend.sentinel.invalid", "ONLYFANS_CONTROL_TOKEN", "configuredBackendPurpose", "createPlanCBackend", "createBackendTransport", "Bearer ", "/onlyfans/control/v2"])
    assert.ok(!code.includes(needle), `the browser bundle contains ${needle}`);
  assert.ok(code.includes("/plan-c"), "it talks to the dashboard's own proxy routes");
});

test("the proxy routes exist, take the token only on the server, and gate every handler", () => {
  const base = "app/api/onlyfans-controls/accounts/[accountId]/plan-c";
  const routes: Array<[string, "GET" | "POST"]> = [[`${base}/drafts/route.ts`, "GET"], [`${base}/unresolved/route.ts`, "GET"], [`${base}/drafts/[requestId]/[generation]/[action]/route.ts`, "POST"],
    [`${base}/conversations/[conversationId]/[action]/route.ts`, "POST"], [`${base}/unresolved/[id]/reconcile/route.ts`, "POST"]];
  for (const [file, method] of routes) {
    const source = read(file);
    assert.match(source, new RegExp(`export async function ${method}\\(`), file);
    assert.equal([...source.matchAll(/export async function (\w+)/g)].length, 1, `${file} exports one handler`);
    assert.match(source, new RegExp(`planCGate\\(request, .*, ${method === "POST"}\\)`), `${file} gates with write=${method === "POST"}`);
    assert.ok(!/process\.env|ONLYFANS_|fetch\(/.test(source), `${file} does no I/O of its own`);
  }
  const guard = read("lib/onlyfans/plan-c-guard.ts");
  assert.match(guard, /requireOnlyFansRead\(\{ agency: false, write \}\)/);
  assert.match(guard, /planCOperatorOnly\(ctx\)/);
  assert.match(guard, /trustedFormOrigin\(request\)/);
  assert.match(guard, /readCommandJson\(request, PLAN_C_MAX_BODY_BYTES\)/);
  assert.match(read("lib/onlyfans/plan-c-backend.ts"), /configuredBackendPurpose\("CONTROL"\)/, "the existing control credential, held server side only");
});

test("there is no auto-approve, bulk or automatic hand back path", () => {
  const files = ["lib/onlyfans/plan-c.ts", "lib/onlyfans/plan-c-client.ts", "lib/onlyfans/plan-c-backend.ts", "lib/onlyfans/plan-c-route.ts", "lib/onlyfans/plan-c-guard.ts", "components/onlyfans-preview/PlanCConsole.tsx", "app/onlyfans/plan-c/page.tsx"];
  const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const file of files) assert.ok(!/approve[-_ ]?all|auto[-_ ]?approve|autoApprov|bulk|handback[-_ ]?all|auto[-_ ]?hand|autoHand|selectAll|select[-_ ]all/i.test(code(file)), `${file} names a bulk or automatic path`);
  const client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: createPlanCProxy(createPlanCMock()).fetch });
  assert.deepEqual(Object.keys(client).sort(), ["approveDraft", "conversationCommand", "editDraft", "listDrafts", "listUnresolved", "rejectDraft", "reconcile"].sort());
  const ui = read("components/onlyfans-preview/PlanCConsole.tsx");
  // No effect, timer or load path may issue a command.
  const effects = [...ui.matchAll(/use(?:Effect|Callback)\(/g)].map(m => { let depth = 0, i = m.index! + m[0].length - 1; const start = i; for (; i < ui.length; i++) { if (ui[i] === "(") depth++; if (ui[i] === ")" && --depth === 0) break; } return ui.slice(start, i); });
  assert.ok(effects.length >= 3);
  for (const body of effects) assert.ok(!/approveDraft|rejectDraft|editDraft|conversationCommand|reconcile\(|onApprove|onCommand|setInterval\([^)]*approve/.test(body), `an effect issues a command: ${body.slice(0, 80)}`);
  // Each command is reached only through an onClick closure on a button.
  for (const name of ["onApprove(", "onReject(", "onEdit(", "onCommand(", "onReconcile("]) for (const line of ui.split("\n").filter(l => l.includes(name) && !l.includes("=> Promise") && !l.includes("const run") && !l.includes("const submit")))
    assert.ok(/onClick|const result = await|run\(|submit|void run/.test(line), `${name} outside a click path: ${line.trim().slice(0, 100)}`);
});
