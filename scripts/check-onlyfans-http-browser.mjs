import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { checkCombinedEarnings } from "./check-combined-earnings-browser.mjs";
import { checkOnlyFansOverview } from "./check-onlyfans-overview-browser.mjs";
import { checkConfiguration } from "./check-onlyfans-configuration-browser.mjs";
import { checkVaultOrganization } from "./check-onlyfans-vault-organization-browser.mjs";
import { checkVaultPreviews } from "./check-onlyfans-vault-previews-browser.mjs";
import { checkContent } from "./check-onlyfans-content-browser.mjs";
import { checkOperator } from "./check-onlyfans-operator-browser.mjs";
import { checkConnections } from "./check-onlyfans-connections-browser.mjs";
import { checkOfferImport } from "./check-onlyfans-offer-import-browser.mjs";
import { checkContentSync } from "./check-onlyfans-content-sync-browser.mjs";
import { checkNativeLaunchA } from "./check-onlyfans-launch-browser.mjs";
import { checkNativeLaunchB } from "./check-onlyfans-launch-b-browser.mjs";

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "package.json") : new URL("../preview/onlyfans-integration/package.json", import.meta.url));
const { chromium } = require("playwright");
const origin = process.env.ONLYFANS_TEST_WEB_URL;
assert(origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
const options = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
if (process.env.ONLYFANS_TEST_CHROMIUM_MODULE) {
  const { default: portable } = await import(process.env.ONLYFANS_TEST_CHROMIUM_MODULE);
  options.executablePath = process.env.PREVIEW_CHROME || await portable.executablePath();
  // The portable default disables web security and suppresses normal browser
  // Origin behavior. Keep the application's cross-site protection exercised.
  options.args = [...portable.args.filter(arg => arg !== "--disable-web-security"), "--disable-dev-shm-usage"];
} else if (process.env.PREVIEW_CHROME) {
  options.executablePath = process.env.PREVIEW_CHROME;
}
if (process.env.ONLYFANS_TEST_CHROMIUM_LIB_DIR) {
  options.env = { ...process.env, LD_LIBRARY_PATH: process.env.ONLYFANS_TEST_CHROMIUM_LIB_DIR + ":" + (process.env.LD_LIBRARY_PATH ?? "") };
}
const browser = await chromium.launch(options);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const external = [];
  await context.route("**/*", async route => {
    const url = route.request().url();
    if ((url.includes("/api/onlyfans-controls/") || url.includes("/api/onlyfans-configuration/") || url.includes("/api/onlyfans-content/") || url.includes("/api/onlyfans-campaigns/") || url.includes("/api/onlyfans-connections/")) && route.request().method() === "POST") {
      const headers = await route.request().allHeaders();
      assert.equal(headers.origin, origin, "test browser did not supply the normal POST Origin");
    }
    if (!url.startsWith(origin + "/")) { external.push(url); return route.abort(); }
    return route.continue();
  });
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  const page = await context.newPage();
  if (process.env.ONLYFANS_TEST_ONLY_OFFER_IMPORT === "1") {
    // Focused run of the import and content-sync checks on the real harness.
    await page.goto(origin + "/onlyfans/content?account=acc-a", { waitUntil: "domcontentloaded", timeout: 45000 });
    await checkOfferImport(page, context, origin);
    await checkContentSync(page, context, origin);
    assert.equal(external.length, 0, "UI attempted an external request");
    await browser.close();
    process.exit(0);
  }
  await checkCombinedEarnings(page,context,origin);
  await checkOnlyFansOverview(page,origin);
  await page.goto(origin + "/onlyfans/inbox?creator=creator-acc-a&account=acc-a", { waitUntil: "domcontentloaded", timeout: 45000 });
  // Selecting the real conversation causes the detail handler to run.
  await page.locator('[data-of-conversation-id="acc-a:101"]').click();
  await page.getByText("Synthetic PostgreSQL message through the real read path", { exact: true }).waitFor({ timeout: 15000 });
  const manual = page.locator('[data-of-message-id="3"]');
  await manual.getByText("Synthetic manual reply through the shared authority", { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await manual.getAttribute("data-of-message-delivery"), "sent");
  assert(await page.getByText("from an operator", { exact: true }).count());
  assert(await page.getByText("Sent", { exact: true }).count());
  await page.getByText("Retracted synthetic message", { exact: true }).first().waitFor({ timeout: 15000 });
  assert(await page.getByText("Retracted", { exact: true }).count());
  assert(await page.getByText(/Synchronization is incomplete/).count());
  assert.equal(external.length, 0, "UI attempted an external request");
  if (process.env.ONLYFANS_TEST_EVIDENCE) {
    await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "authenticated-inbox.png"), fullPage: true });
  }
  await page.locator('[data-of-conversation-id="acc-a:202"]').click();
  await page.locator('[data-of-incident]').getByText("Delivery needs resolving", { exact: true }).waitFor({ timeout: 15000 });
  assert(await page.locator('[data-of-incident]').getByText("Outcome unknown", { exact: true }).count());
  assert.equal(await page.getByText("Synthetic ambiguous reply without a provider receipt", { exact: false }).count(), 0);
  assert.equal(await page.locator('[data-of-message-delivery="unknown"]').count(), 0, "unknown intents cannot fabricate transcript bubbles");
  await page.locator('[data-of-conversation-id="acc-a:101"]').click();
  await manual.waitFor({ timeout: 15000 });
  // Local controls work on the explicitly disconnected account. Every control
  // is followed by the real canonical read, rather than an optimistic badge.
  const action = name => page.locator(`[data-of-action="${name}"]`);
  const recorded = async name => {
    await action(name).click();
    await page.getByText("Change saved", { exact: true }).waitFor({ timeout: 15000 });
  };
  await recorded("request_takeover");
  await action("release_takeover").waitFor({ timeout: 15000 });
  await recorded("release_takeover");
  await action("pause_automation").waitFor({ timeout: 15000 });
  // Let the real backend commit, then deliberately lose only its HTTP reply.
  let lostReplies = 0;
  const loseAck = async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    lostReplies += 1;
    await route.abort("connectionfailed");
  };
  await page.route("**/api/onlyfans-controls/**", loseAck);
  await action("pause_automation").click();
  await page.getByText("Outcome not confirmed", { exact: true }).waitFor({ timeout: 15000 });
  await action("resume_automation").waitFor({ timeout: 15000 });
  assert.equal(lostReplies, 1);
  await page.unroute("**/api/onlyfans-controls/**", loseAck);
  await page.locator("[data-of-retry-control]").click();
  await page.getByText("Change saved", { exact: true }).waitFor({ timeout: 15000 });
  await recorded("resume_automation");
  await action("pause_automation").waitFor({ timeout: 15000 });
  await recorded("mark_no_contact");
  await page.getByText("No action is available for this conversation right now.", { exact: true }).waitFor({ timeout: 15000 });
  await page.locator('[data-of-conversation-id="acc-a:202"]').click();
  await recorded("request_takeover");
  await page.locator("[data-of-incident]").waitFor();
  assert.equal(await action("release_takeover").count(), 0, "unknown send allowed hand-back");
  assert.equal(await action("resume_automation").count(), 0, "unknown send allowed resume");
  await page.locator('[data-of-action="mark_no_contact"]:enabled').waitFor({ timeout: 15000 });
  await context.clearCookies();
  await action("mark_no_contact").click();
  await page.locator("[data-of-incident]").waitFor({ state: "detached", timeout: 15000 });
  assert.equal(await page.locator("[data-of-incident]").count(), 0, "session loss left private conversation evidence visible");
  assert.equal(await page.locator("[data-of-actions] button").count(), 0);
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  for (const section of ["settings", "content", "sales"]) {
    await page.goto(origin + `/onlyfans/${section}?account=acc-a`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-of-native-section="${section}"]`).waitFor();
    assert.equal(await page.getByText("private transaction source", { exact: false }).count(), 0);
    assert.equal(await page.getByText("private creator config field", { exact: false }).count(), 0);
    if (section === "content") {
      await page.getByRole("tab", { name: "Offers", exact: true }).click();
      assert.equal(await page.locator("[data-of-catalog-item]").count(), 25);
      await page.getByText("Scenic test collection", { exact: true }).waitFor();
      await page.getByText("Terms checked", { exact: true }).waitFor();
      if (process.env.ONLYFANS_TEST_CONTENT === "1") { await checkContent(page, context, origin); await page.getByRole("tab", { name: "Vault", exact: true }).click(); await checkVaultPreviews(page, context, origin); await checkVaultOrganization(page, context, origin); }
      if (process.env.ONLYFANS_TEST_OFFER_IMPORT === "1") { await checkOfferImport(page, context, origin); await checkContentSync(page, context, origin); await page.goto(origin + "/onlyfans/content?account=acc-a", { waitUntil: "domcontentloaded" }); }
      await page.locator("[data-of-next-page]").click();
      await page.waitForURL(url => url.searchParams.has("cursor"));
      await page.waitForFunction(() => document.querySelectorAll("[data-of-catalog-item]").length === 7, undefined, { timeout: 15000 });
      assert.equal(await page.locator("[data-of-catalog-item]").count(), 7);
    }
    if (section === "sales") {
      await page.getByText("Recorded totals by currency and status", { exact: true }).click();
      assert((await page.locator('[data-of-sales-total="USD:cleared"]').innerText()).includes("USD 10.00"));
      assert((await page.locator('[data-of-sales-total="EUR:cleared"]').innerText()).includes("EUR 7.00"));
      assert((await page.locator('[data-of-sales-total="USD:pending"]').innerText()).includes("USD 25.00"));
      assert((await page.locator('[data-of-sales-total="USD:refunded"]').innerText()).includes("USD 6.00"));
      assert.equal(await page.locator("[data-of-sale]").count(), 4);
      await page.getByRole("tab", { name: "Open offers (1)", exact: true }).click();
      assert((await page.locator("[data-of-open-offers]").innerText()).includes("Open offers: 1"));
      assert((await page.locator("[data-of-open-offers]").innerText()).includes("USD 8.00"));
    }
    if (section === "settings") {
      await page.getByRole("tab", { name: "Account", exact: true }).click();
      try {
        await page.locator("[data-of-settings]").getByText("Saved synthetic creator persona for settings.", { exact: true }).waitFor();
      } catch (error) {
        console.log("Settings tab visibility diagnostic", await page.evaluate(() => ({
          tabs: [...document.querySelectorAll('[role="tab"]')].map(element => ({name:element.textContent,selected:element.getAttribute("aria-selected"),disabled:element.hasAttribute("disabled")})),
          panels: [...document.querySelectorAll('[role="tabpanel"]')].map(element => ({id:element.id,hidden:element.hasAttribute("hidden"),display:getComputedStyle(element).display})),
          savedViewAncestors: [...document.querySelectorAll('[data-of-settings]')].map(element => {const rows=[];for(let node=element;node&&rows.length<7;node=node.parentElement)rows.push({tag:node.tagName,role:node.getAttribute("role"),hidden:node.hasAttribute("hidden"),display:getComputedStyle(node).display});return rows;}),
        })));
        throw error;
      }
      await page.getByText("Synthetic Harbor", { exact: true }).waitFor();
      assert((await page.locator("[data-of-settings]").innerText()).includes("2 / 5"));
      if (process.env.ONLYFANS_TEST_CONFIGURATION === "1") { await page.getByRole("tab", { name: "Personality", exact: true }).click(); await checkConfiguration(page, context, origin); }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${section} overflows mobile`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  // Each native screen re-verifies the real session on its next request.
  await context.clearCookies();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("[data-of-native-section]").count(), 0);
  assert.equal(await page.getByText("Synthetic Harbor", { exact: true }).count(), 0);
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  if (process.env.ONLYFANS_TEST_OPERATOR === "1") await checkOperator(page, context, origin);
  if (process.env.ONLYFANS_TEST_WORKER === "1") {
    await page.goto(origin + "/onlyfans/inbox?account=acc-worker", { waitUntil: "domcontentloaded" });
    await page.locator('[data-of-conversation-id="acc-worker:101"]').click();
    await page.getByText("Synthetic inbound processed by the native worker loop", { exact: true }).waitFor();
    const generated = page.locator('[data-of-message-id="9001"]');
    await generated.getByText("Thanks for asking. How has your day been?", { exact: true }).waitFor();
    assert.equal(await generated.getAttribute("data-of-message-delivery"), "sent");
    await page.goto(origin + "/onlyfans/operations?account=acc-worker", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("[data-of-cap]").innerText(), "1 / 3");
    assert.equal(await page.locator("[data-of-model-cost]").innerText(), "USD 0.0007");
    console.log("Worker browser PASS: durable fresh input, native one-call reply, local HTTP acceptance and canonical cost/allowance projection");
  }
  await page.goto(origin + "/onlyfans/operations?account=acc-a", { waitUntil: "domcontentloaded" });
  await page.locator('[data-of-surface="onlyfans-operations"]').waitFor();
  assert.equal(await page.locator('[data-of-metric="Unknown deliveries"]').innerText(), "1");
  assert.equal(await page.locator('[data-of-cap]').innerText(), "2 / 5");
  assert.equal(await page.locator('[data-of-model-cost]').innerText(), "USD 0.0007");
  assert(await page.getByText(/Per-provider daily model cap: USD 1.0000/).count());
  assert(await page.getByText("An earlier delivery outcome needs evidence review.", { exact: true }).count());
  assert(await page.getByText("Purchase evidence needs review or synchronization. Media sales are held.", { exact: true }).count());
  assert(await page.getByText("Provider connection has not been verified.", { exact: true }).count());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-of-model-cost]').scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "operations overflows a mobile viewport");
  if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "operations-mobile.png"), fullPage: true });
  await context.clearCookies();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator('[data-of-cap]').count(), 0, "session loss leaves private operations visible");
  assert.equal(await page.locator('[data-of-model-cost]').count(), 0, "session loss leaves private model costs visible");
  assert.equal(await page.getByText("Retracted synthetic message", { exact: false }).count(), 0);
  assert.equal(await page.getByText("Synthetic manual reply through the shared authority", { exact: false }).count(), 0);
  assert.equal(external.length, 0, "UI attempted an external request");
  if (process.env.ONLYFANS_TEST_CONNECTIONS === "1") {
    await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
    await checkConnections(page, context, origin);
    assert.equal(external.length, 0, "Connection UI attempted an external request");
  }
  if (process.env.ONLYFANS_TEST_DISPOSABLE === "1") {
    await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
    await checkNativeLaunchA(page, context, origin);
    await checkNativeLaunchB(page, context, origin);
    assert.equal(external.length, 0, "Native launch screens attempted an external request");
  }
  console.log("Browser PASS: all scoped controls and identical lost-ack retry; canonical refresh and session loss; native catalogue paging, original-currency sales and saved settings; mobile no overflow; accepted media and payment conflict; private operations; external requests=0");
} finally { await browser.close(); }
