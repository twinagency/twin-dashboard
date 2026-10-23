import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Launch B browser check (sections D memory, E automation) at 390px and desktop.
 * Needs a running dashboard: ONLYFANS_TEST_WEB_URL=http://127.0.0.1:PORT, ONLYFANS_TEST_COOKIE=<operator session>,
 * and the harness pages app/launch-b-harness/{automation,memory}/page.tsx (not committed; the shared pages come from the head dev).
 * Reads of /api/onlyfans/** and the control POST are answered by a stateful synthetic backend; /api/onlyfans-launch/** hits the real routes.
 * Optional: ONLYFANS_TEST_EVIDENCE (screenshot directory), PREVIEW_CHROME.
 */
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const origin = process.env.ONLYFANS_TEST_WEB_URL, cookie = process.env.ONLYFANS_TEST_COOKIE;
assert(origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && cookie);
const shot = async (page, name) => { if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, name), fullPage: true }); };
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
let checks = 0; const ok = (value, message) => { assert(value, message); checks++; };
const eq = (a, b, message) => { assert.equal(a, b, message); checks++; };

const ACCOUNTS = [{ accountId: "acc-a", health: "connected", automationMode: "automated", binding: { handle: "@account_a" } },
  { accountId: "acc-b", health: "expired_session", automationMode: "paused", binding: { handle: "@account_b" } }];
function backend() {
  const state = { convs: { "acc-a": [mk("acc-a", 1, "Alice Fan"), mk("acc-a", 2, "Bob Fan", { automationMode: "paused" }), mk("acc-a", 3, "Cara Fan", { automationMode: "human_controlled", takeoverState: "effective" })],
    "acc-b": [mk("acc-b", 1, "Only B Fan")] }, delayA: 0, conflictNext: false, posts: [], denied: false };
  function mk(acc, n, name, extra = {}) { return { conversationId: `${acc}:${n}`, accountId: acc, revision: 3, fan: { fanId: String(n), displayName: name, shortRef: `f${n}` }, automationMode: "automated", takeoverState: "none", lastActivityAt: "2026-10-22T00:00:00Z", requiresAttention: false, ...extra }; }
  async function handle(route) {
    const req = route.request(), url = new URL(req.url()), p = decodeURIComponent(url.pathname);
    const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (state.denied) return send({ ok: false, error: "Sign in again." }, 401);
    if (p === "/api/onlyfans/accounts") return send({ accounts: ACCOUNTS });
    let m = p.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations$/);
    if (m) { if (m[1] === "acc-a" && state.delayA) await new Promise(r => setTimeout(r, state.delayA)); return send({ accountId: m[1], page: { items: state.convs[m[1]], nextCursor: null } }); }
    m = p.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/workspace\/settings$/);
    if (m) return send({ schemaVersion: "of-workspace.v2", section: "settings", accountId: m[1], runtimeEnabled: false, historyRecoveryRequired: true, providerConnectionVerified: true, deliveryPolicy: { revision: 1, enabled: false, mediaEnabled: false, usedUnits: 0, limitUnits: 100 }, configuration: null });
    m = p.match(/^\/api\/onlyfans-controls\/accounts\/([^/]+)\/conversations\/(.+)$/);
    if (m && req.method() === "POST") {
      const body = JSON.parse(req.postData()); state.posts.push({ account: m[1], conversation: m[2], ...body });
      if (state.conflictNext) { state.conflictNext = false; return send({ ok: false, outcome: "refused", error: "The conversation changed or has an active hold. Refresh before trying again." }, 409); }
      const c = state.convs[m[1]].find(x => x.conversationId === m[2]);
      const to = { pause_automation: { automationMode: "paused" }, resume_automation: { automationMode: "automated" }, request_takeover: { takeoverState: "effective", automationMode: "human_controlled" }, release_takeover: { takeoverState: "none", automationMode: "automated" }, mark_no_contact: { automationMode: "no_contact" } }[body.action];
      Object.assign(c, to, { revision: c.revision + 1 });
      return send({ schemaVersion: "of-controls.v1", ok: true, applied: true, commandKey: "a".repeat(64), accountId: m[1], conversationId: m[2], action: body.action, recordedRevision: body.expectedRevision + 1 });
    }
    return route.continue();
  }
  return { state, handle };
}

