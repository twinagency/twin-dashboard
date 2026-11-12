// W1 lane 9a: characterization of the dashboard's Plan C code against payloads shaped like the backend at d10e065
// (twin-onlyfans-backend, read with `git show d10e065:<path>`, never run). Every fixture field is transcribed from
// the cited file:line, so the shapes are [i] transcribed until the LIVE-CHECK items in docs/review/W1/tests-contracts.md
// confirm them on the wire. Synthetic values only: of-synthetic-a, *.invalid hosts, repeated-character hashes.
// The stub below answers at the HTTP boundary like engine_approval_api.py; it holds no Plan C behaviour beyond what a test scripts.
// Findings covered: 1 (approve after edit uses the re-read generation), 3 (reads carry X-Plan-C-Actor), 7a (kind:ident
// unresolved ids and reconcile), 8 (single-part offer with integer ids), plus the three backend acknowledgement shapes.
// Mutation proofs: tests/rules/mutations/W1-tests-contracts/.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PLAN_C_HEADER, PLAN_C_SCHEMA, newCommandKey, parsePlanCDrafts, type PlanCDraft } from "../../lib/onlyfans/plan-c";
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { planCConversationCommand, planCDraftCommand, planCReadDrafts, planCReadUnresolved, planCReconcile } from "../../lib/onlyfans/plan-c-route";
import { createPlanCMock } from "../contracts/plan-c-mock-backend";
import { OPERATOR_ACTOR, createPlanCProxy } from "../contracts/plan-c-proxy";

const root = path.resolve(import.meta.dirname, "../..");
const ACCOUNT = "of-synthetic-a", FAN = "900000000101", CONVERSATION = `${ACCOUNT}:${FAN}`; // onlyfans_read/contract.py:140 f"{account_id}:{fan_id}"
const REQUEST = "0a1b2c3d-1111-4222-8333-444455556661";
const BACKEND_ROOT = `/onlyfans/control/v2/accounts/${ACCOUNT}/`; // engine_approval_api.py:31 prefix + :144-189 routes
const HASH_A = "a".repeat(64), HASH_B = "b".repeat(64);
/** Draft `expiresAt`/`approvedAt`: approval.py:104-105 send naive `isoformat()` text, operator_v2.py:70-72 `_zulu` re-reads it and
 * :67 `_iso` appends "Z" to a naive value, so the wire form is `...ss.ssssssZ` (microseconds, Z). */
const pyZulu = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace("Z", "000Z");
/** Other timestamps go out through `_iso` (operator_v2.py:63-67) directly; whether the column value is aware (+00:00) or naive (Z) is
 * not established [i]. The aware form is used here so both spellings are exercised across the file. */
const pyIso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace("Z", "000+00:00");

// ── the HTTP boundary ─────────────────────────────────────────────────────────
type WireCall = { method: string; rawPath: string; path: string; headers: Headers; body: Record<string, unknown> | null };
type Reply = readonly [number, Record<string, unknown>];
/** A scripted fetch at the backend boundary. Every answer is wrapped the way engine_approval_api.py:34-36 `answer()` wraps it. */
function wire(route: (call: WireCall) => Reply) {
  const calls: WireCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: WireCall = { method: init?.method ?? "GET", rawPath: url.pathname, path: decodeURIComponent(url.pathname), headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    calls.push(call);
    const [status, body] = route(call);
    return Response.json({ schemaVersion: PLAN_C_SCHEMA, ...body }, { status, headers: { "Cache-Control": "private, no-store", [PLAN_C_HEADER]: PLAN_C_SCHEMA } });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, posts: () => calls.filter(call => call.method === "POST") };
}
const NOT_FOUND: Reply = [404, { ok: false, code: "not_found" }]; // engine_approval_api.py:80-81
const backendOver = (fetchImpl: typeof fetch) => createPlanCBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl });
/** Browser client -> the existing offline proxy (tests/contracts/plan-c-proxy.ts) -> plan-c-backend -> this stub. Only `fetch` of the mock is replaced. */
const clientOver = (fetchImpl: typeof fetch) => createPlanCClient({ accountId: ACCOUNT, fetchImpl: createPlanCProxy({ ...createPlanCMock(), fetch: fetchImpl }).fetch });

