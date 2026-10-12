import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { chromium, webkit } from "playwright";
import { NextRequest } from "next/server";
import { GET, HEAD, POST } from "../app/admin-access/route";
import { verifyOwnerSession } from "../lib/owner-auth";

async function main() {
  const token = "owner_" + "a".repeat(64); // synthetic, never provisioned
  const expectedHash = createHash("sha256").update(token).digest("hex");
  const originalFetch = globalThis.fetch;
  let accepted = true;
  let offline = false;
  let rpcCalls = 0;
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://owner-test.invalid",
    SUPABASE_SERVICE_KEY: "test-server-key", DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.flirtaiagency.com" });
  globalThis.fetch = async (input, init) => {
    rpcCalls++;
    assert.equal(String(input), "https://owner-test.invalid/rest/v1/rpc/dashboard_owner_session_verify");
    assert.equal(JSON.parse(String(init?.body)).p_session_hash, expectedHash);
    assert.equal(init?.cache, "no-store");
    if (offline) throw new Error("test offline");
    return Response.json(accepted);
  };
  const origin = "https://dashboard.flirtaiagency.com";
  const request = (body: string, extra: Record<string,string> = {}) => new NextRequest(origin + "/admin-access", {
    method: "POST", headers: { host: new URL(origin).host, origin, "content-type": "text/plain", ...extra }, body });
  const denied = async (req: NextRequest, status: number) => {
    const response = await POST(req);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
  };
  try {
    const entry = await GET(new NextRequest(origin + "/admin-access"));
    const html = await entry.text();
    assert.equal(entry.headers.get("set-cookie"), null);
    assert.match(entry.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.match(entry.headers.get("cache-control")!, /no-store/);
    assert.equal(entry.headers.get("referrer-policy"), "no-referrer");
    assert.ok(!html.includes(token));
    assert.equal((await HEAD()).headers.get("set-cookie"), null);
    assert.equal(rpcCalls, 0);
    await denied(request(token, { origin: "https://attacker.invalid" }), 403);
    await denied(request(token, { origin: "null" }), 403);
    await denied(request(token, { "next-action": "anything" }), 403);
    await denied(request(token, { "content-type": "application/json" }), 400);
    await denied(request(token, { "content-length": "100000" }), 400);
    await denied(request("owner_fake"), 401);
    await denied(request("signed-master-or-creator-token"), 401);
    assert.equal(rpcCalls, 0);
    let response = await POST(request(token));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).destination, origin + "/revenue");
    const cookie = response.cookies.get("allie_admin_session")!;
    assert.equal(cookie.value, token);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    for (const name of ["twin_creator_session", "twin_creator_portal", "twin_agency_access", "twin_agency_portal", "clone_scope", "twin_admin_view_as"])
      assert.equal(response.cookies.get(name)?.value, "", `clear ${name}`);
    accepted = false; // revoked, expired, disabled or another independent database
    await denied(request(token), 401);
    offline = true;
    await denied(request(token), 401);
    offline = false;
    accepted = true;

    // Use actual browser fragment handling, CSP, fetch, cookies and navigation.
    Object.assign(process.env, { NODE_ENV: "development" });
    const seen: string[] = [];
    const server = createServer(async (req, res) => {
      try {
        seen.push(req.url || "");
        assert.ok(!String(req.url).includes(token));
        assert.ok(!String(req.headers.referer || "").includes(token));
        const localOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
        if (req.url === "/revenue") {
          const raw = String(req.headers.cookie || "").match(/allie_admin_session=([^;]+)/)?.[1];
          const valid = raw ? await verifyOwnerSession(raw) : false;
          res.writeHead(valid ? 200 : 401, { "Content-Type": "text/html", "Cache-Control": "no-store" });
          res.end(valid ? "<h1>Admin overview</h1>" : "<h1>Sign in required</h1>");
          return;
        }
        if (req.url !== "/admin-access") { res.writeHead(404).end(); return; }
        let body = "";
        for await (const chunk of req) body += chunk;
        const next = new NextRequest(localOrigin + req.url, { method: req.method,
          headers: new Headers(req.headers as Record<string,string>), ...(req.method === "POST" ? { body } : {}) });
        const result = req.method === "POST" ? await POST(next) : await GET(next);
        res.statusCode = result.status;
        for (const [key,value] of result.headers) if (key !== "set-cookie") res.setHeader(key,value);
        const cookies = result.headers.getSetCookie();
        if (cookies.length) res.setHeader("set-cookie",cookies);
        res.end(await result.text());
      } catch (error) { res.writeHead(500).end(String(error)); }
    });
    await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const local = `http://127.0.0.1:${address.port}`;
    process.env.DASHBOARD_PUBLIC_ORIGIN = local;
    try {
      for (const engine of (process.env.OWNER_SHORTCUT_BROWSERS || "chromium").split(",")) {
        const browser = await (engine === "webkit" ? webkit : chromium).launch({
          ...(engine === "chromium" && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
          ...(engine === "chromium" ? { args: ["--no-sandbox"] } : {}),
        });
        try {
          const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await context.addCookies(["twin_creator_session", "twin_agency_access", "clone_scope", "twin_admin_view_as"]
            .map(name => ({ name, value: "old-test-session", url: local })));
          await page.goto(local + "/admin-access#" + token);
          await page.getByRole("heading", { name: "Admin overview" }).waitFor();
          assert.equal(page.url(), local + "/revenue");
          const cookies = await context.cookies();
          assert.ok(cookies.some(c => c.name === "allie_admin_session" && c.httpOnly));
          assert.ok(!cookies.some(c => ["twin_creator_session", "twin_agency_access", "clone_scope", "twin_admin_view_as"].includes(c.name)));
          await page.goto(local + "/admin-access");
          await page.getByRole("heading", { name: "Admin overview" }).waitFor();
          accepted = false;
          await page.goto(local + "/admin-access#" + token);
          await page.getByRole("heading", { name: "This link is unavailable" }).waitFor();
          assert.equal(page.url(),local + "/admin-access");
          await page.goto(local + "/revenue");
          await page.getByRole("heading", { name: "Sign in required" }).waitFor();
          accepted = true;
          await context.clearCookies();
          await page.goto(local + "/admin-access#bad");
          await page.getByRole("heading", { name: "This link is unavailable" }).waitFor();
          assert.ok(!(await context.cookies()).some(c => c.name === "allie_admin_session"));
          assert.deepEqual(errors, []);
        } finally { await browser.close(); }
        console.log(`${engine}: fragment handoff, cookies, navigation, remembered session and revocation passed`);
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    console.log("Owner shortcut: invalid credentials/origins, fail-closed verification, private responses and role-cookie cleanup passed");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
