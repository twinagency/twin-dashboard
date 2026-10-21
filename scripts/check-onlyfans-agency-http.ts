/** Real Next routes and a fresh browser, with loopback identity/provider fixtures. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";

async function main() {
  const agency = "bc670215-110b-4ea0-8f5c-af3dfe21d253", creator = "11111111-1111-4111-8111-111111111111";
  const manager = "22222222-2222-4222-8222-222222222222", reader = "33333333-3333-4333-8333-333333333333";
  const account = { ...accounts[0], accountId: "acc-a", binding: { ...accounts[0].binding, creatorId: creator, creatorName: "Synthetic Creator" } };
  const initial = Object.values(conversationDetails)[0];
  const detail = { ...initial, accountId: "acc-a", conversationId: "acc-a:101", messages: initial.messages.map(message => ({ ...message, conversationId: "acc-a:101" })), summary: { ...initial.summary, accountId: "acc-a", conversationId: "acc-a:101", revision: 1, automationMode: "human_controlled", takeoverState: "effective" } };
  let memberActive = true, oldBackend = false, writes = 0;
  const backendRequests: { path: string; scope: Record<string, unknown> }[] = [];
  const fixture = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1");
    const json = (value: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    if (url.pathname === "/auth/v1/user") {
      const id = req.headers.authorization === "Bearer synthetic-manager" ? manager : req.headers.authorization === "Bearer synthetic-reader" ? reader : null;
      return id ? json({ id, aud: "authenticated", email: "synthetic@example.invalid", app_metadata: {}, user_metadata: {} }) : json({ message: "Invalid token" }, 401);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1);
      if (table === "agency_memberships") return json(memberActive ? [{ creator_scope: "all", creator_ids: [], creator_access_revision: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", agency_id: agency, can_manage: url.searchParams.get("user_id") === `eq.${manager}` }] : []);
      if (table === "partner_agencies") return json([{ id: agency, name: "Moxy" }]);
      if (table === "agency_creators") return json([{ clone_id: creator }]);
      return json([]);
    }
    if (url.pathname.startsWith("/onlyfans/")) {
      if (oldBackend) return json({ error: "Not found" }, 404);
      assert(url.pathname.startsWith("/onlyfans/agency/v1/"));
      const scope = JSON.parse(String(req.headers["x-onlyfans-agency-scope"]));
      backendRequests.push({ path: url.pathname, scope });
      assert.deepEqual(scope.creatorIds, [creator]);
      res.setHeader("X-OnlyFans-Access-Version", "of-agency.v1");
      if (url.pathname.endsWith("/status")) return json({ ok: true });
      if (url.pathname.includes("acc-b")) return json({ ok: false, code: "unknown_account", error: "Not available" }, 404);
      if (url.pathname.endsWith("/videos/101/stream")) {
        res.writeHead(206, {"Content-Type":"video/mp4", "Content-Length":"4", "Content-Range":"bytes 0-3/8", "X-OnlyFans-Account-Id":"acc-a", "X-OnlyFans-Media-Id":"101", "X-OnlyFans-Video":"vault-video.v1"});
        return res.end(req.method === "HEAD" ? undefined : Buffer.from([0, 1, 2, 3]));
      }
      if (url.pathname.endsWith("/accounts")) return json({ schemaVersion: "of-preview.v2", scope: { creatorId: null, accountId: null }, accounts: [account] });
      if (url.pathname.endsWith("/handover")) return json({ schemaVersion: "of-handover.v1", accountId: "acc-a", conversationId: "acc-a:101", revision: 1,
        mode: "human_controlled", takeoverState: "effective", ownerActor: `agency-user:${agency}:${manager}`, hasMore: false,
        events: [{ action: "request_takeover", mode: "human_controlled", revision: 1, actor: `agency-user:${agency}:${manager}`, at: "2026-10-20T00:00:00Z" }] });
      if (req.method === "POST") {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(body.actor, `agency-user:${agency}:${manager}`); assert.equal(scope.canManage, true); writes++;
        return json({ schemaVersion: "of-controls.v1", ok: true, applied: true, accountId: "acc-a", conversationId: "acc-a:101", action: body.action, commandKey: body.commandKey, recordedRevision: body.expectedRevision + 1 });
      }
      if (url.pathname.endsWith("/conversations")) return json({ schemaVersion: "of-preview.v2", accountId: "acc-a", page: { items: [detail.summary], nextCursor: null } });
      if (url.pathname.endsWith("/acc-a:101") || url.pathname.endsWith("/acc-a%3A101")) return json({ schemaVersion: "of-preview.v2", accountId: "acc-a", conversation: detail });
      return json({ ok: false, error: "Unavailable in fixture" }, 503);
    }
    json({}, 404);
  });
  await new Promise<void>(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const fixturePort = (fixture.address() as { port: number }).port, appPort = 3198;
  const artifacts = join(process.env.TEMP ?? process.cwd(), "twin-agency-browser"); mkdirSync(artifacts, { recursive: true });
  const log = openSync(join(artifacts, "next.log"), "w");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DASHBOARD_PUBLIC_ORIGIN: `http://127.0.0.1:${appPort}`, SUPABASE_URL: `http://127.0.0.1:${fixturePort}`, SUPABASE_SERVICE_KEY: "synthetic-service-key",
      ONLYFANS_API_BASE_URL: `http://127.0.0.1:${fixturePort}`, ONLYFANS_API_TOKEN: "synthetic-read", ONLYFANS_CONTROL_TOKEN: "synthetic-control", ONLYFANS_CONTENT_TOKEN: "synthetic-content" }, stdio: ["ignore", log, log],
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const base = `http://127.0.0.1:${appPort}`;
    for (let i = 0; i < 120; i++) { try { const response = await fetch(base + "/api/onlyfans/accounts"); if (response.status === 401) break; } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    const request = (path: string, token = "synthetic-manager", init: RequestInit = {}) => fetch(base + path, { ...init, redirect: "manual", headers: { Cookie: `twin_agency_access=${token}`, ...init.headers } });
    const response = await request("/api/onlyfans/accounts"); assert.equal(response.status, 200, await response.text());
    assert.equal((await request("/api/onlyfans/accounts/acc-b/conversations")).status, 404);
    const media = "/api/onlyfans-content/accounts/acc-a/vault";
    for (const method of ["GET", "HEAD"]) {
      const video = await request(media + "/videos/101/stream", "synthetic-reader", { method, headers: { Range: "bytes=0-3" } });
      assert.equal(video.status, 206); assert.equal(video.headers.get("content-range"), "bytes 0-3/8");
      assert.equal((await video.arrayBuffer()).byteLength, method === "HEAD" ? 0 : 4);
    }
    for (const suffix of ["previews/101", "videos/101/stream", "uploads"])
      assert.equal((await request(`/api/onlyfans-content/accounts/acc-b/vault/${suffix}`, "synthetic-reader")).status, 404);
    const post = { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause_automation", expectedRevision: 1 }) };
    for (const suffix of ["uploads", "videos/101", "sync"])
      assert.equal((await request(media + "/" + suffix, "synthetic-reader", post)).status, 403);
    const control = "/api/onlyfans-controls/accounts/acc-a/conversations/acc-a:101";
    assert.equal((await request(control, "synthetic-reader", post)).status, 403); assert.equal(writes, 0);
    assert.equal((await request(control, "synthetic-manager", { ...post, headers: { ...post.headers, Origin: "https://untrusted.invalid" } })).status, 403);
    const accepted = await request(control, "synthetic-manager", post); assert.equal(accepted.status, 200, await accepted.text()); assert.equal(writes, 1);
    oldBackend = true;
    assert.equal((await request(control, "synthetic-manager", post)).status, 503); assert.equal(writes, 1);
    oldBackend = false; memberActive = false;
    assert.notEqual((await request("/api/onlyfans/accounts")).status, 200);
    memberActive = true;
    const history = await (await request("/api/onlyfans/accounts/acc-a/conversations/acc-a:101/handover")).json();
    assert.equal(history.owner, "you"); assert(!JSON.stringify(history).includes(manager));
    browser = await chromium.launch({ executablePath: process.env.PREVIEW_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext(); await context.addCookies([{ name: "twin_agency_access", value: "synthetic-manager", url: base }]);
    const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/onlyfans/inbox?account=acc-a", { waitUntil: "domcontentloaded", timeout: 120000 });
    try { await page.getByText("You are handling replies", { exact: true }).waitFor({ timeout: 30000 }); }
    catch (error) { console.log("BROWSER", await page.locator("body").innerText(), "ERRORS", errors); await page.screenshot({ path: join(artifacts, "failure.png"), fullPage: true }); throw error; }
    await page.getByText("Activity history", { exact: true }).click();
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 1024) {
        await page.locator('[data-of-mobile-panel="conversations"]').click();
        await page.locator('[data-of-conversation-id="acc-a:101"]').click();
        assert(await page.locator('[data-of-thread]').isVisible());
        assert.equal(await page.locator('[data-of-mobile-panel="chat"]').getAttribute("aria-pressed"), "true");
        await page.screenshot({ path: join(artifacts, `chat-${width}.png`), fullPage: true });
        await page.locator('[data-of-mobile-panel="controls"]').click();
        await page.getByText("You are handling replies", {exact:true}).waitFor();
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Overflow at ${width}px`);
      await page.screenshot({ path: join(artifacts, `handover-${width}.png`), fullPage: true });
    }
    assert.equal(await page.locator('[data-channel-link="of-operations"]').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    const readContext = await browser.newContext(); await readContext.addCookies([{ name: "twin_agency_access", value: "synthetic-reader", url: base }]);
    const readerPage = await readContext.newPage();
    await readerPage.goto(base + "/onlyfans/inbox?account=acc-a", {waitUntil:"domcontentloaded"});
    await readerPage.getByText("Another team member is handling replies", {exact:true}).waitFor();
    assert.equal(await readerPage.locator('[data-of-action]:enabled').count(), 0);
    assert(await readerPage.locator('[data-of-composer]').isDisabled());
    assert(await readerPage.locator('[data-of-send]').isDisabled());
    await readContext.close();
    assert(backendRequests.length > 0);
    console.log("PASS real Next agency routes: scoped reads, read-only/CSRF denial, staff actor, revoked membership, rollout refusal, private history, and desktop/mobile handover");
  } finally { await browser?.close(); child.kill(); fixture.closeAllConnections(); await new Promise<void>(resolve => fixture.close(() => resolve())); closeSync(log); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