// ── backend-shaped fixtures [i transcribed] ───────────────────────────────────
/** One part of approval.py:157-161 `shown` (stored as parts_json, returned by `_view`, approval.py:100-106). Reply parts carry no terms. */
const replyPart = (index: number, body: string) => ({ decision_id: `0a1b2c3d-1111-4222-8333-44445555667${index}`, part_index: index, action: "reply" as const, body,
  payload_hash: HASH_B, catalog_item_id: null, offer_grant_id: null, price_cents: null, currency: null, media_ids: [], preview_ids: [], terms_hash: null });
/** An offer part: catalog_item_id is an Integer column (db/onlyfans_engine_models.py:88), media_ids/preview_ids come from
 * catalog_terms and are ints (onlyfans_runtime/media_delivery.py:25,45), currency is approval.py:53 CURRENCY 'USD'. */
const offerPart = { decision_id: "0a1b2c3d-1111-4222-8333-444455556680", part_index: 0, action: "offer" as const, body: "A synthetic set, just for you.",
  payload_hash: HASH_B, catalog_item_id: 4242, offer_grant_id: "0a1b2c3d-1111-4222-8333-444455556681", price_cents: 1500, currency: "USD",
  media_ids: [7001, 7002], preview_ids: [7001], terms_hash: HASH_A };
/** operator_v2.py:236-245 list_drafts row; `offer` block :247-250 is built from the first offer part with str() ids. */
type WirePart = ReturnType<typeof replyPart> | typeof offerPart;
const isOfferPart = (part: WirePart): part is typeof offerPart => part.action === "offer";
function wireDraft(d: { generation: number; version: number; parts: WirePart[]; revision?: number; status?: string; draftHash?: string }) {
  const head = d.parts.find(isOfferPart);
  return { requestId: REQUEST, generation: d.generation, draftVersion: d.version, draftHash: d.draftHash ?? HASH_A, status: d.status ?? "awaiting",
    action: head ? "offer" : "reply", fanId: FAN, conversationId: CONVERSATION, expiresAt: pyZulu(10 * 60_000), parts: d.parts,
    conversation: { revision: d.revision ?? 0, messages: [{ direction: "fan", text: "hi, are you around?", at: pyIso(-120_000) }] }, // :165-168, `at` via _iso [i]
    evidence: null, approvedBy: null, approvedAt: null,
    ...(head ? { offer: { productId: String(head.catalog_item_id), mediaIds: head.media_ids.map(String), mediaCount: head.media_ids.length,
      priceCents: head.price_cents, currency: head.currency } } : {}) };
}
/** engine_approval_api.py:154 drafts body; receipts per operator_v2.py:327-329. */
const draftsBody = (drafts: unknown[], receipts: unknown[] = []) => ({ ok: true, accountId: ACCOUNT, drafts, receipts });
/** operator_v2.py:367-370 draft acknowledgement (generation, status and draftHash included). */
const draftAck = (body: Record<string, unknown>, action: string, generation: number, version: number, status: string, draftHash = HASH_A) =>
  ({ ok: true, accountId: ACCOUNT, requestId: REQUEST, generation, action, commandKey: body.commandKey, recordedVersion: version, status, draftHash, replayed: false });
/** operator_v2.py:1155-1156 reconcile acknowledgement; `_idempotent` adds `replayed` (:159). `resolved` is true for dismissed/acknowledged. */
const reconcileAck = (body: Record<string, unknown>, id: string, outcome: string) =>
  ({ ok: true, accountId: ACCOUNT, id, action: "reconcile", commandKey: body.commandKey, outcome, resolved: outcome === "dismissed" || outcome === "acknowledged", replayed: false });
