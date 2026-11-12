// KNOWN RED (W1 lane 7b F3, REVIEW.md inv 7 "Stale work: a 409 is shown" and "Unconfirmed is not refused (D7)": an unconfirmed
// outcome is shown as unconfirmed). EngineUnresolved.tsx:86 `onReconcile` calls `reload()`, which sets `loading` (:65) and unmounts every
// Row; the Row's `setResult` (:17) lands on a gone component. The refusal text and the "unconfirmed" warning are never shown; the row comes
// back with an empty note and an enabled button. Fixed (copy not pinned: backend text or a status/alert saying refused/changed/not saved…) = the outcome of the reconcile is visible after the list settles.
// Measured: if the reload GET answers inside the same act() flush as the POST, React batches loading+ready and the text survives (green);
// so the reload here answers one render later, as any real network read does. That is the browser path, not a stricter rule.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, injected fetchImpl, no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { click, mount, pageText, refusalShown, settle, stubFetch, type } from "../helpers/w1-7b-dom";

const page = JSON.parse(readFileSync(new URL("../contracts/fixtures/engine-unresolved-live.json", import.meta.url), "utf8"));
const ROW = { ...page, nextCursor: null, items: [page.items[0]] }; // supportedActions ["mark_reconciled"], revision 3, environment live
/** The list reload after the write answers only when released, as a real network read does: React renders in between. */
async function reconcile(answer: () => Response, revisionAfter = 3) {
  const stub = stubFetch({ holdReadsAfter: 1, post: answer,
    read: (_url, n) => Response.json(n === 0 ? ROW : { ...ROW, items: [{ ...ROW.items[0], revision: revisionAfter }] }) });
  const { default: Panel } = await import("../../components/onlyfans-preview/EngineUnresolved");
  await mount(<Panel accountId="of-a" canAct fetchImpl={stub.fetch} />);
  await settle();
  await type(document.querySelector("input[aria-label='Reconciliation evidence']"), "Receipt matches the provider message");
  await click(document.querySelector("[data-engine-reconcile]"));
  await settle();
  stub.release();
  await settle();
  assert.ok(document.querySelector("[data-engine-unresolved-row]"), "the list has settled again");
  return stub.posts;
}

test("control: Mark reconciled posts once, with the note and the page environment", async () => {
  const posts = await reconcile(() => Response.json({ schemaVersion: "of-engine-operator.v1", ok: true, outcome: "recorded" }));
  assert.equal(posts.length, 1);
  assert.match(posts[0].url, /\/api\/onlyfans-controls\/accounts\/of-a\/conversations\/of-a%3A42\/requests\/0a1b2c3d-1111-4222-8333-444455556661$/);
  assert.deepEqual(posts[0].body, { action: "mark_reconciled", expectedRevision: 3, note: "Receipt matches the provider message", environment: "live" });
});

test("F3a: a refusal from the operator route is still shown after the list reloads", async () => {
  const posts = await reconcile(() => Response.json({ schemaVersion: "of-engine-operator.v1", ok: false, outcome: "refused", error: "Request 42 changed" }, { status: 409 }), 4); // a real 409: the revision moved
  assert.equal(posts.length, 1);
  const { shown, seen } = refusalShown(document.body, "Request 42 changed"); // backend text, or any status/alert saying refused/changed/...
  assert.equal(shown, true, `the refusal must stay visible after the reload; ${seen}`);
});

test("F3b: an unreadable reply is shown as unconfirmed after the list reloads", async () => {
  const posts = await reconcile(() => new Response("<html>bad gateway</html>", { status: 502 }));
  assert.equal(posts.length, 1);
  assert.match(pageText(), /unconfirmed/i, `an unreadable reply must leave an "unconfirmed" warning; page says: ${pageText()}`);
});