const options = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
if (process.env.PREVIEW_CHROME) options.executablePath = process.env.PREVIEW_CHROME;
const browser = await chromium.launch(options);
try {
  // --- real launch routes: auth gate and contract_pending, no fabricated data ---
  const bare = await browser.newContext(), authed = await browser.newContext();
  await authed.addCookies([{ name: "allie_admin_session", value: cookie, url: origin }]);
  const urls = ["/api/onlyfans-launch/memory/accounts/acc-a/fans", "/api/onlyfans-launch/memory/accounts/acc-a/fans/9001", "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups"];
  for (const u of urls) {
    const anon = await bare.request.get(origin + u, { maxRedirects: 0 }); ok([301, 302, 303, 307, 308, 401, 403].includes(anon.status()), `${u} must refuse anonymous (got ${anon.status()})`);
    const r = await authed.request.get(origin + u); eq(r.status(), 501, u); const body = await r.json(); eq(body.code, "contract_pending", u); ok(!("fans" in body) && !("followUps" in body), "no fabricated data");
  }
  const noOrigin = await authed.request.post(origin + "/api/onlyfans-launch/automation/accounts/acc-a/emergency-stop", { data: { action: "stop" } });
  eq(noOrigin.status(), 403, "write without same-origin is refused");
  const bad = await authed.request.get(origin + "/api/onlyfans-launch/memory/accounts/bad%20id!/fans"); eq(bad.status(), 400, "bad account id");
  const goodWrite = await authed.request.post(origin + "/api/onlyfans-launch/automation/accounts/acc-a/emergency-stop", { data: { action: "stop" }, headers: { origin } });
  eq(goodWrite.status(), 501, "emergency stop never reports success"); eq((await goodWrite.json()).code, "contract_pending");
  const patch = await authed.request.patch(origin + "/api/onlyfans-launch/memory/accounts/acc-a/fans/9001", { data: { factId: "f1", value: "x", expectedRevision: 1 }, headers: { origin } });
  eq(patch.status(), 501, "fact correction never reports success");
  await bare.close(); await authed.close();

  for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile390", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "allie_admin_session", value: cookie, url: origin }]);
    const external = []; const b = backend();
    await context.route("**/*", route => { const u = route.request().url(); if (!u.startsWith(origin + "/")) { external.push(u); return route.abort(); } return u.includes("/api/onlyfans") && !u.includes("/api/onlyfans-launch/") ? b.handle(route) : route.continue(); });
    const page = await context.newPage();

    // ---------- E: automation, manager ----------
    await page.goto(origin + "/launch-b-harness/automation?manage=1", { waitUntil: "networkidle", timeout: 90000 });
    await page.locator('[data-b-conversation="acc-a:1"]').waitFor({ timeout: 20000 });
    eq(await page.locator('[data-b-account-mode]').getAttribute("data-b-account-mode"), "automated", "account mode shown");
    ok(await page.locator("[data-b-runtime]").innerText() === "Disabled", "runtime read from settings");
    ok(await fits(page), `${label}: no horizontal scroll (automation)`);
    await shot(page, `automation-${label}.png`);
    // pause via keyboard
    const pause = page.locator('[data-b-conversation="acc-a:1"] [data-b-action="pause_automation"]');
    await pause.focus(); await page.keyboard.press("Enter");
    await page.locator('[data-b-conversation="acc-a:1"] [data-b-mode="paused"]').waitFor({ timeout: 10000 });
    eq(b.state.posts.at(-1).action, "pause_automation"); eq(b.state.posts.at(-1).expectedRevision, 3, "command states the revision it was decided on");
    ok((await page.locator("[data-b-notice]").innerText()).includes("Pause recorded"));
    ok(await page.locator('[data-b-conversation="acc-a:1"] [data-b-action="resume_automation"]').isEnabled(), "resume enabled after refresh");
    ok(!(await pause.isEnabled()), "pause disabled once paused");
    // takeover + hand back
    await page.locator('[data-b-conversation="acc-a:2"] [data-b-action="request_takeover"]').click();
    await page.locator('[data-b-conversation="acc-a:2"]').getByText("Human has control").waitFor({ timeout: 10000 });
    await page.locator('[data-b-conversation="acc-a:3"] [data-b-action="release_takeover"]').click();
    await page.locator('[data-b-conversation="acc-a:3"] [data-b-mode="automated"]').waitFor({ timeout: 10000 });
    // conflict: refused with refresh, no optimistic state
    b.state.conflictNext = true;
    await page.locator('[data-b-conversation="acc-a:1"] [data-b-action="resume_automation"]').click();
    await page.getByText(/changed or is on hold/).waitFor({ timeout: 10000 });
    eq(await page.locator('[data-b-conversation="acc-a:1"] [data-b-mode]').getAttribute("data-b-mode"), "paused", "refused command did not change shown mode");
    // no-contact needs confirm, Cancel keeps it
    await page.locator('[data-b-conversation="acc-a:2"] [data-b-action="mark_no_contact"]').click();
    const before = b.state.posts.length;
    await page.getByRole("button", { name: "Cancel" }).click(); eq(b.state.posts.length, before, "cancel sends nothing");
    await page.locator('[data-b-conversation="acc-a:2"] [data-b-action="mark_no_contact"]').click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.locator('[data-b-conversation="acc-a:2"] [data-b-mode="no_contact"]').waitFor({ timeout: 10000 });
    eq(await page.locator('[data-b-conversation="acc-a:2"] button:enabled').count(), 0, "no-contact conversation has no enabled action");
    // follow-ups: pending until fixture opted in
    await page.locator('[data-b-card="follow-ups"] [data-b-contract-pending]').waitFor({ timeout: 20000 }); checks++;
    eq(await page.locator("[data-b-followup]").count(), 0, "no follow-up rows before opt-in");
    await page.locator("[data-b-show-fixture]").click();
    await page.locator("[data-b-fixture-banner]").waitFor();
    ok((await page.locator("[data-b-fixture-banner]").innerText()).includes("FIXTURE-ONLY"));
    await page.getByRole("button", { name: /Cancel follow-up/ }).first().click();
    ok(await page.getByText("Cancelled in this preview only").count() >= 1);
    eq(b.state.posts.filter(p => p.action === "cancel").length, 0, "fixture cancel reaches no backend");
    await shot(page, `automation-fixture-followups-${label}.png`);
    // emergency stop is honest
    await page.locator("[data-b-emergency]").click(); await page.getByRole("button", { name: "Confirm stop" }).click();
    await page.getByText(/not connected yet. Nothing was stopped/).waitFor({ timeout: 10000 });
    ok(await fits(page), `${label}: no horizontal scroll after actions`);
    await shot(page, `automation-after-${label}.png`);

    // account switching + stale response: slow acc-a read must never paint under acc-b
    await page.goto(origin + "/launch-b-harness/automation?manage=1", { waitUntil: "domcontentloaded" });
    await page.locator("#b-auto-acct").waitFor({ timeout: 20000 });
    b.state.delayA = 2500;
    await page.locator("#b-auto-acct").selectOption("acc-b"); await page.locator("#b-auto-acct").selectOption("acc-a"); await page.locator("#b-auto-acct").selectOption("acc-b");
    await page.locator('[data-b-conversation="acc-b:1"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(3200);
    eq(await page.locator('[data-b-conversation^="acc-a:"]').count(), 0, "stale acc-a response is dropped");
    eq(await page.locator('[data-b-account-mode]').getAttribute("data-b-account-mode"), "paused", "acc-b mode shown");
    b.state.delayA = 0;
    // write in flight while switching: the reply must not touch the new account's screen
    // read-only manager state
    await page.goto(origin + "/launch-b-harness/automation?manage=0", { waitUntil: "networkidle" });
    await page.locator('[data-b-conversation="acc-a:3"]').waitFor({ timeout: 20000 });
    ok((await page.locator("[data-b-readonly]").innerText()).includes("Read-only"));
    eq(await page.locator('[data-b-conversation] button:enabled').count(), 0, "read-only: no enabled conversation action");
    ok(await page.locator("[data-b-emergency]").isDisabled(), "read-only: emergency stop disabled");
    await shot(page, `automation-readonly-${label}.png`);
    // session loss
    b.state.denied = true; await page.reload({ waitUntil: "networkidle" });
    await page.getByText(/Sign in again/).first().waitFor({ timeout: 15000 }); checks++; b.state.denied = false;

    // ---------- D: memory ----------
    await page.goto(origin + "/launch-b-harness/memory?manage=1", { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-b-contract-pending]").waitFor({ timeout: 20000 });
    eq(await page.locator("[data-b-fan]").count(), 0, "no fans before fixture opt-in");
    await page.locator("[data-b-show-fixture]").click();
    await page.locator("[data-b-fixture-banner]").waitFor();
    await page.locator('[data-b-coverage="partial"]').first().waitFor();
    await shot(page, `memory-coverage-${label}.png`);
    await page.locator('[data-b-fan="9001"]').click();
    await page.locator('[data-b-fact="f1"]').waitFor();
    ok((await page.locator("[data-b-summary]").innerText()).includes("FIXTURE summary"));
    ok(await page.getByRole("button", { name: "Correct Spend tier" }).isDisabled(), "non-editable field cannot be corrected");
    await page.getByRole("button", { name: "Correct Preferred name" }).click();
    await page.locator("#fact-f1").fill("   "); await page.keyboard.press("Enter");
    await page.getByRole("alert").filter({ hasText: "Enter a value" }).waitFor();
    await page.locator("#fact-f1").fill("Alexander"); await page.keyboard.press("Enter");
    await page.getByText("Changed in this fixture preview only").waitFor();
    ok(await page.locator('[data-b-fact="f1"]').getByText("Alexander").count() === 1);
    await shot(page, `memory-fan-${label}.png`);
    await page.locator('[data-b-fan="9003"]').click();
    await page.locator('[data-b-card="fan"] [data-b-state="empty"]').first().waitFor();
    ok(await fits(page), `${label}: no horizontal scroll (memory)`);
    // account switch clears fixture + fan
    await page.locator("#b-mem-acct").selectOption("acc-b");
    eq(await page.locator("[data-b-fan]").count(), 0, "switching account clears fixture fans");
    await page.locator("[data-b-contract-pending]").waitFor();
    // read-only memory
    await page.goto(origin + "/launch-b-harness/memory?manage=0", { waitUntil: "networkidle" });
    await page.locator("[data-b-show-fixture]").click(); await page.locator('[data-b-fan="9001"]').click(); await page.locator('[data-b-fact="f1"]').waitFor();
    ok(await page.getByRole("button", { name: "Correct Preferred name" }).isDisabled(), "read-only cannot correct");
    eq(external.length, 0, "no external requests");
    await context.close();
  }
  console.log(`check-onlyfans-launch-b-browser: ${checks} assertions passed, 0 failed, 0 skipped (desktop + 390px)`);
} finally { await browser.close(); }