/** engine_approval_api.py:166 unresolved body (items per operator_v2.py:421-431, below). */
const unresolvedBody = () => ({ ok: true, accountId: ACCOUNT, items: UNRESOLVED });

/** operator_v2.py:421-431 `_item`: id is `kind:ident`; conversation/revision/createdAt only when known; extra keys merged in. `createdAt` via _iso [i]. */
const UNRESOLVED = [
  // :475-484 unknown_send, ident = of_text_intent.intent_id String(36)
  { id: "unknown_send:0a1b2c3d-1111-4222-8333-444455556662", kind: "unknown_send", owner: "operator", nextStep: "reconcile_with_provider_history",
    summary: `A send to fan ${FAN} may have reached the fan (status unknown). Do not resend.`, conversationId: CONVERSATION, revision: 0, createdAt: pyIso(-600_000) },
  // :506-508 unlinked_transaction, ident = of_fans_evidence.evidence_id String(36), extra evidenceId
  { id: "unlinked_transaction:0a1b2c3d-1111-4222-8333-444455556663", kind: "unlinked_transaction", owner: "operator", nextStep: "review_and_reconcile",
    summary: `transaction of 1500 cents for fan ${FAN} is unlinked (held).`, conversationId: CONVERSATION, revision: 0, createdAt: pyIso(-500_000),
    evidenceId: "0a1b2c3d-1111-4222-8333-444455556663" },
  // :524-526 unreconciled_access, ident = access-<sha256 hex> (fans_api_adapter/payment_evidence.py:235), 91 characters
  { id: `unreconciled_access:access-${"e".repeat(64)}`, kind: "unreconciled_access", owner: "operator", nextStep: "confirm_access_evidence",
    summary: `Access evidence for fan ${FAN} is pending (applied=False). Do not assert the fan has access.`, conversationId: CONVERSATION, revision: 0, createdAt: pyIso(-400_000) },
  // :623-625 held_send_evidence, extra evidenceId
  { id: "held_send_evidence:0a1b2c3d-1111-4222-8333-444455556664", kind: "held_send_evidence", owner: "operator", nextStep: "review_queued_send",
    summary: `A queued send reached fan ${FAN}. Only that fan is held until reviewed.`, conversationId: CONVERSATION, revision: 0, createdAt: pyIso(-300_000),
    evidenceId: "0a1b2c3d-1111-4222-8333-444455556664" },
  // :634-639 provider_event, ident = sha256 hex (pilot_scope.py:318-320), no conversation, extra event keys
  { id: `provider_event:${"d".repeat(64)}`, kind: "provider_event", owner: "operator", nextStep: "classify_exact_provider_evidence",
    summary: "A retained provider event holds sends.", createdAt: pyIso(-200_000), eventEpoch: 2, eventKey: "evt-synthetic-0001", payloadSha256: "c".repeat(64), scopeRevision: 4 },
  // :695-699 human_hold, ident = fan id
  { id: `human_hold:${FAN}`, kind: "human_hold", owner: "human", nextStep: "awaiting_handback",
    summary: `A human holds fan ${FAN}.`, conversationId: CONVERSATION, revision: 3, createdAt: pyIso(-100_000) },
];
/** The kinds operator_v2.py:1100-1152 reconcile with {commandKey, actor, evidenceRef} (:1073), and the outcome each records.
 * provider_event and held_projection go to other handlers that need more fields (:1067-1072, :856); not covered here. */
const RECONCILABLE: Record<string, string> = { unknown_send: "evidence_recorded_hold_retained", unlinked_transaction: "dismissed",
  unreconciled_access: "acknowledged", held_send_evidence: "dismissed" };

