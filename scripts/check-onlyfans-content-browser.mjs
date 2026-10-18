import assert from "node:assert/strict";
import path from "node:path";

/** Runs against the real Next/API/PostgreSQL fixture, with synthetic catalogue rows. */
export async function checkContent(page, context, origin) {
  const editor = page.locator("[data-of-content-editor]").first();
  const itemId = await editor.getAttribute("data-of-content-editor");
  assert(itemId && /^[1-9][0-9]*$/.test(itemId));
  const endpoint = `/api/onlyfans-content/accounts/acc-a/items/${itemId}`;
  const original = await page.evaluate(async endpoint => (await (await fetch(endpoint)).json()).item, endpoint);
  assert.equal(original.isFreeTeaser, false);
  await editor.locator("[data-of-edit-content-open]").click();
  const label = editor.locator("[data-of-edit-content-label]");
  const description = editor.locator("[data-of-edit-content-description]");
  const price = editor.locator("[data-of-edit-content-price]");
  const enabled = editor.locator("[data-of-edit-content-enabled]");
  const save = editor.locator("[data-of-save-content]");
  const notice = editor.locator("[data-of-content-notice]");
  await label.waitFor(); assert.equal(await label.inputValue(), original.label);
  await label.fill("Updated synthetic collection"); await description.fill("Updated neutral scenic collection."); await price.fill("10.07");
  await save.click(); await notice.filter({ hasText: "Save recorded." }).waitFor();
  await page.locator(`[data-of-catalog-item="${itemId}"]`).getByText("Updated synthetic collection", { exact: true }).waitFor();
  assert((await page.locator(`[data-of-catalog-item="${itemId}"]`).innerText()).includes("USD 10.07"));

  let lost = 0; const posted = [];
  const lose = async route => {
    if (route.request().method() !== "POST") return route.continue();
    assert.equal((await route.request().allHeaders()).origin, origin);
    posted.push(route.request().postData());
    const response = await route.fetch(); assert.equal(response.status(), 200); lost++;
    await route.abort("connectionfailed");
  };
  await page.route("**/api/onlyfans-content/**", lose);
  await enabled.uncheck(); await save.click();
  await notice.filter({ hasText: "Save outcome not confirmed." }).waitFor(); assert.equal(lost, 1);
  await page.unroute("**/api/onlyfans-content/**", lose);
  let retried;
  const capture = request => { if (request.url().includes("/api/onlyfans-content/") && request.method() === "POST") retried = request.postData(); };
  page.on("request", capture); await editor.locator("[data-of-retry-content]").click();
  await notice.filter({ hasText: "Save recorded." }).waitFor(); page.off("request", capture);
  assert.equal(retried, posted[0], "retry changed the exact original catalogue command");
  assert.equal(await enabled.isChecked(), false);

  const concurrent = await page.evaluate(async endpoint => {
    const item = (await (await fetch(endpoint)).json()).item;
    return (await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { label: "Concurrent synthetic collection" }, expectedRevision: item.revision, expectedFingerprint: item.fingerprint }) })).status;
  }, endpoint);
  assert.equal(concurrent, 200);
  await description.fill("A stale description must not overwrite current metadata."); await save.click();
  await notice.filter({ hasText: "Catalogue item changed." }).waitFor();
  assert.equal(await label.inputValue(), "Concurrent synthetic collection");
  assert.equal(await description.inputValue(), "Updated neutral scenic collection.");
  await page.setViewportSize({ width: 390, height: 844 });
  await save.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "catalogue editor overflows mobile");
  if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "content-editor-mobile.png"), fullPage: true });
  await description.fill("Must not save after session loss."); await context.clearCookies(); await save.click();
  await page.locator('[data-of-native-section="content"]').waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-of-edit-content-label]").count(), 0);
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  await page.goto(origin + "/onlyfans/content?account=acc-a", { waitUntil: "networkidle" });
  const restored = await page.evaluate(async ({ endpoint, original }) => {
    const item = (await (await fetch(endpoint)).json()).item;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { label: original.label, description: original.description, priceCents: original.priceCents, enabled: original.enabled },
        expectedRevision: item.revision, expectedFingerprint: item.fingerprint }) });
    return response.status;
  }, { endpoint, original });
  assert.equal(restored, 200); await page.reload({ waitUntil: "networkidle" });
  await page.getByText(original.label, { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("Content browser PASS: real saved label/description/exact price/enabled, exact lost-ack retry, concurrent conflict refresh, session clearing and mobile layout");
}
