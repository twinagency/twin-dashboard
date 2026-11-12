// KNOWN RED (W6 app-media-1, high, false-success): BundleCard.addItem (app/media/MediaManager.tsx:954-969, picker at
// :1054-1057) awaits addBundleItem per file with no try/catch, no pending state, outside a transition, and the caller
// clears the picker.
// CONDITION: addBundleItem throws on one file of a multi-file pick (storage or DB error).
// EFFECT: the remaining files are silently skipped, router.refresh() never runs (the successes stay invisible), the
// rejection is unhandled and the operator sees no message.
// FIXED LOOKS LIKE: router.refresh runs after a partial failure (the successes become visible) AND (the rest are still
// attempted OR the failure is shown on the card) AND nothing is unhandled.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary,
// createImageBitmap stubbed (sendable 1000x1000); an unhandled rejection is captured and asserted, not crashed on.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { baseProps, capturingRejections, chooseFiles, load, mount, settle, tabBody, teardown, w } from "./W6-app-media-1-harness";

before(load);
after(teardown);

const bundle = { id: "bundle-1", clone_id: "clone-a", name: "Beach set", caption: null, star_price: 500, is_onboarding: false,
  created_at: "2026-11-01T00:00:00.000Z", photo_bundle_items: [] };
const picker = () => tabBody(/Beach set/).querySelector<HTMLInputElement>('label[aria-label="Add photos to bundle"] input[type="file"]');
/** The one BundleCard (picker label -> items row -> card). */
const card = () => picker()?.closest("label")?.parentElement?.parentElement;
const files = ["one.jpg", "two.jpg", "three.jpg"].map(n => new File([n], n, { type: "image/jpeg" }));

async function addThree(failSecond: boolean) {
  w.reset();
  let n = 0;
  w.impl.addBundleItem = () => { n++; return failSecond && n === 2 ? Promise.reject(new Error("storage down")) : Promise.resolve(); };
  await mount(baseProps("clone-a", { bundles: [bundle] }));
  assert.match(card()?.textContent ?? "", /^Beach set/, "scoped to the bundle card");
  await chooseFiles(picker(), files);
  await settle(30);
  return w.named("addBundleItem").map(c => ((c.args[2] as FormData).get("file") as File).name);
}

test("control: adding three photos to a bundle sends all three and refreshes", async () => {
  const sent = await addThree(false);
  assert.deepEqual(sent, ["one.jpg", "two.jpg", "three.jpg"]);
  assert.equal(w.named("addBundleItem")[0].args[0], "bundle-1");
  assert.ok(w.refreshes >= 1, "router.refresh after the adds");
  assert.deepEqual(w.unhandled, []);
});

test("bundle add partial: one failed add is reported or survived, never silently drops the rest", async () => {
  const sent = await capturingRejections(() => addThree(true));
  const refreshed = w.refreshes >= 1;
  const attemptedRest = sent.includes("three.jpg");
  const shown = /storage down|fail|could not|error/i.test(card()?.textContent ?? "");
  const unhandled = w.unhandled.map(e => (e instanceof Error ? e.message : String(e)));
  assert.ok(refreshed && (attemptedRest || shown) && unhandled.length === 0,
    `addBundleItem failure on file 2 of 3: sent [${sent.join(", ")}], router.refresh calls ${w.refreshes}, ` +
    `error shown on the card ${shown}, unhandled rejections [${unhandled.join(", ")}]`);
});
