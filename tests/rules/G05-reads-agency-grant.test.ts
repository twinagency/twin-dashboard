// G05 (promoted from tests/known-red/W3-lib-onlyfans-3-reads.test.ts, L9-20 cases only; L9-21..L9-23 stay in the corpus).
// Was KNOWN RED (W3 lib-onlyfans-3, findings L9-20..L9-23; docs/review/W3/lib-onlyfans-3.md). lib/onlyfans/reads.ts + operations.ts.
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
// Green since G05 (L9-20). Runs in npm run test:rules.
// Offline: a fake OnlyFansBackend object (the read service's injected seam, as scripts/check-onlyfans-read.ts does).
// OPERATOR/AGENCY below use the current ReadAuth shape. L9-22's fix changes ReadAuth; update the auth constants with a TEST-CHANGE line.
import assert from "node:assert/strict";
import test from "node:test";
import { readAccounts, type ReadAuth } from "../../lib/onlyfans/reads";
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

// ---------- F9 (Flash R1): the requested creator is normalized once, like the grant ids (lowercased at agency-scope.ts) ----------
test("F9: an agency granted c1 asking for C1 reads c1's account, and the backend is asked for c1", async () => {
  const { backend, calls } = fakeBackend([boundTo("c1")]);
  const result = await readAccounts({ auth: AGENCY, backend }, { creatorId: "C1", accountId: null });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ creatorId: "c1" }]);
});
test("F9: the operator asking for C1 is not refused a c1 account as a scope violation", async () => {
  const { backend } = fakeBackend([boundTo("c1")]);
  const result = await readAccounts({ auth: OPERATOR, backend }, { creatorId: "C1", accountId: null });
  assert.equal(result.ok, true);
});
