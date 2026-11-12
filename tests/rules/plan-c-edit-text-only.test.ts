/**
 * Characterization (W1 lane 1, "rules that hold" PC5; REVIEW.md invariant 7 "Money: manual prices only, no repricing"): a Plan C
 * edit carries part TEXT only (lib/onlyfans/plan-c-route.ts:54-58). Object parts (which could smuggle a price, media or product)
 * and extra body keys such as priceCents are refused 400 before the backend is called. Not duplicated from
 * tests/contracts/plan-c.test.ts, which already pins the backend edit body to exactly {actor, commandKey, expectedVersion, parts}
 * (:140) and refuses em dash / empty / non-array edits (:173-175). The real backend over the typed mock wire (mockBackend in
 * tests/rules/plan-c-fixtures.ts); `mock.posts()` is what reached it.
 * Mutation-proven for the extra-key half (tests/rules/mutations/W1-lib-onlyfans-plan-c/pc5-m2-*). Removing the route's string-part
 * check makes THIS test fail on a TypeError from validateEditTexts; the assertion-level proof for that half is
 * tests/rules/plan-c-edit-route-http.test.ts (pc5-m3-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { planCDraftCommand } from "../../lib/onlyfans/plan-c-route";
import { KEY, MOCK_ACCOUNT, OPERATOR_ACTOR, mockBackend, scopedDraft } from "./plan-c-fixtures";

test("PC5: an edit with object parts or extra price/product keys is refused 400 and never reaches the backend", async () => {
  const draft = scopedDraft(), { mock, backend } = mockBackend({ drafts: [draft] });
  const edit = (body: unknown) => planCDraftCommand(backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, requestId: draft.requestId, generation: String(draft.generation), action: "edit", body });
  const control = await edit({ expectedVersion: 1, commandKey: KEY, parts: ["New text one", "New text two"] });
  assert.equal(control.status, 200, "control: a text-only edit is relayed");
  assert.equal(mock.posts().length, 1);
  const cases: Array<[string, unknown]> = [
    ["object part with a price", { expectedVersion: 1, commandKey: KEY, parts: [{ text: "New text", priceCents: 100 }, "ok"] }],
    ["object part with a product", { expectedVersion: 1, commandKey: KEY, parts: ["ok", { text: "New text", productId: "other" }] }],
    ["number part", { expectedVersion: 1, commandKey: KEY, parts: ["ok", 300] }],
    ["extra priceCents key", { expectedVersion: 1, commandKey: KEY, parts: ["New text", "ok"], priceCents: 100 }],
    ["extra media key", { expectedVersion: 1, commandKey: KEY, parts: ["New text", "ok"], mediaIds: ["m2"] }],
  ];
  for (const [name, body] of cases) assert.equal((await edit(body)).status, 400, name);
  assert.equal(mock.posts().length, 1, "a refused edit reached the backend");
});
