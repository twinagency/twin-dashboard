// KNOWN RED (W4 lib-onlyfans-preview-1 F6): scenario overrides return before the scope checks
// (lib/onlyfans-preview/fixture-data-source.ts:130,166-167, scenarios.ts:223-262). A stale accounts read ignores the
// requested creator, and a stale thread read of another account's conversation id answers "stale" with this account's
// first summary under the foreign id (the R15 E-APPLY class). Preview-only isolation defect. Team's Claude owns the fix.
// Not wired into npm scripts or init.sh (lane may not edit init.sh; window close wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_AVA } from "../../lib/onlyfans-preview/fixtures";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { buildScenarios, DEFAULT_CONTROLS } from "../../lib/onlyfans-preview/scenarios";
import { dataOf } from "../rules/W4-lib-onlyfans-preview-1-helpers";

const NOVA_CREATOR = "creator-nova-0002";
const NOVA_CONVERSATION = "of-conv-nova-2001";
const plain = () => createFixtureOnlyFansDataSource({ viewer: operatorViewer() });
const stale = () => createFixtureOnlyFansDataSource({ viewer: operatorViewer(),
  scenarios: buildScenarios({ ...DEFAULT_CONTROLS, accountsRead: "stale", conversationRead: "stale" }, operatorViewer()) });

test("control: without scenarios a creator narrows the accounts and a foreign conversation id is refused", async () => {
  const listed = dataOf(await plain().listAccounts({ creatorId: NOVA_CREATOR }));
  assert.ok(listed && listed.length > 0);
  assert.deepEqual([...new Set(listed.map(a => a.binding.creatorId))], [NOVA_CREATOR]);
  const foreign = await plain().getConversation(ACCOUNT_AVA, NOVA_CONVERSATION);
  assert.equal(foreign.status, "error");
});

test("F6: a stale accounts read still narrows to the requested creator", async () => {
  const read = await stale().listAccounts({ creatorId: NOVA_CREATOR });
  assert.equal(read.status, "stale");
  const listed = dataOf(read);
  assert.ok(listed && listed.length > 0, "stale read returned no accounts");
  const creators = [...new Set(listed.map(a => a.binding.creatorId))];
  assert.deepEqual(creators, [NOVA_CREATOR], `stale read for ${NOVA_CREATOR} returned creators: ${creators}`);
});

test("F6: a stale thread read of another account's conversation id is refused like an unknown id", async () => {
  const foreign = await stale().getConversation(ACCOUNT_AVA, NOVA_CONVERSATION);
  assert.equal(foreign.status, "error",
    `foreign id under ${ACCOUNT_AVA} answered ${foreign.status} with summary ${dataOf(foreign)?.summary.conversationId}`);
});
