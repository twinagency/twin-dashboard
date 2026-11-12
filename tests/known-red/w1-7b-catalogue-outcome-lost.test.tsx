// KNOWN RED (W1 lane 7b F7, REVIEW.md inv 7 "Stale work: a 409 is shown, never auto-retried"): EngineCatalogue.tsx:90 reloads after a
// decision; a 409 means the item moved on, so the reload carries revision+1, the row key `itemId:revision` (:46) changes and React remounts
// the row, dropping "This item changed…" (:17). The refusal is shown only when the revision did NOT change, the case that needs it least.
// Fixed (copy not pinned: backend text or a status/alert saying refused/changed/not saved…) = the refusal stays visible after the reload, whatever the new revision, AND the revision-0 confirmation is still dropped
// (an itemId-only row key would keep confirmed=true across revisions: stale work). Team's Claude owns the fix.
// Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, injected fetchImpl, no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { click, mount, pageText, refusalShown, settle, stubFetch } from "../helpers/w1-7b-dom";

const page = JSON.parse(readFileSync(new URL("../contracts/fixtures/engine-catalogue.json", import.meta.url), "utf8"));
/** Approve item 11 (proposed, revision 0) at its proposed price; the decision is refused; the reload answers one render later. */
async function approveRefused(revisionAfter: number) {
  const stub = stubFetch({ holdReadsAfter: 1,
    read: (_url, n) => Response.json(n === 0 ? page : { ...page, items: page.items.map((item: { itemId: string }) => item.itemId === "11" ? { ...item, revision: revisionAfter } : item) }),
    post: () => Response.json({ ok: false, outcome: "refused", error: "This item changed" }, { status: 409 }) });
  const { default: Catalogue } = await import("../../components/onlyfans-preview/EngineCatalogue");
  await mount(<Catalogue accountId="of-a" readOnly={false} fetchImpl={stub.fetch} />);
  await settle();
  const row = document.querySelector("[data-engine-catalogue-item='11']");
  await click(row?.querySelector("input[aria-label='Confirm price']"));
  await click(row?.querySelector("[data-engine-approve]"));
  await settle();
  stub.release();
  await settle();
  assert.equal(stub.posts.length, 1, "the decision is posted once");
  assert.match(stub.posts[0].url, /\/engine-catalogue\/11$/);
  assert.equal(stub.reads, 2, "the list was reloaded after the decision");
}

test("control: a refusal whose reload returns the item at the same revision stays visible", async () => {
  await approveRefused(0);
  assert.match(pageText(), /This item changed/);
});

/** Stale work (REVIEW inv 7): a confirmation given at revision 0 must not carry over to revision 1, so a fix must not key rows by itemId alone. */
function assertConfirmationDropped() {
  const row = document.querySelector("[data-engine-catalogue-item='11']");
  assert.equal(row?.querySelector<HTMLInputElement>("input[aria-label='Confirm price']")?.checked, false, "the revision-0 price confirmation is dropped at revision 1");
  assert.equal(row?.querySelector<HTMLButtonElement>("[data-engine-approve]")?.disabled, true, "Approve needs a fresh confirmation at revision 1");
}

test("control: a reload that returns the item at revision+1 drops the earlier price confirmation", async () => {
  await approveRefused(1);
  assertConfirmationDropped();
});

test("F7: a refusal whose reload returns the item at revision+1 stays visible", async () => {
  await approveRefused(1);
  assertConfirmationDropped();
  const { shown, seen } = refusalShown(document.querySelector("[data-engine-catalogue-item='11']"), "This item changed"); // copy not pinned
  assert.equal(shown, true, `the 409 must stay shown after the reload; ${seen}`);
});
