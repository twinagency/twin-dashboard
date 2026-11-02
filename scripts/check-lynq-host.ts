import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { dashboardOrigin, trustedFormOrigin } from "../lib/form-origin";
import { middleware } from "../middleware";
import { POST as moxyLogin } from "../app/moxy/auth/route";

const canonical = "https://dashboard.tgaiclone.xyz";
const lynq = "https://dashboard.lynqai.co";
// Requests as they arrive behind Apache: URL host may be internal, Host header is what matters.
const req = (path: string, host: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) =>
  new NextRequest("http://127.0.0.1:3001" + path, { method: init.method, body: init.body, headers: { host, ...init.headers } });

async function main() {
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://lynq-test.supabase.co", SUPABASE_SERVICE_KEY: "test-key", DASHBOARD_PASSWORD: "offline-admin-password" });
  delete process.env.DASHBOARD_PUBLIC_ORIGIN; delete process.env.DASHBOARD_EXTRA_ORIGINS;

  // Origin allowlist
  assert.equal(dashboardOrigin(req("/", "dashboard.lynqai.co")), lynq);
  assert.equal(dashboardOrigin(req("/", "dashboard.tgaiclone.xyz")), canonical);
  assert.equal(dashboardOrigin(req("/", "evil.example")), canonical);
  assert.equal(dashboardOrigin(req("/", "dashboard.lynqai.co.evil.example")), canonical);
  assert.equal(dashboardOrigin(req("/", "evil.example", { headers: { "x-forwarded-host": "dashboard.lynqai.co", forwarded: "host=dashboard.lynqai.co" } })), canonical, "forwarded host spoof");
  assert.equal(dashboardOrigin(req("/", "127.0.0.1:3001", { headers: { "x-forwarded-host": "dashboard.lynqai.co" } })), canonical);
  assert.equal(dashboardOrigin({ url: "https://dashboard.lynqai.co/" }), canonical, "no headers means canonical");
  process.env.DASHBOARD_EXTRA_ORIGINS = "https://extra.example, http://insecure.example";
  assert.equal(dashboardOrigin(req("/", "extra.example")), "https://extra.example");
  assert.equal(dashboardOrigin(req("/", "insecure.example")), canonical, "http extra origin ignored in production");
  delete process.env.DASHBOARD_EXTRA_ORIGINS;

  const post = (host: string, origin: string | null) => req("/x", host, { method: "POST", headers: origin ? { origin } : {} });
  assert.equal(trustedFormOrigin(post("dashboard.lynqai.co", lynq)), true);
  assert.equal(trustedFormOrigin(post("dashboard.lynqai.co", canonical)), false, "cross-host origin rejected");
  assert.equal(trustedFormOrigin(post("dashboard.lynqai.co", "https://evil.example")), false);
  assert.equal(trustedFormOrigin(post("evil.example", "https://evil.example")), false);
  assert.equal(trustedFormOrigin(post("evil.example", lynq)), false, "lynq origin on foreign host rejected");
  assert.equal(trustedFormOrigin(post("dashboard.tgaiclone.xyz", canonical)), true);
  assert.equal(trustedFormOrigin(post("dashboard.tgaiclone.xyz", lynq)), false);
  assert.equal(trustedFormOrigin(post("dashboard.lynqai.co", null)), false);

  // Middleware redirects
  const loc = (r: Response) => r.headers.get("location");
  let r = await middleware(req("/", "dashboard.lynqai.co"));
  assert.equal(r.status, 307); assert.equal(loc(r), lynq + "/moxy");
  r = await middleware(req("/creator/login?next=%2Fcreator", "dashboard.lynqai.co"));
  assert.equal(loc(r), lynq + "/creator/moxy/login?next=%2Fcreator");
  r = await middleware(req("/twin", "dashboard.lynqai.co"));
  assert.equal(loc(r), canonical + "/twin", "admin login leaves the Moxy host");
  r = await middleware(req("/login?next=%2Frevenue", "dashboard.lynqai.co"));
  assert.equal(loc(r), canonical + "/login?next=%2Frevenue");
  r = await middleware(req("/moxy", "dashboard.lynqai.co"));
  assert.equal(r.status, 200, "Moxy login page still served");
  r = await middleware(req("/creator/moxy/login", "dashboard.lynqai.co"));
  assert.equal(r.status, 200);
  r = await middleware(req("/revenue", "dashboard.lynqai.co"));
  assert.equal(loc(r), lynq + "/moxy", "unauthenticated lynq visitors land on Moxy login");
  r = await middleware(req("/creator", "dashboard.lynqai.co"));
  assert.equal(loc(r), lynq + "/creator/moxy/login?next=%2Fcreator");
  // Canonical host unchanged
  r = await middleware(req("/", "dashboard.tgaiclone.xyz"));
  assert.equal(r.status, 200, "tgaiclone / still serves the Twin login");
  r = await middleware(req("/revenue", "dashboard.tgaiclone.xyz"));
  assert.equal(loc(r), canonical + "/twin?next=%2Frevenue");
  r = await middleware(req("/creator", "dashboard.tgaiclone.xyz"));
  assert.equal(loc(r), canonical + "/creator/login?next=%2Fcreator");
  // Spoofed forwarded host does not unlock lynq behaviour
  r = await middleware(req("/", "dashboard.tgaiclone.xyz", { headers: { "x-forwarded-host": "dashboard.lynqai.co" } }));
  assert.equal(r.status, 200);
  // Creator auth POST from the lynq origin passes middleware; foreign origin is 403
  const creatorPost = (host: string, origin: string) => req("/creator-auth/login", host, { method: "POST", headers: { origin }, body: new URLSearchParams({ email: "a@b.c", password: "x" }) });
  assert.notEqual((await middleware(creatorPost("dashboard.lynqai.co", lynq))).status, 403);
  assert.equal((await middleware(creatorPost("dashboard.lynqai.co", "https://evil.example"))).status, 403);
  assert.equal((await middleware(creatorPost("dashboard.tgaiclone.xyz", lynq))).status, 403);

  // Moxy login POST from the lynq origin is accepted (not 403); evil origin is rejected before any auth call
  const previous = globalThis.fetch; let authCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/token") { authCalls++; return new Response(JSON.stringify({ message: "Invalid login credentials" }), { status: 400, headers: { "content-type": "application/json" } }); }
    if (url.pathname === "/rest/v1/partner_agencies") return new Response(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111" }), { headers: { "content-type": "application/json" } });
    throw new Error("Unexpected request " + url.pathname);
  };
  try {
    const login = (host: string, origin: string) => new NextRequest("http://127.0.0.1:3001/moxy/auth", { method: "POST", headers: { host, origin, accept: "application/json" }, body: new URLSearchParams({ email: "m@example.test", password: "wrong" }) });
    assert.equal((await moxyLogin(login("dashboard.lynqai.co", "https://evil.example"))).status, 403);
    assert.equal(authCalls, 0);
    assert.equal((await moxyLogin(login("dashboard.lynqai.co", lynq))).status, 401, "lynq origin reaches credential check");
    assert.equal(authCalls, 1);
    assert.equal((await moxyLogin(login("dashboard.tgaiclone.xyz", canonical))).status, 401, "tgaiclone unchanged");
    assert.equal((await moxyLogin(login("dashboard.tgaiclone.xyz", lynq))).status, 403);
  } finally { globalThis.fetch = previous; }
  console.log("lynq host checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