// ── finding 1 ─────────────────────────────────────────────────────────────────
test("finding 1: approve after an edit posts the re-read generation and version (backend bumps the generation)", async () => {
  let current = { generation: 3, version: 2, draftHash: HASH_A, parts: [replyPart(0, "Hey you, I got your message."), replyPart(1, "What are you after tonight?")] };
  const stub = wire(call => {
    if (call.method === "GET" && call.path === BACKEND_ROOT + "drafts") return [200, draftsBody([wireDraft(current)])];
    const m = new RegExp(`^${BACKEND_ROOT}drafts/${REQUEST}/(\\d+)/(approve|edit)$`).exec(call.path), body = call.body ?? {};
    if (!m || Number(m[1]) !== current.generation) return NOT_FOUND; // approval.py `approval not found` -> operator_v2.py:263 NotFound
    if (body.expectedVersion !== current.version) return [409, { ok: false, code: "conflict" }];
    if (m[2] === "edit") { // approval.py:581,617: generation + 1, version + 1, awaiting; fresh decision rows (:593 new uuid4; :598 payload_hash recomputed from content, so only an edited part's changes; synthetic values) and draft_hash (:613,622)
      const texts = body.parts as string[], next = current.generation + 1;
      current = { generation: next, version: current.version + 1, draftHash: "f".repeat(64),
        parts: current.parts.map((part, i) => ({ ...part, decision_id: `0a1b2c3d-2222-4222-8333-4444555566${next}${i}`, payload_hash: texts[i] === part.body ? part.payload_hash : "e".repeat(63) + i, body: texts[i] })) };
      return [200, draftAck(body, "edit", current.generation, current.version, "awaiting", current.draftHash)];
    }
    return [200, draftAck(body, "approve", current.generation, current.version, "approved", current.draftHash)];
  });
  const client = clientOver(stub.fetch);
  const first = await client.listDrafts();
  assert.ok(first.ok, "the backend-shaped draft list must parse");
  const shown = first.data.drafts[0];
  assert.deepEqual([shown.generation, shown.draftVersion], [3, 2], JSON.stringify(shown));
  const edited = await client.editDraft(shown, ["Hey you, saw your message.", "What are you after tonight?"]);
  assert.deepEqual(edited, { ok: true, replayed: false, recordedVersion: 3, recordedRevision: null }, "edit ack read as ok with the new version");
  const relisted = await client.listDrafts();
  assert.ok(relisted.ok, JSON.stringify(relisted));
  assert.equal(relisted.data.drafts[0].draftHash, "f".repeat(64), "re-read list carries the edited generation's draft hash");
  const approved = await client.approveDraft(relisted.data.drafts[0]);
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const [editPost, approvePost] = stub.posts();
  assert.equal(editPost.path, `${BACKEND_ROOT}drafts/${REQUEST}/3/edit`);
  assert.equal(editPost.body?.expectedVersion, 2, JSON.stringify(editPost.body));
  assert.equal(approvePost.path, `${BACKEND_ROOT}drafts/${REQUEST}/4/approve`, "approve uses the generation the re-read list reported");
  assert.equal(approvePost.body?.expectedVersion, 3, "approve carries the version the re-read list reported");
  assert.deepEqual(Object.keys(approvePost.body ?? {}).sort(), ["actor", "commandKey", "expectedVersion"]); // operator_v2.py:255
});

// ── finding 3 ─────────────────────────────────────────────────────────────────
const readStub = () => wire(call => call.path === BACKEND_ROOT + "drafts" ? [200, draftsBody([wireDraft({ generation: 0, version: 1, parts: [replyPart(0, "Hey you.")] })])]
  : call.path === BACKEND_ROOT + "unresolved" ? [200, unresolvedBody()] : NOT_FOUND);

test("finding 3: planCReadDrafts sends X-Plan-C-Actor to the backend iff it is given an actor", async () => {
  // engine_approval_api.py:150-151 reads the header; operator_v2.py:195-209 authorizes it for 'read' when a pilot is configured.
  const stub = readStub(), backend = backendOver(stub.fetch);
  const withActor = await planCReadDrafts(backend, ACCOUNT, OPERATOR_ACTOR), without = await planCReadDrafts(backend, ACCOUNT);
  assert.equal(withActor.status, 200, JSON.stringify(withActor.body));
  assert.equal(without.status, 200, JSON.stringify(without.body));
  assert.deepEqual(stub.calls.map(call => [call.path, call.headers.get("x-plan-c-actor")]),
    [[BACKEND_ROOT + "drafts", OPERATOR_ACTOR], [BACKEND_ROOT + "drafts", null]]);
});

