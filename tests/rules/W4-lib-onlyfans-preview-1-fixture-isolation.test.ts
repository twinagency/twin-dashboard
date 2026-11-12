/**
 * W4 lib-onlyfans-preview-1 C4 (REVIEW inv 7 isolation): the fixture data source (lib/onlyfans-preview/fixture-data-source.ts)
 * without scenario overrides. A conversation id that belongs to another account is refused under this account with
 * the same words as a conversation id that does not exist, and a read-only view cannot list another account's inbox
 * or open a conversation on it: both are refused with the same words as an account that does not exist.
 * Characterization, green at HEAD; mutation proofs in tests/rules/mutations/W4-lib-onlyfans-preview-1/.
 * The scenario path skips these checks: known red F6 (tests/known-red/W4-lib-onlyfans-preview-1-scenario-scope.test.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_AVA, ACCOUNT_NOVA } from "../../lib/onlyfans-preview/fixtures";
import { createFixtureOnlyFansDataSource, operatorViewer, readOnlyView } from "../../lib/onlyfans-preview/fixture-data-source";

const NOVA_CONVERSATION = "of-conv-nova-2001";

test("own conversation reads ready under its own account", async () => {
  const read = await createFixtureOnlyFansDataSource({ viewer: operatorViewer() }).getConversation(ACCOUNT_AVA, "of-conv-ava-1001");
  assert.equal(read.status, "ready");
  assert.equal(read.status === "ready" && read.data.accountId, ACCOUNT_AVA);
  const nova = await createFixtureOnlyFansDataSource({ viewer: operatorViewer() }).getConversation(ACCOUNT_NOVA, NOVA_CONVERSATION);
  assert.equal(nova.status, "ready");
});

test("another account's conversation id is refused exactly like an unknown id", async () => {
  const source = createFixtureOnlyFansDataSource({ viewer: operatorViewer() });
  const foreign = await source.getConversation(ACCOUNT_AVA, NOVA_CONVERSATION);
  const unknown = await source.getConversation(ACCOUNT_AVA, "of-conv-does-not-exist");
  assert.equal(foreign.status, "error");
  assert.deepEqual(foreign, unknown);
});

test("a read-only view scoped to one account cannot list another account's inbox", async () => {
  const source = createFixtureOnlyFansDataSource({ viewer: readOnlyView([ACCOUNT_AVA]) });
  const list = await source.listConversations(ACCOUNT_NOVA);
  assert.equal(list.status, "error");
  assert.deepEqual(list, await source.listConversations("of-acc-does-not-exist"));
  assert.equal((await source.listConversations(ACCOUNT_AVA)).status, "ready");
});

test("a read-only view scoped to one account cannot open another account's conversation", async () => {
  const source = createFixtureOnlyFansDataSource({ viewer: readOnlyView([ACCOUNT_AVA]) });
  const open = await source.getConversation(ACCOUNT_NOVA, NOVA_CONVERSATION);
  assert.equal(open.status, "error");
  assert.deepEqual(open, await source.getConversation("of-acc-does-not-exist", "of-conv-does-not-exist"));
  assert.equal((await source.getConversation(ACCOUNT_AVA, "of-conv-ava-1001")).status, "ready");
});
