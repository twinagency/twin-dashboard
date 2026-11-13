// Regression guard (G25, Flash on #406): an account that leaves scope must forget its requested reads in the workspace,
// so re-adding it issues a fresh conversations read instead of waiting forever on a key the selection already dropped.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { accountsLeft, applyAccounts, initialSelectionState, requestConversations, selectAccount } from "../../lib/onlyfans-preview/selection";
import type { OfAccount } from "../../lib/onlyfans-preview/types";

const account = (accountId: string) => ({ accountId }) as unknown as OfAccount;
const ready = (...ids: string[]) => ({ status: "ready" as const, data: ids.map(account) });

test("accountsLeft names exactly the accounts whose entries a scope change dropped", () => {
  let state = selectAccount(applyAccounts(initialSelectionState(), 0, ready("of-a", "of-b")), "of-a");
  state = requestConversations(state, "of-a").state;
  state = requestConversations(state, "of-b").state;
  const narrowed = applyAccounts(state, 0, ready("of-b"));
  assert.deepEqual(accountsLeft(state, narrowed), ["of-a"]);
  assert.deepEqual(accountsLeft(narrowed, applyAccounts(narrowed, 0, ready("of-a", "of-b"))), []);
  assert.deepEqual(accountsLeft(state, applyAccounts(state, 0, { status: "empty" })).sort(), ["of-a", "of-b"]);
});

test("every workspace accounts commit forgets the requested keys of the accounts that left", () => {
  const src = readFileSync(join(__dirname, "../../components/onlyfans-preview/OnlyFansWorkspace.tsx"), "utf8");
  assert.doesNotMatch(src, /commit\(applyAccounts\(/, "an accounts commit bypasses commitAccounts, so a removed account keeps its requested key");
  const helper = src.slice(src.indexOf("const commitAccounts"), src.indexOf("const commitAccounts") + 800);
  assert.match(helper, /accountsLeft\(/);
  assert.match(helper, /requested\.current\.conversations\.delete\(/);
  assert.match(helper, /requested\.current\.details\.delete\(/);
});
