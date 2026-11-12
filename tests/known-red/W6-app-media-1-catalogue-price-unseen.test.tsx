// KNOWN RED (W6 app-media-1, high, data-risk: money): the Mini App catalogue bundle form
// (app/media/MediaManager.tsx:1187-1190, 1260-1262, 1283-1285) creates an enabled-by-default row whose price the operator
// never sees ("Price is set automatically from the selected items."). The server prices it least(2200, sum - cheapest)
// (app/media/catalogue-bundle-actions.ts:40, lib/catalogue-bundle-pricing.ts:8) and the price is immutable afterwards.
// CONDITION: any create; with two 3600-Star items fans pay 2200, less than either item alone.
// FIXED LOOKS LIKE: the form shows catalogueBundlePricing(selected) ("Fans pay 2200 Stars, regular 7200") before Create.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { catalogueBundlePricing } from "../../lib/catalogue-bundle-pricing";
import { baseProps, button, click, load, mount, photo, teardown, w } from "./W6-app-media-1-harness";

before(load);
after(teardown);

async function formWithTwoSelected() {
  w.reset();
  await mount(baseProps("clone-a", { photos: [photo("p1", 3600, "Shower one"), photo("p2", 3600, "Shower two")] }));
  await click(button(/^\+ New Mini App bundle$/));
  const form = button(/^Create$/)?.closest("form");
  assert.ok(form, "catalogue bundle form open");
  for (const caption of ["Shower one", "Shower two"]) {
    const box = [...form.querySelectorAll("label")].find(l => l.textContent?.includes(caption))?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await click(box);
  }
  return form;
}

test("control: selecting two paid photos shows 2 selected and enables Create", async () => {
  const form = await formWithTwoSelected();
  assert.match(form.textContent ?? "", /\b2 of \d+ to \d+ selected/);
  assert.equal(button(/^Create$/)?.disabled, false);
  assert.equal(w.named("createCatalogueBundle").length, 0, "nothing submitted");
});

test("catalogue price unseen: the form shows what fans will pay before Create", async () => {
  const { priceStars, regularStars } = catalogueBundlePricing([3600, 3600]);
  assert.equal(priceStars, 2200, "fixture: two 3600-Star photos price at the 2200 cap");
  const form = await formWithTwoSelected();
  const shown = new RegExp(`\\b${priceStars}\\b|\\b${priceStars.toLocaleString("en-US")}\\b`).test(form.textContent ?? "");
  assert.ok(shown,
    `the create form never shows the fan price (${priceStars} Stars, regular ${regularStars}) for two 3600-Star photos; ` +
    `the operator creates an enabled bundle priced below either item alone without seeing it`);
});
