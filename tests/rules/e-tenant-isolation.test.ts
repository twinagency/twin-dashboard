/**
 * Rule e (handover/TEAM-BRIEFING.md §7): tenant isolation. The same fan id (and so the same conversation id) in two
 * creator accounts shares nothing. Dashboard part: a read for account A never accepts account B's row, even when the fan
 * or conversation id is identical; the client caches never merge the two; every engine, Plan C, catalogue, Moxy and
 * category parser refuses a payload scoped to the other account. Pure functions with fake backends. No network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readConversation, readConversations, type ReadAuth } from "../../lib/onlyfans/reads";
import type { OnlyFansBackend } from "../../lib/onlyfans/backend";
import { applyConversation, cachedConversationIds, currentConversationState, initialSelectionState, requestConversation, selectAccount, selectConversation } from "../../lib/onlyfans-preview/selection";
import type { ConversationDetail } from "../../lib/onlyfans-preview/types";
import { parseEngineStatus } from "../../lib/onlyfans/engine-status";
import { parseEngineUnresolved } from "../../lib/onlyfans/engine-unresolved";
import { parsePlanCDrafts, parsePlanCUnresolved, PLAN_C_SCHEMA } from "../../lib/onlyfans/plan-c";
import { ENGINE_CATALOGUE_SCHEMA, parseEngineCatalogue } from "../../lib/onlyfans/engine-catalogue";
import { MOXY_SCHEMA, parseMoxy } from "../../lib/onlyfans/moxy";
import { parseCategoryPrice } from "../../lib/onlyfans/commercial-categories";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";

const A = "of-a", B = "of-b", FAN = "42";
const operator: ReadAuth = { operatorSession: true, agency: false, viewAs: false };
const detail = (accountId: string, conversationId: string) => ({ accountId, conversationId, marker: accountId }) as unknown as ConversationDetail;
const backendReturning = (data: { detail?: ConversationDetail; items?: unknown[] }) => ({
  listConversations: async () => ({ ok: true, data: { items: data.items ?? [], nextCursor: null } }),
  getConversation: async () => ({ ok: true, data: data.detail }),
}) as unknown as OnlyFansBackend;

test("a read for account A refuses account B's thread for the same fan id, and accepts A's own", async () => {
  for (const conversationId of [FAN, `${A}:${FAN}`]) {
    const foreign = await readConversation({ auth: operator, backend: backendReturning({ detail: detail(B, conversationId) }) }, { accountId: A, conversationId });
    assert.equal(foreign.ok, false, `B's ${conversationId} must not be served as A's`);
    if (!foreign.ok) assert.equal(foreign.code, "scope_violation");
    const own = await readConversation({ auth: operator, backend: backendReturning({ detail: detail(A, conversationId) }) }, { accountId: A, conversationId });
    assert.ok(own.ok, "A's own thread is served");
  }
  const mixed = await readConversations({ auth: operator, backend: backendReturning({ items: [{ accountId: A, conversationId: FAN }, { accountId: B, conversationId: FAN }] }) },
    { accountId: A, cursor: null });
  assert.equal(mixed.ok, false, "a list page that carries B's row for the same fan is refused whole");
  if (!mixed.ok) assert.equal(mixed.code, "scope_violation");
});

test("the client cache keeps two accounts' threads for the same fan id apart", () => {
  let state = initialSelectionState();
  const a = requestConversation(state, A, FAN); state = a.state;
  state = applyConversation(state, A, FAN, a.generation, a.seq, { status: "ready", data: detail(A, FAN) }).state;
  const b = requestConversation(state, B, FAN); state = b.state;
  state = applyConversation(state, B, FAN, b.generation, b.seq, { status: "ready", data: detail(B, FAN) }).state;
  const shown = (accountId: string) => { const current = currentConversationState(selectAccount(state, accountId)); return current?.status === "ready" ? current.data.accountId : current?.status; };
  assert.equal(shown(A), A); assert.equal(shown(B), B);
  assert.deepEqual(cachedConversationIds(state, A), [FAN]); assert.deepEqual(cachedConversationIds(state, B), [FAN]);
  const moved = selectConversation(selectAccount(state, B), B, "43");
  assert.equal(moved.byAccount[A].selectedConversationId, FAN, "selecting in B never moves A's selection");
});

test("every engine, Plan C, catalogue, Moxy and category parser refuses the other account's payload", () => {
  const request = { requestId: "0a1b2c3d-1111-4222-8333-444455556661", sourceMessageId: "1", status: "open", owner: "engine", nextStep: "none", actionOutcome: null, actionType: "reply" };
  const status = (accountId: string, conversationId: string) => ({ schemaVersion: "of-engine.v1", state: "current", accountId, conversationId, environment: "live", mode: "active",
    salesMode: "open", truncated: false, nextCursor: null, requests: [request] });
  assert.ok(parseEngineStatus(status(A, `${A}:${FAN}`), A, `${A}:${FAN}`), "control: A's own status parses");
  assert.equal(parseEngineStatus(status(B, `${B}:${FAN}`), A, `${A}:${FAN}`), null);
  assert.equal(parseEngineStatus(status(A, `${B}:${FAN}`), A, `${A}:${FAN}`), null);

  const unresolved = (conversationId: string) => ({ schemaVersion: "of-engine.v1", state: "current", scope: "account", accountId: A, environment: "live", nextCursor: null,
    items: [{ ...request, conversationId }] });
  assert.ok(parseEngineUnresolved(unresolved(`${A}:${FAN}`), A));
  assert.equal(parseEngineUnresolved(unresolved(`${B}:${FAN}`), A), null);

  const draft = (extra: Record<string, unknown>) => ({ requestId: "00000000-0000-4000-8000-000000000001", generation: 1, draftVersion: 1, draftHash: "a".repeat(64), status: "awaiting",
    expiresAt: "2026-11-11T12:00:00Z", parts: ["hi"], ...extra });
  const drafts = (...items: unknown[]) => ({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: A, drafts: items });
  assert.equal(parsePlanCDrafts(drafts(draft({ fanId: FAN })), A)?.drafts[0].conversationId, `${A}:${FAN}`, "a bare fan id is namespaced to the account read");
  assert.equal(parsePlanCDrafts(drafts(draft({ conversationId: `${B}:${FAN}` })), A), null);
  assert.equal(parsePlanCDrafts({ ...drafts(draft({ fanId: FAN })), accountId: B }, A), null);
  const items = (conversationId: string) => ({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: A, items: [{ id: "u1", kind: "unknown_send", owner: "engine", nextStep: "review", conversationId }] });
  assert.ok(parsePlanCUnresolved(items(`${A}:${FAN}`), A));
  assert.equal(parsePlanCUnresolved(items(`${B}:${FAN}`), A), null);

  const catalogue = (accountId: string) => ({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, accountId, items: [], nextCursor: null });
  assert.ok(parseEngineCatalogue(catalogue(A), A)); assert.equal(parseEngineCatalogue(catalogue(B), A), null);
  const moxy = (accountId: string) => ({ ok: true, schemaVersion: MOXY_SCHEMA, accountId, moxy: { engine: "legacy", moxySelected: false } });
  assert.ok(parseMoxy(moxy(A), A)); assert.equal(parseMoxy(moxy(B), A), null);
  const price = (accountId: string) => ({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId, categoryPrice: { folderId: "7", name: "Beach", revision: 1, priceCents: 1200,
    currency: "USD", appliesTo: "single_asset", fingerprint: "c".repeat(64) } });
  assert.ok(parseCategoryPrice(price(A), A, "7")); assert.equal(parseCategoryPrice(price(B), A, "7"), null);
});