test("finding 3: planCReadUnresolved sends X-Plan-C-Actor to the backend iff it is given an actor", async () => {
  // engine_approval_api.py:163 reads the header for the unresolved list.
  const stub = readStub(), backend = backendOver(stub.fetch);
  const withActor = await planCReadUnresolved(backend, ACCOUNT, OPERATOR_ACTOR), without = await planCReadUnresolved(backend, ACCOUNT);
  assert.equal(withActor.status, 200, JSON.stringify(withActor.body));
  assert.equal(without.status, 200, JSON.stringify(without.body));
  assert.deepEqual(stub.calls.map(call => [call.path, call.headers.get("x-plan-c-actor")]),
    [[BACKEND_ROOT + "unresolved", OPERATOR_ACTOR], [BACKEND_ROOT + "unresolved", null]]);
});

test("finding 3: both Plan C read routes pass the gate's actor to the read", () => {
  const dir = "app/api/onlyfans-controls/accounts/[accountId]/plan-c";
  for (const [file, fn] of [[`${dir}/drafts/route.ts`, "planCReadDrafts"], [`${dir}/unresolved/route.ts`, "planCReadUnresolved"]]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, new RegExp(`${fn}\\(\\s*gate\\.backend\\s*,\\s*gate\\.accountId\\s*,\\s*gate\\.actor\\s*\\)`), `${file} must pass gate.actor`);
  }
});

// ── finding 7a ────────────────────────────────────────────────────────────────
test("finding 7a: backend unresolved items with kind:ident ids parse, and reconcile posts the encoded id with exactly {commandKey, actor, evidenceRef}", async () => {
  const stub = wire(call => {
    if (call.method === "GET" && call.path === BACKEND_ROOT + "unresolved") return [200, unresolvedBody()];
    const m = new RegExp(`^${BACKEND_ROOT}unresolved/(.+)/reconcile$`).exec(call.path), body = call.body ?? {};
    const item = m && UNRESOLVED.find(row => row.id === m[1]);
    if (!item || !(item.kind in RECONCILABLE)) return NOT_FOUND;
    return [200, reconcileAck(body, item.id, RECONCILABLE[item.kind])];
  });
  const client = clientOver(stub.fetch);
  const list = await client.listUnresolved();
  assert.ok(list.ok, "the backend-shaped unresolved list must parse");
  assert.deepEqual(list.data.items.map(item => item.id), UNRESOLVED.map(row => row.id));
  assert.equal(list.data.items.find(item => item.kind === "unreconciled_access")?.id.length, 91);
  assert.deepEqual(list.data.items.map(item => item.conversationRevision), UNRESOLVED.map(row => "revision" in row ? row.revision : null),
    "`revision` is read as the conversation revision");
  for (const item of list.data.items.filter(row => row.kind in RECONCILABLE)) {
    const result = await client.reconcile(item, "provider history checked for this item");
    assert.equal(result.ok, true, `${item.id}: ${JSON.stringify(result)}`);
    const post = stub.posts().at(-1);
    assert.equal(post?.rawPath, `${BACKEND_ROOT}unresolved/${encodeURIComponent(item.id)}/reconcile`, "the id is percent-encoded in the path");
    assert.deepEqual(Object.keys(post?.body ?? {}).sort(), ["actor", "commandKey", "evidenceRef"]); // operator_v2.py:1073
    assert.equal(post?.body?.actor, OPERATOR_ACTOR);
    assert.equal(post?.body?.evidenceRef, "operator:fansapi:provider history checked for this item");
  }
  assert.equal(stub.posts().length, Object.keys(RECONCILABLE).length);
});

