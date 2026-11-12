/**
 * Characterization (W4 lib-onlyfans-preview-2-plus2 F3/F22; REVIEW known failure mode "Auth skips: middleware.ts skips
 * admin auth when NODE_ENV !== production and, in production, for SELF_AUTHENTICATED_PREFIXES"; CORRECTNESS claim 11).
 * Pins what holds today in a production build, driving the real `middleware()` from middleware.ts with no cookies:
 *   - an admin page (/clones) redirects to /twin (middleware.ts:280-288);
 *   - DASHBOARD_NO_AUTH ("1" or "true") changes nothing (nothing reads it at runtime; CLAUDE.md:51 says otherwise, F22);
 *   - /api/v1x-synthetic and /api/adminx-synthetic are not self-authenticated paths: the prefixes are "/api/v1/" and
 *     "/api/admin/" with the slash (:39), so they are redirected like any admin route;
 *   - /api/v1/me IS passed through (x-middleware-next) for withModelKey to authenticate.
 * NODE_ENV=production and a fixed DASHBOARD_PUBLIC_ORIGIN (https://dashboard.invalid) are set before middleware.ts is
 * imported. Stubbed: nothing. Without cookies renewAgencySession, activeViewAs and verifySessionToken return before any
 * network call; globalThis.fetch is replaced by a recorder that throws, and the test asserts it was never called.
 * Mutation-proven (D15): tests/rules/mutations/W4-lib-onlyfans-preview-2-plus2/m1-*, m2-*, m7-*, m8-*, m9-*.
 */
import assert from "node:assert/strict";
import test from "node:test";

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "production";
env.DASHBOARD_PUBLIC_ORIGIN = "https://dashboard.invalid";
for (const name of ["DASHBOARD_NO_AUTH", "TWIN_APP_MODE", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "DASHBOARD_EXTRA_ORIGINS",
  "DASHBOARD_ALLOW_LEGACY_ADMIN_SESSIONS"]) delete env[name];
const network: string[] = [];
globalThis.fetch = (async (url: string | URL | Request) => {
  network.push(String(url));
  throw new Error("network is not allowed in this test");
}) as typeof fetch;

async function run(path: string) {
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../../middleware");
  return middleware(new NextRequest(`https://dashboard.invalid${path}`, { method: "GET" }));
}
function assertRedirectToTwin(response: Response, path: string) {
  assert.ok([302, 303, 307, 308].includes(response.status), `${path}: expected a redirect, got ${response.status}`);
  const location = new URL(response.headers.get("location") ?? "", "https://dashboard.invalid");
  assert.equal(location.pathname, "/twin", `${path}: expected the admin login`);
  assert.equal(response.headers.get("x-middleware-next"), null, `${path}: must not be passed through`);
}

test("production, no cookies: an admin page redirects to /twin", async () => {
  assertRedirectToTwin(await run("/clones"), "/clones");
  assert.deepEqual(network, []);
});

for (const value of ["1", "true"]) {
  test(`production, no cookies, DASHBOARD_NO_AUTH=${value}: still redirects to /twin (the variable is inert)`, async () => {
    env.DASHBOARD_NO_AUTH = value;
    try {
      assertRedirectToTwin(await run("/clones"), "/clones");
    } finally {
      delete env.DASHBOARD_NO_AUTH;
    }
    assert.deepEqual(network, []);
  });
}

for (const path of ["/api/v1x-synthetic", "/api/adminx-synthetic"]) {
  test(`production, no cookies: ${path} is not treated as self-authenticated`, async () => {
    assertRedirectToTwin(await run(path), path);
    assert.deepEqual(network, []);
  });
}

test("production, no cookies: /api/v1/me is passed through for the route's own key check", async () => {
  const response = await run("/api/v1/me");
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(network, []);
});
