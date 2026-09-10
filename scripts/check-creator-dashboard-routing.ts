import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";
import { SESSION_COOKIE, signSession } from "../lib/session";
import { isCreatorPath, safeCreatorNext } from "../lib/creator-routing";
async function main() {
  Object.assign(process.env, { NODE_ENV: "production", CREATOR_SESSION_SECRET: "offline-routing-fixture-secret", DASHBOARD_PASSWORD: "offline-other-admin-fixture" });
  const origin = "https://dashboard.tgaiclone.xyz";
  const token = await signCreatorSession("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  const cookie = `${CREATOR_SESSION_COOKIE}=${token}`;
  const request = (path: string, method = "GET", extra: Record<string, string> = {}) => new NextRequest(origin + path, { method, headers: { cookie, origin, ...extra } });
  for (const path of ["/creator-management", "/creator-management/abc", "/creator-foreign", "/creator-auth/signup", "/creatorish"]) {
    assert.equal(isCreatorPath(path), false, path);
    assert.equal(safeCreatorNext(path), "/creator", path);
  }
  for (const path of ["/creator", "/creator/edit", "/creator/ppvs", "/creator/onboarding"]) {
    assert.equal(isCreatorPath(path), true);
    const response = await middleware(request(path));
    assert.equal(response.status, 200);
    assert.equal(response.cookies.has(CREATOR_SESSION_COOKIE), false);
  }
  for (const path of ["/creator-management", "/creator-management/abc", "/users", "/api/models", "/settings", "/creator/edit?tab=config", "/creator/edit?tab=identity&tab=money"]) assert.equal((await middleware(request(path))).status, 403, path);
  const api = await middleware(request("/api/dashboard?period=1D"));
  assert.equal(api.headers.get("x-middleware-rewrite"), origin + "/creator/data/dashboard?period=1D");
  assert.equal((await middleware(request("/api/dashboard", "POST"))).status, 403);
  assert.equal((await middleware(request("/creator", "POST", { "next-action": "forged" }))).status, 403);
  for (const path of ["/tether", "/link", "/lynq", "/moxy", "/jess-and-kate-ai", "/twin"]) {
    const response = await middleware(request(path));
    assert.equal(response.status, 200);
    assert.equal(response.cookies.get(CREATOR_SESSION_COOKIE)?.value, "", `Creator session must clear on ${path}`);
    assert.equal(response.cookies.has(SESSION_COOKIE), false, "No admin session is ever issued");
  }
  const admin = await signSession();
  const switched = await middleware(request("/login", "GET", { cookie: `${cookie}; ${SESSION_COOKIE}=${admin}` }));
  assert.equal(switched.cookies.get(CREATOR_SESSION_COOKIE)?.value, "");
  console.log("Creator routing: internal creator-management denial, native read-only API rewrite, blocked settings/actions and safe operator portal switching passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
