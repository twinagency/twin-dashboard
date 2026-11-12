// KNOWN RED (W3 lib-onlyfans-3, findings L9-20..L9-23; docs/review/W3/lib-onlyfans-3.md). lib/onlyfans/reads.ts + operations.ts.
// L9-20 reads.ts:169-185 — readAccounts never reads agencyGrant.creatorIds. A creatorId outside the grant still calls the backend,
//       and with creatorId null an account bound to an ungranted creator is answered 200. Isolation rests entirely on the backend
//       honouring the scope header (REVIEW inv 7 isolation; tenant isolation). Fix: deny a creatorId outside the grant before the
//       backend call (403, no call) and refuse any returned account whose binding.creatorId is not in the grant (502 scope_violation).
// L9-21 reads.ts:181 — a malformed account row (no binding) throws a TypeError out of readAccounts (non-JSON 500 upstream of the
//       browser, read as "session not accepted"). Fix: validate rows and answer a denial.
// L9-22 reads.ts:97-125 — authorizeRead admits {operatorSession:false, agency:false, viewAs:false, agencyGrant} although its header
//       says it requires a verified session; a grant without an agency identity is incoherent and must be refused.
// L9-23 operations.ts:63-89 — counters are not reconciled with reasons: delivery.unknown 1 with reasons [] parses, and
//       section8.ts:109 then shows "No processing hold is recorded." beside unknown deliveries (inv 7 ledger unknown is a hold).
// Team's Claude owns the fix. Not wired into npm scripts. Run: node --import tsx --test <this file>.
// Offline: a fake OnlyFansBackend object (the read service's injected seam, as scripts/check-onlyfans-read.ts does).
// OPERATOR/AGENCY below use the current ReadAuth shape. L9-22's fix changes ReadAuth; update the auth constants with a TEST-CHANGE line.
import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRead, readAccounts, type ReadAuth } from "../../lib/onlyfans/reads";
import { parseOperations } from "../../lib/onlyfans/operations";
import { accounts as fixtureAccounts } from "../../lib/onlyfans-preview/fixtures";
import type { BackendResult, OnlyFansBackend } from "../../lib/onlyfans/backend";
import type { OfAccount } from "../../lib/onlyfans-preview/types";
import type { AgencyGrant } from "../../lib/onlyfans/agency-scope";

const OPERATOR: ReadAuth = { operatorSession: true, agency: false, viewAs: false };
const GRANT: AgencyGrant = { creatorIds: ["c1"], actor: "agency-user:synthetic", canManage: false, canChat: false };
const AGENCY: ReadAuth = { operatorSession: false, agency: true, viewAs: false, agencyGrant: GRANT };

const boundTo = (creatorId: string, accountId = `acc-${creatorId}`): OfAccount =>
  ({ ...fixtureAccounts[0], accountId, binding: { ...fixtureAccounts[0].binding, creatorId } });

function fakeBackend(rows: unknown[]) {
  const calls: { creatorId: string | null }[] = [];
  const backend: OnlyFansBackend = {
    label: "fake",
    listAccounts: async (request) => { calls.push(request); return { ok: true, data: rows } as BackendResult<OfAccount[]>; },
    listConversations: async () => ({ ok: true, data: { items: [], nextCursor: null } }),
    getConversation: async () => ({ ok: false, status: 404, code: "backend_404", error: "That record is not available." }),
  };
  return { backend, calls };
}

// ---------- L9-20 agency grant isolation ----------
test("control: L9-20 the operator reads creator c1's account", async () => {
  const { backend } = fakeBackend([boundTo("c1")]);
  const result = await readAccounts({ auth: OPERATOR, backend }, { creatorId: "c1", accountId: null });
  assert.equal(result.ok, true);
});
test("control: L9-20 an agency granted c1 reads c1's account", async () => {
  const { backend } = fakeBackend([boundTo("c1")]);
  const result = await readAccounts({ auth: AGENCY, backend }, { creatorId: "c1", accountId: null });
  assert.equal(result.ok, true);
});
test("control: L9-20 an account from another creator than requested is a scope violation", async () => {
  const { backend } = fakeBackend([boundTo("c2")]);
  const result = await readAccounts({ auth: OPERATOR, backend }, { creatorId: "c1", accountId: null });
  assert.ok(!result.ok && result.code === "scope_violation");
});
test("L9-20: an agency granted only c1 asking for c2 is denied before the backend is called", async () => {
  const { backend, calls } = fakeBackend([boundTo("c2")]);
  const result = await readAccounts({ auth: AGENCY, backend }, { creatorId: "c2", accountId: null });
  assert.ok(!result.ok && [403, 404].includes(result.status) && calls.length === 0,
    `isolation: a creatorId outside agencyGrant.creatorIds must be denied 403/404 with no backend call; actual ok ${result.ok} status ${result.status} backend calls ${calls.length}`);
});
test("L9-20: an agency granted only c1 with no creator filter is not shown c2's account", async () => {
  const { backend } = fakeBackend([boundTo("c2")]);
  const result = await readAccounts({ auth: AGENCY, backend }, { creatorId: null, accountId: null });
  const creators = result.ok ? (result.body?.accounts ?? []).map(a => a?.binding?.creatorId) : [];
  assert.ok(!result.ok || !creators.includes("c2"),
    `isolation: an account bound to a creator outside the grant must be refused or filtered out; actual ok ${result.ok} with creators ${JSON.stringify(creators)}`);
});

