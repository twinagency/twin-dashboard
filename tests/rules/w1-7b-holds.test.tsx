/**
 * W1 lane 7b, rules that hold (REVIEW.md inv 7 "No send, no auto-retry": a user retry reuses the idempotency key; "Unconfirmed is not
 * refused (D7)": a lost reply keeps the command for retry, a refusal the dashboard raises before calling upstream is refused).
 * H1 CategoryDrafts, H2 + H3 Preparation. Pinned product lines: CategoryDrafts.tsx:40 (lost reply keeps `retry`), :79 (Retry resends
 * the kept command); Preparation.tsx:58 (unconfirmed → pending), :61 (lost reply → pending), :92 (Retry resends `pending`).
 * Product owner: team's Claude; test owner: W1 lane 7b. Mutation proofs: tests/rules/mutations/W1-preview-engine-commerce-ui/.
 * Offline: jsdom, global fetch stubbed, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { button, categoryPriceRead, click, hasButton, lostReply, openCategoryDrafts, openPreparation, pageText, preparationConfigured, preparationRead,
  saveCategoryPrice, savePreparationLimits, stubFetch } from "../helpers/w1-7b-dom";

/** Exactly what the preparation route answers when the upstream write is unconfirmed (route.ts:11,30 + preparation-backend.ts:20). */
const ROUTE_UNCONFIRMED = { schemaVersion: "of-configuration.v3", ok: false, status: 502, outcome: "unconfirmed", error: "The outcome is unconfirmed. Retry the same request." };

test("H1 CategoryDrafts: a lost reply reads unconfirmed, locks the form, and Retry same request reposts the identical requestId", async () => {
  const stub = stubFetch({ read: url => url.includes("/category-price/") ? categoryPriceRead() : new Response(null, { status: 404 }), post: lostReply });
  await openCategoryDrafts(stub, ["1001"]);
  await saveCategoryPrice("15.00");
  const posts = stub.posts;
  assert.equal(posts.length, 1);
  assert.match(pageText(), /unconfirmed/i);
  assert.equal(document.querySelector<HTMLFieldSetElement>("[data-of-category-drafts] fieldset")?.disabled, true, "no fresh Save/Create while the write is unconfirmed");
  await click(button(/^Retry same request$/));
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.requestId, posts[0].body.requestId, "the retry reuses the requestId");
  assert.deepEqual(posts[1], posts[0], "the retry is the identical request");
});

async function preparation(answer: () => Response | Promise<Response>) {
  const stub = stubFetch({ read: () => preparationRead(preparationConfigured("fixture")), post: answer });
  await openPreparation(stub);
  await savePreparationLimits();
  assert.equal(stub.posts.length, 1);
  return stub.posts;
}

test("H2 Preparation: a lost reply or the route's 502 unconfirmed answer keeps the command, and the retry posts the identical body", async () => {
  for (const [label, answer] of [["lost reply", lostReply], ["route 502 unconfirmed", async () => Response.json(ROUTE_UNCONFIRMED, { status: 502 })]] as const) {
    const posts = await preparation(answer);
    assert.match(pageText(), /unconfirmed/i, label);
    await click(button(/^Retry same request$/));
    assert.equal(posts.length, 2, `${label}: retried once by the user`);
    assert.equal(posts[1].body.requestId, posts[0].body.requestId, `${label}: same requestId`);
    assert.deepEqual(posts[1], posts[0], `${label}: identical request`);
  }
});

// The refusal TEXT is not pinned here: the follow-up read clears it (Preparation.tsx:39,60), known-red W1 7b F16.
test("H3 Preparation: a refusal the dashboard raises before upstream clears the pending command and is not called unconfirmed", async () => {
  await preparation(async () => Response.json({ ok: false, error: "Agency scope does not include this account." }, { status: 403 }));
  assert.doesNotMatch(pageText(), /unconfirmed/i);
  assert.equal(hasButton(/^Retry same request$/), false, "a refused write offers no retry");
  assert.equal(button(/^Stop preparation$/)?.disabled, false, "nothing is held after a refusal");
});
