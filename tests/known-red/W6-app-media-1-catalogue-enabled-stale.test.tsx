// KNOWN RED (W6 app-media-1, high, false-success): CatalogueBundleRowCard (app/media/MediaManager.tsx:1146, 1165) shows
// "N Stars (was M) … Enabled" for a bundle the catalogue no longer lists.
// CONDITION: after creation an item in the bundle is repriced (single edit, bulk price, PricingTab Apply), made free or
// deleted; projectBundle (lib/catalogue-commerce.ts:14,17) then returns null, so the bundle is hidden and a buy is 409
// (lib/catalogue-api.ts:236,326), yet the card still reads Enabled.
// FIXED LOOKS LIKE: the card renders validity against current item prices (lib/miniapp-rollout-data.ts:153 already has
// isValid) and does not present a delisted bundle as live.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { projectItem } from "../../lib/catalogue-core";
import { projectBundle } from "../../lib/catalogue-commerce";
import { baseProps, load, mount, photo, teardown } from "./W6-app-media-1-harness";

before(load);
after(teardown);

const bundle = { id: "cb-1", title: "Shower duo", caption: null, media_kind: "photo" as const, photo_ids: ["p1", "p2"], video_ids: [],
  price_stars: 2200, regular_stars: 7200, enabled: true };
const listed = (photos: ReturnType<typeof photo>[]) => projectBundle(bundle, photos.map(p => projectItem(p, "photo"))) !== null;

async function card(photos: ReturnType<typeof photo>[]) {
  await mount(baseProps("clone-a", { photos, catalogueBundles: [bundle] }));
  const title = [...document.querySelectorAll("div")].find(d => d.children.length === 0 && d.textContent === "Shower duo");
  assert.ok(title, "card renders its title");
  const row = title.parentElement?.parentElement;
  assert.ok(row, "card row");
  return { text: row.textContent ?? "", toggle: [...row.querySelectorAll("button")].map(b => b.textContent?.trim()) };
}

test("control: a bundle whose items still price to 2200 is listed and its card shows Enabled", async () => {
  const photos = [photo("p1", 3600), photo("p2", 3600)];
  assert.equal(listed(photos), true, "projectBundle lists it");
  const { toggle } = await card(photos);
  assert.ok(toggle.includes("Enabled"), `toggle reads Enabled: ${toggle.join(",")}`);
});

test("catalogue enabled stale: a bundle delisted by an item reprice is not shown as live Enabled", async () => {
  const photos = [photo("p1", 600), photo("p2", 600)];
  assert.equal(listed(photos), false, "fixture: 2200 != min(2200, 1200 - 600), projectBundle hides it");
  const { text, toggle } = await card(photos);
  const warned = /not (listed|sellable|shown)|invalid|delisted|hidden|out of date|stale/i.test(text);
  assert.ok(!toggle.includes("Enabled") || warned,
    `catalogue bundle card claims "Enabled" with no warning for a bundle the catalogue no longer lists (items now 600+600, stored price 2200): "${text}"`);
});
