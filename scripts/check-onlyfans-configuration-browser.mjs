import assert from "node:assert/strict";
import path from "node:path";

export async function checkConfiguration(page, context, origin) {
  const editor = page.locator("[data-of-configuration-editor]");
  const persona = editor.locator("[data-of-edit-persona]");
  const city = editor.locator('[data-of-edit-fact="home_city"]');
  const save = editor.locator("[data-of-save-configuration]");
  const notice = editor.locator("[data-of-configuration-notice]");
  await persona.waitFor(); assert.equal(await city.inputValue(), "Synthetic Harbor");
  await editor.locator('[data-of-inherit-fact="home_city"]').click();
  await notice.filter({ hasText: "Save recorded." }).waitFor();
  assert.equal(await city.inputValue(), "Current city: Shared Twin city");
  await page.locator("[data-of-settings]").getByText("Current city: Shared Twin city", { exact: true }).waitFor();
  await persona.fill("Updated approved synthetic creator persona."); await city.fill("Updated Synthetic Harbor");
  await save.click(); await notice.filter({ hasText: "Save recorded." }).waitFor();
  await page.locator("[data-of-settings]").getByText("Updated Synthetic Harbor", { exact: true }).waitFor();
  await editor.locator("[data-of-edit-model]").selectOption("grok-4-1-fast-non-reasoning");
  await save.click(); await notice.filter({ hasText: "Save recorded." }).waitFor();
  // Lose the response only after the actual transaction has committed.
  let lost = 0; const requests = [];
  const lose = async route => {
    if (route.request().method() !== "POST") return route.continue();
    assert.equal((await route.request().allHeaders()).origin, origin);
    requests.push(route.request().postData());
    const response = await route.fetch(); assert.equal(response.status(), 200); lost += 1;
    await route.abort("connectionfailed");
  };
  await page.route("**/api/onlyfans-configuration/**", lose);
  await city.fill("Retried Synthetic Harbor"); await save.click();
  await notice.filter({ hasText: "Save outcome not confirmed." }).waitFor(); assert.equal(lost, 1);
  await page.unroute("**/api/onlyfans-configuration/**", lose);
  let retried;
  const capture = request => { if (request.url().includes("/api/onlyfans-configuration/") && request.method() === "POST") retried = request.postData(); };
  page.on("request", capture);
  await editor.locator("[data-of-retry-configuration]").click();
  await notice.filter({ hasText: "Save recorded." }).waitFor(); page.off("request", capture);
  assert.equal(retried, requests[0], "retry changed the original configuration command");
  const external = await page.evaluate(async () => {
    const endpoint = "/api/onlyfans-configuration/accounts/acc-a";
    const metadata = (await (await fetch(endpoint)).json()).configuration;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { creatorFacts: { home_city: "Concurrent Synthetic Harbor" } }, expectedRevision: metadata.configurationRevision, expectedFingerprint: metadata.fingerprint }) });
    return response.status;
  });
  assert.equal(external, 200);
  await persona.fill("Stale persona must not overwrite current settings."); await save.click();
  await notice.filter({ hasText: "Configuration changed." }).waitFor();
  assert.equal(await persona.inputValue(), "Updated approved synthetic creator persona.");
  assert.equal(await city.inputValue(), "Concurrent Synthetic Harbor");
  await page.setViewportSize({ width: 390, height: 844 });
  await save.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "configuration editor overflows mobile");
  if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "configuration-mobile.png"), fullPage: true });
  // Session loss on a write removes both editable and parent read data.
  await city.fill("Must not save after session loss"); await context.clearCookies(); await save.click();
  await page.locator("[data-of-settings]").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-of-edit-persona]").count(), 0);
  assert.equal(await page.getByText("Concurrent Synthetic Harbor", { exact: true }).count(), 0);
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  await page.goto(origin + "/onlyfans/settings?account=acc-a", { waitUntil: "domcontentloaded" });
  await page.getByText("Advanced account details", { exact: true }).click();
  await page.locator("[data-of-settings]").waitFor();
  console.log("Configuration browser PASS: shared Twin inheritance, partial persona/facts, saved model, one-event lost-ack retry, concurrent conflict refresh, session-loss clearing and mobile layout");
}
