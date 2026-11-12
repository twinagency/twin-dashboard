// KNOWN RED (W1 lane 7b F2, REVIEW.md inv 7 "Unconfirmed is not refused (D7)": only upstream 400/401/403/404/405/409/410/413/422 prove
// a write was not applied; any other status or an unreadable body reads "unconfirmed"). CategoryDrafts.tsx:29,34-38: a bodiless/HTML 503
// (`status>=500&&status!==503`) or a 200 whose body is not JSON takes the "refused" branch, clears the retry (:37), and the next save mints a
// fresh requestId (:61,:67) → new commandKey → possible duplicate write. Fixed = both read unconfirmed and keep "Retry same request".
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, global fetch stubbed, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { button, categoryPriceRead, click, hasButton, openCategoryDrafts, pageText, saveCategoryPrice, stubFetch } from "../helpers/w1-7b-dom";

async function savePrice(answer: () => Response) {
  const stub = stubFetch({ read: url => url.includes("/category-price/") ? categoryPriceRead() : new Response(null, { status: 404 }), post: answer });
  await openCategoryDrafts(stub, []);
  await saveCategoryPrice("15.00");
  assert.equal(stub.posts.length, 1, "the price write is posted once");
  assert.match(stub.posts[0].url, /\/vault\/category-price\/7$/);
  return stub;
}

test("control: a readable 409 refusal reads refused and offers no retry (D7: 409 proves not applied)", async () => {
  await savePrice(() => Response.json({ ok: false, outcome: "refused", error: "The category changed." }, { status: 409 }));
  assert.match(pageText(), /refused/i);
  assert.equal(hasButton(/^Retry same request$/), false, "a 409 refusal offers no retry");
});

test("F2a: an HTML 503 from a proxy after the write reads unconfirmed and keeps Retry same request", async () => {
  const stub = await savePrice(() => new Response("<html>bad gateway</html>", { status: 503, headers: { "Content-Type": "text/html" } }));
  assert.match(pageText(), /unconfirmed/i, `a 503 without a readable outcome must read unconfirmed; page says: ${document.querySelector("[role=status]")?.textContent}`);
  assert.ok(hasButton(/^Retry same request$/), "a Retry same request control is kept for the unconfirmed write");
  await click(button(/^Retry same request$/));
  assert.equal(stub.posts[1]?.body.requestId, stub.posts[0].body.requestId, "the retry reuses the same requestId");
});

test("F2b: a 200 whose body cannot be read reads unconfirmed and keeps Retry same request", async () => {
  await savePrice(() => new Response("not json", { status: 200 }));
  assert.match(pageText(), /unconfirmed/i, `an unreadable 200 must read unconfirmed; page says: ${document.querySelector("[role=status]")?.textContent}`);
  assert.ok(hasButton(/^Retry same request$/), "a Retry same request control is kept for the unconfirmed write");
});
