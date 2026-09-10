import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { signCreatorSession } from "../lib/creator-session";

const origin = "http://localhost:3107";
const own = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const accountId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const authId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const stamp = "2026-09-10T00:00:00.000Z";
const account = { id: accountId, auth_user_id: authId, display_name: "Review Creator", email: "creator@example.test", account_status: "active" };
const clone = { id: own, slug: "review-creator", name: "Review Creator", status: "active", bot_token: null, intake: { fields: {} }, created_at: stamp, updated_at: stamp, ai_mode: "smart", starting_credits: 0 };
const trace: { path: string; method: string; query: string }[] = [];
let writes = 0;
let unready = false;
let unlinked = false;

async function main() {
  mkdirSync("creator-review", { recursive: true });
  process.env.CREATOR_SESSION_SECRET = "offline-browser-review-secret-never-used-in-production";
  const db = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost:54329");
    trace.push({ path: url.pathname, method: req.method || "GET", query: url.search });
    if (!["GET", "HEAD"].includes(req.method || "GET") && !url.pathname.includes("/rpc/")) writes++;
    const table = url.pathname.split("/").pop();
    let data: unknown = [];
    if (table === "creator_accounts") data = { ...account, account_status: unready ? "applicant" : "active" };
    else if (table === "creator_clone_links") data = unlinked ? null : { clone_id: own, clones: { name: clone.name, status: clone.status } };
    else if (table === "creator_agency_assignments") data = { agency_id: "review-agency", partner_agencies: { name: "Tether", slug: "tether" } };
    else if (table === "creator_applications") data = { id: "review-application", status: unready ? "draft" : "submitted", answers: {} };
    else if (table === "creator_onboarding_progress") data = { questionnaire_completed: true, content_completed: true, voice_completed: true };
    else if (table === "creator_consents") data = { id: "review-consent", legal_name: "Review Creator", signed_at: stamp };
    else if (table === "clones") {
      const selected = url.searchParams.get("id");
      const scoped = url.searchParams.getAll("and").join("");
      const object = String(req.headers.accept).includes("object+json") || selected === `eq.${own}`;
      data = selected === `eq.${own}` || scoped.includes(own) ? object ? clone : [clone] : [];
    } else if (url.pathname.includes("/rpc/") && table?.includes("all_time_stars")) data = 0;
    // All other fixture tables/RPCs are empty, so the actual reporting code
    // assembles a valid empty ledger instead of a hand-maintained fake UI payload.
    res.writeHead(200, { "content-type": "application/json", "content-range": "0-0/0" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
  });
  await new Promise<void>(resolve => db.listen(54329, "127.0.0.1", resolve));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3107"], {
    env: { ...process.env, NODE_ENV: "production", SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_KEY: "offline-key", DASHBOARD_PASSWORD: "offline-unrelated-admin-password" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(origin + "/creator/login")).ok) break; } catch { /* Wait for Next. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const token = await signCreatorSession(accountId, authId);
    await context.addCookies([{ name: "twin_creator_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // FX is not the behaviour under test and must not require external exchange-rate access.
    await page.route("**/api/fx", route => route.fulfill({ contentType: "application/json", body: '{"usd_to_aud":1.5}' }));
    const dataPromise = page.waitForResponse(response => response.url().includes("/api/dashboard?") && response.request().method() === "GET", { timeout: 60000 });
    await page.goto(origin + "/creator");
    const dataResponse = await dataPromise;
    const data = await dataResponse.json();
    assert.equal(dataResponse.status(), 200, JSON.stringify(data));
    assert.ok(data.totals && data.analytics, "The native revenue API must produce both data halves");
    assert.ok(data.clones.every((c: { id: string }) => c.id === own));
    assert.equal(data.totals.stars, 0);
    await page.getByRole("heading", { name: "Earnings overview" }).waitFor();
    const nav = page.locator('nav[aria-label="Creator navigation"]:visible');
    assert.deepEqual(await nav.locator("a").allTextContents(), ["Earnings", "PPVs", "Business", "Info", "Logs", "Edit"]);
    const core = page.locator(".creator-core-hero canvas:visible");
    assert.equal(await core.count(), 1);
    const frame1 = await core.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.waitForTimeout(500);
    const frame2 = await core.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    assert.notEqual(frame1, frame2, "The native Core sphere must be animating");
    const oneDay = page.waitForResponse(response => response.url().includes("/api/dashboard?") && response.url().includes("period=1D"));
    await page.getByRole("button", { name: "1D", exact: true }).click();
    assert.equal((await oneDay).status(), 200);
    await page.getByRole("button", { name: "Line chart", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Line chart", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Bar chart", exact: true }).click();
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "creator-review/earnings-desktop.png", fullPage: true });
    for (const destination of ["ppvs", "business", "info", "logs", "edit"]) {
      await page.goto(origin + `/creator/${destination}`);
      assert.equal(await page.getByRole("heading", { name: "This creator page could not load." }).count(), 0, `${destination} failed`);
      assert.equal(await page.locator(".creator-dashboard-shell").count(), 1);
    }
    for (const name of ["Configuration", "Monetization", "Advanced", "View"]) assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
    await page.screenshot({ path: "creator-review/identity-desktop.png", fullPage: true });
    for (const path of ["/creator/edit?tab=config", "/creator/edit?tab=identity&tab=money", `/api/dashboard?clone=${other}`, `/creator/data/dashboard?cloneId=${other}`, "/api/models", "/users", `/clones/${own}?tab=config`]) {
      const response = await context.request.get(origin + path, { maxRedirects: 0 });
      assert.equal(response.status(), 403, `${path} should be denied`);
    }
    const forged = await context.request.post(origin + "/creator-auth/identity", { headers: { origin }, form: { name: "Forged", revision: stamp, text_model: "forged", clone_id: other } });
    assert.equal(forged.status(), 403);
    assert.equal(writes, 0, "Read-only review and forged writes must not modify any fixture data");
    await page.goto(origin + "/creator/info");
    await page.getByRole("link", { name: "View onboarding", exact: true }).click();
    await page.waitForURL("**/creator/onboarding");
    assert.equal(await page.locator(".creator-dashboard-shell").count(), 0);
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByRole("heading", { name: "Earnings overview" }).waitFor();
    assert.equal(await page.locator(".creator-dashboard-shell").count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const mobile = page.getByRole("dialog", { name: "Creator navigation", exact: true });
    await mobile.waitFor();
    assert.deepEqual(await mobile.locator("nav a").allTextContents(), ["Earnings", "PPVs", "Business", "Info", "Logs", "Edit"]);
    await page.screenshot({ path: "creator-review/sidebar-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Close navigation", exact: true }).click();
    await page.screenshot({ path: "creator-review/earnings-mobile.png", fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, "No page-level horizontal overflow");
    unlinked = true;
    const unlinkedResponse = await context.request.get(origin + "/creator/data/dashboard?period=1D");
    const empty = await unlinkedResponse.json();
    assert.equal(unlinkedResponse.status(), 200, JSON.stringify(empty));
    assert.deepEqual(empty.clones, []);
    unready = true;
    assert.equal((await context.request.get(origin + "/creator/data/dashboard")).status(), 403);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("Creator browser checks passed: native earnings API/UI, animated orb, presets/chart/custom controls, all six pages, identity guards, forged scope denial, onboarding navigation and mobile layout. No production accounts or data used.");
  } finally {
    writeFileSync("creator-review/server.log", output);
    writeFileSync("creator-review/fixture-requests.json", JSON.stringify(trace, null, 2));
    await browser?.close();
    server.kill("SIGTERM");
    await new Promise<void>(resolve => db.close(() => resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
