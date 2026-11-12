import "../support/admin-route-env";
/**
 * Rule (CLAUDE.md "Twin Admin API" rules 1-2): an admin route is gated by withAdmin itself, never by NODE_ENV or
 * DASHBOARD_NO_AUTH (middleware skips auth in dev). With no TWIN_ADMIN_API_KEY it answers 503; with the right key
 * but a public rightmost X-Forwarded-For it answers 403; both even with NODE_ENV=development and
 * DASHBOARD_NO_AUTH=true. Drives the real GET /api/admin/v1/meta handler. Overlaps the source/unit checks in
 * `npm run test:api` (scripts/check-admin-api.ts) but goes through a real route handler with dev env set.
 * W4 api-admin-plus1 characterization.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FAKE_ADMIN_KEY, adminRequest, installWire } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/meta/route";

function devEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { NODE_ENV: process.env.NODE_ENV, DASHBOARD_NO_AUTH: process.env.DASHBOARD_NO_AUTH, key: process.env.TWIN_ADMIN_API_KEY };
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "development";
  env.DASHBOARD_NO_AUTH = "true";
  const w = installWire();
  return fn().finally(() => {
    w.restore();
    for (const [k, v] of [["NODE_ENV", saved.NODE_ENV], ["DASHBOARD_NO_AUTH", saved.DASHBOARD_NO_AUTH], ["TWIN_ADMIN_API_KEY", saved.key]] as const) {
      if (v === undefined) delete env[k]; else env[k] = v;
    }
  });
}

test("key + loopback caller in dev env gets 200 (harness reaches the handler)", () => devEnv(async () => {
  const res = await GET(adminRequest("/api/admin/v1/meta", { headers: { "x-forwarded-for": "127.0.0.1" } }));
  assert.equal(res.status, 200);
}));

test("no admin key configured: 503, even in dev with DASHBOARD_NO_AUTH", () => devEnv(async () => {
  delete process.env.TWIN_ADMIN_API_KEY;
  const res = await GET(adminRequest("/api/admin/v1/meta"));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "no_key_configured");
}));

test("right key, public rightmost X-Forwarded-For: 403, even in dev with DASHBOARD_NO_AUTH", () => devEnv(async () => {
  assert.equal(process.env.TWIN_ADMIN_API_KEY, FAKE_ADMIN_KEY);
  const res = await GET(adminRequest("/api/admin/v1/meta", { headers: { "x-forwarded-for": "1.2.3.4, 8.8.8.8" } }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "network_denied");
}));
