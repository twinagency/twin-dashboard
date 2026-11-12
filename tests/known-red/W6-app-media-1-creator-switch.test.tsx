// KNOWN RED (W6 app-media-1, blocker, data-risk+security): per-creator client state survives a creator switch.
// app/media/MediaManager.tsx:1655-1659 (PricingTab guide/savedGuide are useState initialisers only), :263/:406 (upload
// queues), :1487-1488 (selections); <MediaManager> has no key and nothing inside resets on cloneId.
// CONDITION: an operator on cookie-scoped /media switches creator with the header CloneSwitcher while the tree stays
// mounted (revalidate re-renders the same element with new props). EFFECT: the Pricing grid keeps creator A's prices, so
// one edit + Save writes A's 16 category prices onto B; a file queued (not uploaded) under A uploads into B's library.
// FIXED LOOKS LIKE: the per-creator tree is keyed by cloneId (inside MediaManager or at every mount), so after the switch
// the grid shows B's saved guide and A's queue is gone (or at least never uploads under B). The runtime check is primary;
// a key= on every <MediaManager> mount in components/CloneMediaPage.tsx (source text) also counts as fixed, since this
// test re-renders MediaManager directly and cannot see the page's key.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { baseProps, button, chooseFiles, click, guide, load, mount, rerender, tabBody, teardown, w } from "./W6-app-media-1-harness";

before(load);
after(teardown);

const pricingValues = () => [...tabBody(/Category pricing/).querySelectorAll<HTMLInputElement>('input[type="number"]')].map(i => i.value);
const A = () => baseProps("clone-a", { categoryPricing: guide(700) });
const B = () => baseProps("clone-b", { categoryPricing: guide(1900) });
/** The mount-side fix: every <MediaManager> element in components/CloneMediaPage.tsx carries key= (source text). */
function everyMountKeyed(): boolean {
  const source = readFileSync(new URL("../../components/CloneMediaPage.tsx", import.meta.url), "utf8");
  const tags = [...source.matchAll(/<MediaManager\b[\s\S]*?\/>/g)].map(m => m[0]);
  return tags.length > 0 && tags.every(tag => /\skey=/.test(tag));
}
const videoInput = () => tabBody(/Add videos/).querySelector<HTMLInputElement>('input[type="file"]');

test("control: the Pricing grid shows the mounted creator's saved guide", async () => {
  await mount(A());
  const values = pricingValues();
  assert.ok(values.length >= 10, "pricing inputs rendered");
  assert.ok(values.every(v => v === "700"), `creator A's guide shown, got ${values.join(",")}`);
  await mount(B());
  assert.ok(pricingValues().every(v => v === "1900"), "a fresh mount for B shows B's guide");
});

test("creator switch: the Pricing grid shows creator B's prices after switching from A", async () => {
  await mount(A());
  await rerender(B());
  const values = pricingValues();
  assert.ok(values.every(v => v === "1900") || everyMountKeyed(),
    `after switching to clone-b the Pricing grid still shows clone-a's prices (${[...new Set(values)].join(",")}); Save would write them onto clone-b`);
});

test("creator switch: a video queued under creator A never uploads under creator B", async () => {
  w.reset();
  await mount(A());
  await chooseFiles(videoInput(), [new File(["a"], "a-private.mp4", { type: "video/mp4" })]);
  assert.ok(button(/^Upload 1 video$/), "queued under A");
  await rerender(B());
  const upload = button(/^Upload \d+ videos?$/);
  if (upload) await click(upload);
  const leaked = w.named("uploadVideo").filter(c => c.args[0] === "clone-b").map(c => ((c.args[1] as FormData).get("file") as File).name);
  if (everyMountKeyed()) return;
  assert.deepEqual(leaked, [], `creator A's queued file uploaded into clone-b's library: ${leaked.join(",")}`);
});