// ---------- L9-21 malformed row ----------
test("L9-21: a malformed account row resolves to a denial, not a thrown TypeError", async () => {
  const { backend } = fakeBackend([{ accountId: "a" }]);
  let result: Awaited<ReturnType<typeof readAccounts>> | undefined;
  try { result = await readAccounts({ auth: OPERATOR, backend }, { creatorId: "c1", accountId: null }); }
  catch (error) { assert.fail(`a malformed backend row must become a denial, never an exception; actual rejection ${String(error)}`); }
  assert.equal(result?.ok, false, `a malformed backend row must not be answered ok; actual ${JSON.stringify(result)}`);
});

// ---------- L9-22 authorizeRead ----------
test("control: L9-22 no session and no grant is refused 401; an agency identity with a grant is admitted", () => {
  assert.equal(authorizeRead({ operatorSession: false, agency: false, viewAs: false })?.status, 401);
  assert.equal(authorizeRead(AGENCY), null);
});
test("L9-22: a grant without an agency identity or a verified session is refused", () => {
  const denial = authorizeRead({ operatorSession: false, agency: false, viewAs: false, agencyGrant: GRANT });
  assert.notEqual(denial, null, `a read requires a verified session or a verified agency identity; actual ${JSON.stringify(denial)} (admitted)`);
});

// ---------- L9-23 operations counters vs reasons (scripts/check-onlyfans-operations.ts snapshot) ----------
const snapshot = {
  schemaVersion: "of-operations.v3", accountId: "acc-a", asOf: "2026-10-18T00:00:00Z",
  modelCosts: { day: "2026-10-18", unit: "usd_millicents", spentMillicents: 7, capPerProviderMillicents: 10000, calls: 1, unresolvedCalls: 1, providers: 1 },
  providerConnectionVerified: false, reasons: ["delivery_unresolved", "model_cost_unresolved"],
  intake: { pending: 3, quarantined: 0 },
  planning: { generating: 0, ready: 1, unknown: 0, refused: 0, stale: 0 },
  work: { waiting: 2, claimed: 1, blocked: 0, oldestWaitingAgeSeconds: 8 },
  delivery: { queued: 0, dispatching: 0, unknown: 1, acceptedAwaitingProjection: 0, retainedUnresolvedReceipts: 1 },
  runtime: { registered: true, enabled: true, recoveryRequired: false, lastCompleteSyncAt: "2026-10-17T23:59:00Z" },
  policy: { revision: 2, enabled: true, usedUnits: 2, limitUnits: 5, nextDispatchAt: null },
};
// Derived from the repo snapshot with every counter matched by its reason (delivery.unknown/retained receipts → delivery_unresolved,
// unresolvedCalls → model_cost_unresolved), queued 0 and a recent lastCompleteSyncAt, so a "derive or reject" fix keeps it green.
test("control: L9-23 a counter-consistent operations snapshot parses and keeps its reasons", () => {
  const parsed = parseOperations(snapshot, "acc-a");
  assert.ok(parsed);
  assert.ok(snapshot.reasons.every(r => (parsed?.reasons as string[] | undefined)?.includes(r)), `input reasons kept; actual ${JSON.stringify(parsed?.reasons)}`);
});
test("L9-23: unknown deliveries without a delivery_unresolved reason are rejected", () => {
  const parsed = parseOperations({ ...snapshot, reasons: ["model_cost_unresolved"], delivery: { ...snapshot.delivery, unknown: 1 } }, "acc-a");
  assert.ok(parsed === null || parsed.reasons.includes("delivery_unresolved"),
    `inv 7: delivery.unknown > 0 is a hold and must carry delivery_unresolved (or not parse); actual reasons ${JSON.stringify(parsed?.reasons)} with delivery.unknown ${parsed?.delivery.unknown}`);
});
