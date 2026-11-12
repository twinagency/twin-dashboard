/**
 * Characterization (W1 lane 1, "rules that hold" PC5, object-part half over HTTP; REVIEW.md invariant 7 "Money: manual prices
 * only, no repricing"). The REAL draft edit route (app/api/onlyfans-controls/accounts/[accountId]/plan-c/drafts/[requestId]/
 * [generation]/[action]/route.ts -> planCGate -> planCDraftCommand) answers an edit whose parts are objects or numbers (which could
 * smuggle a price or product) with HTTP 400 and sends nothing to the backend. tests/rules/plan-c-edit-text-only.test.ts covers the
 * extra-key half in-process; there, removing the route's string-part check only shows up as a TypeError from validateEditTexts.
 * Here the same mutation is an ASSERTION red: the handler throws, which Next answers 500, not 400.
 * Runs in tests/rules/plan-c-gate-scope.child.ts scenario "edit" (only next/headers and the server-only line replaced, fake fetch
 * at *.fixture.invalid). Mutation-proven (tests/rules/mutations/W1-lib-onlyfans-plan-c/pc5-m3-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { planCRouteChild } from "./plan-c-fixtures";

type Edits = Record<string, { status: number; posts: number }>;

test("PC5: the real edit route answers object or number parts 400 and never calls the backend", () => {
  const edits = planCRouteChild<Edits>("edit");
  assert.deepEqual(edits["text-only control"], { status: 200, posts: 1 }, "control: a text-only edit is relayed once");
  for (const name of ["object part with a price", "object part with a product", "number part"])
    assert.deepEqual(edits[name], { status: 400, posts: 0 }, name);
});
