import assert from "node:assert/strict";
import path from "node:path";

/** Uses owned synthetic capture material only. No provider verification is invoked. */
export async function checkConnections(page, context, origin) {
  const owner = "99123456", accountId = `of-${owner}`;
  const capture = { headers: { user_id: owner, user_agent: "Synthetic test agent", x_bc: "synthetic-only-bc", x_of_rev: "synthetic-only-rev" },
    signing: { rules: { static_param: "synthetic-only-static", start: "synthetic-start", end: "synthetic-end", checksum_indexes: Array(32).fill(1), checksum_constant: 1 } },
    cookies: [{ name: "sess", value: "synthetic-browser-only-session", domain: ".onlyfans.com", path: "/" }] };
  const captureFile = { name: "synthetic-session.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(capture)) };
  await page.goto(origin + "/onlyfans/accounts", { waitUntil: "networkidle" });
  const registration = page.locator("[data-of-register-connection]");
  await registration.getByRole("button", { name: "Add OnlyFans account", exact: true }).click();
  const option = await registration.locator("[data-of-register-creator] option:not([disabled])").first().getAttribute("value");
  assert(option, "fixture must expose a real synthetic Twin creator through the identity owner");
  await registration.locator("[data-of-register-creator]").selectOption(option);
  await registration.locator("[data-of-register-owner]").fill(owner);
  await registration.locator("[data-of-register-handle]").fill("synthetic-owner");
  const delayedAccounts=async route=>{
    if(new URL(route.request().url()).searchParams.get("account")!==accountId)return route.continue();
    const response=await route.fetch();
    await new Promise(resolve=>setTimeout(resolve,500));
    await route.fulfill({response});
  };
  await page.route("**/api/onlyfans/accounts?*",delayedAccounts);
  await registration.locator("[data-of-register-submit]").click();
  const card = page.locator(`[data-of-account-id="${accountId}"]`);
  await card.waitFor({ timeout: 15000 });
  assert.equal(new URL(page.url()).searchParams.get("account"),accountId,"an older accounts list replaced the newly registered selection");
  await page.unroute("**/api/onlyfans/accounts?*",delayedAccounts);
  const editor = card.locator(`[data-of-connection-editor="${accountId}"]`);
  await editor.locator("[data-of-connection-open]").click();
  await editor.locator("[data-of-connection-status]").getByText("Credentials not saved", { exact: true }).waitFor();
  await editor.locator("[data-of-connection-capture]").setInputFiles(captureFile);
  await editor.locator("[data-of-connection-hash]").fill("synthetic-browser-only-hash");
  assert.equal(await editor.locator("[data-of-connection-hash]").getAttribute("type"), "password");
  await editor.locator("[data-of-connection-save]").click();
  const notice = editor.locator("[data-of-connection-notice]");
  await notice.filter({ hasText: "Credential save recorded." }).waitFor();
  await editor.locator("[data-of-connection-status]").getByText("Awaiting worker verification", { exact: true }).waitFor();
  assert.equal(await editor.locator("[data-of-connection-hash]").inputValue(), "");
  assert.equal(await editor.locator("[data-of-connection-capture]").inputValue(), "");
  assert(await editor.locator("[data-of-connection-activate]").isDisabled(), "unverified account offered outgoing activation");
  const endpoint = `/api/onlyfans-connections/accounts/${accountId}`;
  const read = await page.evaluate(async endpoint => await (await fetch(endpoint)).json(), endpoint);
  assert.equal(read.connection.status, "pending"); assert.equal(read.connection.outgoingEnabled, false);
  assert(!JSON.stringify(read).includes("synthetic-browser-only-session")); assert(!JSON.stringify(read).includes("synthetic-browser-only-hash"));
  assert.equal(Object.hasOwn(read.connection, "capture"), false);

  let lost = 0; const requests = [];
  const lose = async route => {
    if (route.request().method() !== "POST") return route.continue();
    assert.equal((await route.request().allHeaders()).origin, origin); requests.push(route.request().postData());
    const response = await route.fetch(); assert.equal(response.status(), 200); lost++; await route.abort("connectionfailed");
  };
  await page.route("**/api/onlyfans-connections/accounts/*", lose);
  await editor.locator("[data-of-connection-verify]").click();
  await notice.filter({ hasText: "Outcome not confirmed." }).waitFor(); assert.equal(lost, 1);
  await page.unroute("**/api/onlyfans-connections/accounts/*", lose);
  let retried; const captureRequest = request => { if (request.url().endsWith(endpoint) && request.method() === "POST") retried = request.postData(); };
  page.on("request", captureRequest); await editor.locator("[data-of-connection-retry]").click();
  await notice.filter({ hasText: "Verification requested." }).waitFor(); page.off("request", captureRequest);
  assert.equal(retried, requests[0], "connection retry changed the exact original command");
  await editor.locator("[data-of-connection-pause]").click(); await notice.filter({ hasText: "Pause recorded." }).waitFor();
  await editor.locator("[data-of-connection-status]").getByText("Connection paused", { exact: true }).waitFor();
  const refused = await page.evaluate(async endpoint => {
    const connection = (await (await fetch(endpoint)).json()).connection;
    return (await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", payload: { limitUnits: 1, throttleSeconds: 60, mediaEnabled: false }, expectedRevision: connection.revision }) })).status;
  }, endpoint);
  assert.equal(refused, 409, "unverified or paused connection activated through the API");
  await page.setViewportSize({ width: 390, height: 844 }); await editor.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "connection editor overflows mobile");
  if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "connection-editor-mobile.png"), fullPage: true });
  await editor.locator("[data-of-connection-capture]").setInputFiles(captureFile);
  await editor.locator("[data-of-connection-hash]").fill("synthetic-must-not-save-after-session-loss");
  await context.clearCookies(); await editor.locator("[data-of-connection-save]").click();
  await page.locator("[data-of-account-id]").first().waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-of-connection-hash]").count(), 0);
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("Connection browser PASS: existing creator registration, write-only capture save, pending verification, activation refusal, exact lost-ack retry, pause, mobile and session-loss clearing");
}
