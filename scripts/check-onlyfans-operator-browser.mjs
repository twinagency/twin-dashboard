import assert from "node:assert/strict";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ACCOUNT = "acc-operator", CONVERSATION = "acc-operator:101";
const MANUAL = "Actual operator reply through PostgreSQL and the owned native HTTP peer.";

export async function checkOperator(page, context, origin) {
  await page.goto(`${origin}/onlyfans/inbox?account=${ACCOUNT}`, { waitUntil: "networkidle" });
  await page.locator(`[data-of-conversation-id="${CONVERSATION}"]`).click();
  await page.getByText("Saved operator conversation 101", { exact: true }).last().waitFor();
  const composer = page.locator("[data-of-composer]");
  assert.equal(await composer.isDisabled(), true, "A manual reply requires effective takeover");
  await page.locator('[data-of-action="request_takeover"]').click();
  await page.getByText("Change saved", { exact: true }).waitFor();
  await page.locator('[data-of-action="release_takeover"]').waitFor();
  await page.waitForFunction(() => document.querySelector("[data-of-composer]")?.disabled === false);
  assert.equal(await composer.isEnabled(), true);
  assert.equal(await page.getByText(/is a fixture, and this preview has no delivery authority/).count(), 0);
  const posted = [];
  let firstAck;
  const observe = request => { if (request.url().includes("/api/onlyfans-controls/") && request.method() === "POST") {
    const body = request.postDataJSON(); if (body.action === "manual_message") posted.push(body);
  } };
  page.on("request", observe);
  const lose = async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().action !== "manual_message") return route.continue();
    const response = await route.fetch(); assert.equal(response.status(), 200);
    firstAck = await response.json(); assert.equal(firstAck.outcome, "queued");
    await route.abort("connectionfailed");
  };
  await page.route("**/api/onlyfans-controls/**", lose);
  await composer.fill(MANUAL);
  await page.locator("[data-of-send]").click();
  await page.getByText("Outcome not confirmed", { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await composer.isDisabled(), true, "Uncertain manual acknowledgement must not offer another send");
  await page.unroute("**/api/onlyfans-controls/**", lose);
  await page.locator("[data-of-retry-control]").click();
  await page.getByText("Message queued", { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(posted.length, 2); assert.deepEqual(posted[0], posted[1]); assert.equal(posted[0].body, MANUAL);
  assert.match(posted[0].requestKey, /^[a-f0-9-]{36}$/);
  assert.match(firstAck.intentId, /^[a-f0-9-]{36}$/);
  page.off("request", observe);
  let accepted = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await context.request.get(`${origin}/api/onlyfans/accounts/${ACCOUNT}/conversations/${encodeURIComponent(CONVERSATION)}`);
    assert.equal(response.status(), 200);
    const value = await response.json();
    accepted = value.conversation.messages.some(message => message.body === MANUAL && message.origin === "human" && message.delivery === "sent");
    if (accepted) break; await delay(100);
  }
  assert.equal(accepted, true, "Owned native HTTP acceptance must become one canonical sent bubble");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(`[data-of-conversation-id="${CONVERSATION}"]`).click();
  const sent = page.locator('[data-of-thread] [data-of-message-delivery="sent"]').filter({ hasText: MANUAL });
  await sent.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await sent.count(), 1);
  assert.equal(await composer.inputValue(), "");
  if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "operator-manual-confirmed.png"), fullPage: true });

  await page.goto(`${origin}/onlyfans/campaigns?account=${ACCOUNT}`, { waitUntil: "networkidle" });
  await page.locator("[data-of-campaign-manager]").waitFor();
  await page.getByLabel("Campaign name", { exact: true }).fill("Persistent operator campaign");
  await page.locator("[data-of-campaign-body]").fill("Scheduled native campaign message for the selected saved conversation.");
  await page.locator('input[type="datetime-local"]').fill(new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  await page.locator('[data-of-campaign-recipient="acc-operator:202"]').check();
  const offer = page.locator('[data-of-campaign-offer] option').filter({ hasText: "Operator scenic collection" });
  await offer.waitFor({ state: "attached" });
  await page.locator("[data-of-campaign-offer]").selectOption(await offer.getAttribute("value"));
  let campaignAck;
  const campaignPosts = [];
  const campaignRequest = request => { if (request.url().endsWith(`/accounts/${ACCOUNT}/campaigns`) && request.method() === "POST") campaignPosts.push(request.postDataJSON()); };
  page.on("request", campaignRequest);
  const loseCampaign = async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); assert.equal(response.status(), 200); campaignAck = await response.json(); await route.abort("connectionfailed");
  };
  await page.route(`**/api/onlyfans-campaigns/accounts/${ACCOUNT}/campaigns`, loseCampaign);
  await page.locator("[data-of-create-campaign]").click();
  await page.getByText("The outcome is not confirmed. Retry this same request before making another change.", { exact: false }).waitFor({ timeout: 15000 });
  await page.unroute(`**/api/onlyfans-campaigns/accounts/${ACCOUNT}/campaigns`, loseCampaign);
  await page.getByRole("button", { name: "Retry same request", exact: true }).click();
  const campaignDetail = page.locator(`[data-of-campaign-detail="${campaignAck.campaignId}"]`);
  await campaignDetail.waitFor({ timeout: 15000 });
  assert.equal(campaignPosts.length, 2); assert.deepEqual(campaignPosts[0], campaignPosts[1]);
  assert.equal(await page.locator("[data-of-campaign]").count(), 1, "Lost campaign acknowledgement must not create a second campaign");
  assert.equal(await campaignDetail.locator("[data-of-campaign-status]").innerText(), "scheduled");
  assert.match(await campaignDetail.innerText(), /Operator scenic collection · USD 10\.00/);
  assert.match(await campaignDetail.innerText(), /3 saved media · 1 free previews/);
  for (const [action, status] of [["Pause", "paused"], ["Resume", "scheduled"], ["Cancel remaining", "cancelled"]]) {
    const responsePromise = page.waitForResponse(response => response.url().endsWith(`/campaigns/${campaignAck.campaignId}`) && response.request().method() === "POST");
    await campaignDetail.getByRole("button", { name: action, exact: true }).click();
    assert.equal((await responsePromise).status(), 200);
    await page.waitForFunction(expected => document.querySelector("[data-of-campaign-status]")?.textContent === expected, status);
  }
  const reporting = campaignDetail.locator("[data-of-campaign-reporting]");
  assert.match(await reporting.innerText(), /Fans replied within 24h/);
  assert.match(await reporting.innerText(), /Linked purchases/);
  assert.match(await reporting.innerText(), /Cleared gross revenue/);
  assert.equal(await reporting.getByText("Unavailable", { exact: true }).count(), 3,
    "missing native ledger coverage must not render zero purchases, refunds or revenue");
  assert.match(await campaignDetail.innerText(), /Payment reporting needs current, verified purchase evidence/);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(`[data-of-campaign="${campaignAck.campaignId}"]`).click();
  await page.waitForFunction(() => document.querySelector("[data-of-campaign-status]")?.textContent === "cancelled");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Campaign management overflows mobile");
  if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "campaign-management-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.off("request", campaignRequest);
  await context.clearCookies();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-of-campaign-manager]").count(), 0, "Session loss must remove private campaign data");
  await context.addCookies([{ name: "allie_admin_session", value: process.env.ONLYFANS_TEST_COOKIE, url: origin }]);
  console.log("Operator browser PASS: effective takeover, exact manual lost-ack retry, one canonical provider-confirmed bubble; persisted scheduled campaign audience, lost-ack deduplication, pause/resume/cancel, truthful reporting, session clearing and mobile layout");
}
