/**
 * R1 D1 (review findings 2/6): approvals stay whole-list strict, so one unreadable draft refuses the list. The brake must not go with
 * it: planCStopTargets reads Stop targets from the raw list, each with the readable draft's conversationId pattern and account
 * prefix, never from fanId, and with its own integer revision. It never yields a draft. UI side: tests/components/plan-c-ui.test.tsx.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDrafts, planCStopTargets } from "../../lib/onlyfans/plan-c";
import { createPlanCClient, createCommandKeyStore } from "../../lib/onlyfans/plan-c-client";
import { createPlanCMock } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";
import { MOCK_ACCOUNT, draftList, seedDraft } from "./plan-c-fixtures";

const A = `${MOCK_ACCOUNT}:900000000001`, B = `${MOCK_ACCOUNT}:900000000002`;
const bad = () => ({ ...seedDraft({ fanId: "900000000002" }), draftHash: "not-a-hash" });

test("a list refused for one bad draft still yields every valid Stop target, and only conversationId plus revision", () => {
  const list = draftList([seedDraft(), bad()]);
  assert.equal(parsePlanCDrafts(list, MOCK_ACCOUNT), null, "control: the list itself is refused");
  assert.deepEqual(planCStopTargets(list, MOCK_ACCOUNT), [{ conversationId: A, revision: 7 }, { conversationId: B, revision: 7 }]);
});

test("a list refused for size still yields its Stop targets, one per conversation at its highest revision", () => {
  const drafts = Array.from({ length: 201 }, (_, n) => seedDraft({ conversation: { revision: (n * 37) % 201, messages: [] } }));
  assert.equal(parsePlanCDrafts(draftList(drafts), MOCK_ACCOUNT), null);
  assert.deepEqual(planCStopTargets(draftList(drafts), MOCK_ACCOUNT), [{ conversationId: A, revision: 200 }]);
});

test("a list without accountId yields account-prefixed targets; a list naming another account yields none", () => {
  const { accountId: _dropped, ...unscoped } = draftList([seedDraft()]);
  assert.equal(parsePlanCDrafts(unscoped, MOCK_ACCOUNT), null);
  assert.deepEqual(planCStopTargets(unscoped, MOCK_ACCOUNT), [{ conversationId: A, revision: 7 }]);
  assert.deepEqual(planCStopTargets(draftList([seedDraft()], { accountId: "other-account" }), MOCK_ACCOUNT), []);
  assert.deepEqual(planCStopTargets({ ...draftList([seedDraft()]), schemaVersion: "v1" }, MOCK_ACCOUNT), [], "another contract yields none");
});

test("a target with a bad id, another account's prefix, no conversationId or no integer revision is not yielded", () => {
  const { conversationId: _dropped, ...fanOnly } = seedDraft();
  const rejected = [
    seedDraft({ conversationId: `${MOCK_ACCOUNT}:bad id!` }),
    seedDraft({ conversationId: "other-account:900000000001" }),
    seedDraft({ conversationId: "900000000001" }),
    fanOnly,
    seedDraft({ conversation: { messages: [] } as never }),
    seedDraft({ conversation: { revision: 7.5, messages: [] } }),
    seedDraft({ conversation: { revision: "7" as never, messages: [] } }),
    seedDraft({ conversation: { revision: -1, messages: [] } }),
  ];
  for (const raw of rejected) assert.deepEqual(planCStopTargets(draftList([raw]), MOCK_ACCOUNT), [], JSON.stringify(raw).slice(0, 160));
});

test("the proxy refusal carries the Stop targets to the client, which re-checks them", async () => {
  const mock = createPlanCMock({ drafts: [seedDraft(), bad()] });
  const client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: createPlanCProxy(mock).fetch, keys: createCommandKeyStore() });
  const read = await client.listDrafts();
  assert.equal(read.ok, false);
  assert.deepEqual(!read.ok && read.stopTargets, [{ conversationId: A, revision: 7 }, { conversationId: B, revision: 7 }]);
  const tampered = createPlanCClient({ accountId: MOCK_ACCOUNT, keys: createCommandKeyStore(), fetchImpl: (async () => Response.json(
    { schemaVersion: "of-engine-operator.v2", ok: false, error: "x", stopTargets: [{ conversationId: "other-account:1", revision: 1 }, { conversationId: A, revision: 3 }] },
    { status: 502 })) as typeof fetch });
  const second = await tampered.listDrafts();
  assert.deepEqual(!second.ok && second.stopTargets, [{ conversationId: A, revision: 3 }]);
});