// ── finding 8 ─────────────────────────────────────────────────────────────────
test("finding 8: a single-part offer as the backend emits it (integer ids on the part, string ids in `offer`) parses to one set of offer terms", () => {
  const receipts = [ // operator_v2.py:327-329
    { intentId: "0a1b2c3d-1111-4222-8333-444455556690", fanId: FAN, messageId: "880000000001", acceptedAt: "2026-11-12T09:31:00Z", action: "offer", projected: true },
    { intentId: "0a1b2c3d-1111-4222-8333-444455556691", fanId: FAN, messageId: "880000000002", acceptedAt: "2026-11-12T09:30:00Z", action: "reply", projected: false }];
  const list = parsePlanCDrafts({ schemaVersion: PLAN_C_SCHEMA, ...draftsBody([wireDraft({ generation: 0, version: 1, parts: [offerPart] })], receipts) }, ACCOUNT);
  assert.ok(list, "the backend-shaped offer draft must parse");
  const draft: PlanCDraft = list.drafts[0];
  assert.equal(draft.action, "offer");
  assert.equal(draft.conversationRevision, 0, "operator_v2.py:241 sends revision 0 when no conversation state exists");
  assert.deepEqual(draft.parts.map(part => ({ action: part.action, mediaIds: part.mediaIds, previewIds: part.previewIds, productId: part.productId, priceCents: part.priceCents, currency: part.currency })),
    [{ action: "offer", mediaIds: ["7001", "7002"], previewIds: ["7001"], productId: "4242", priceCents: 1500, currency: "USD" }]);
  assert.deepEqual(draft.offer, { productId: "4242", mediaIds: ["7001", "7002"], mediaCount: 2, priceCents: 1500, currency: "USD" });
  assert.deepEqual(list.receipts?.map(receipt => [receipt.action, receipt.messageId, receipt.projected]), [["offer", "880000000001", true], ["reply", "880000000002", false]]);
});

// ── acknowledgements ─────────────────────────────────────────────────────────
test("acks: backend draft, control and reconcile acknowledgements read as recorded with the backend's version and revision", async () => {
  const stub = wire(call => {
    const body = call.body ?? {};
    if (call.path === `${BACKEND_ROOT}drafts/${REQUEST}/3/approve`) return [200, draftAck(body, "approve", 3, 2, "approved")];
    if (call.path === `${BACKEND_ROOT}conversations/${CONVERSATION}/stop`) // operator_v2.py:415-418 _control_ack
      return [200, { ok: true, accountId: ACCOUNT, conversationId: CONVERSATION, action: "stop", commandKey: body.commandKey, recordedRevision: 6, replayed: false }];
    if (call.path === `${BACKEND_ROOT}unresolved/${UNRESOLVED[0].id}/reconcile`)
      return [200, reconcileAck(body, UNRESOLVED[0].id, "evidence_recorded_hold_retained")];
    return NOT_FOUND;
  });
  const backend = backendOver(stub.fetch);
  const approve = await planCDraftCommand(backend, { actor: OPERATOR_ACTOR, accountId: ACCOUNT, requestId: REQUEST, generation: "3", action: "approve",
    body: { expectedVersion: 2, commandKey: newCommandKey() } });
  assert.deepEqual([approve.status, approve.body.outcome, approve.body.recordedVersion, approve.body.replayed], [200, "recorded", 2, false], JSON.stringify(approve.body));
  const stop = await planCConversationCommand(backend, { actor: OPERATOR_ACTOR, accountId: ACCOUNT, conversationId: CONVERSATION, action: "stop",
    body: { expectedRevision: 5, commandKey: newCommandKey() } });
  assert.deepEqual([stop.status, stop.body.outcome, stop.body.recordedRevision], [200, "recorded", 6], JSON.stringify(stop.body));
  const reconcile = await planCReconcile(backend, { actor: OPERATOR_ACTOR, accountId: ACCOUNT, id: UNRESOLVED[0].id,
    body: { commandKey: newCommandKey(), evidence: "provider history checked" } });
  assert.deepEqual([reconcile.status, reconcile.body.outcome], [200, "recorded"], JSON.stringify(reconcile.body));
});
