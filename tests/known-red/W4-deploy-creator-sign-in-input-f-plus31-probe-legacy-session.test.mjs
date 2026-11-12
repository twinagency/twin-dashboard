// KNOWN RED (W4 F24; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md): the post-deploy probes mint
// the legacy stateless `allie_admin_session=<exp>.<hmac>` cookie from DASHBOARD_SESSION_SECRET. lib/session.ts
// rejects that in production unless DASHBOARD_ALLOW_LEGACY_ADMIN_SESSIONS=1 (set nowhere in the repo), so the
// probes are either red noise or keep the unrevocable, password-forgeable path alive just for themselves.
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). The control imports lib/session.ts (its only import, lib/owner-auth.ts, has no imports and
// only fetches for `owner_` tokens; fetch is stubbed to throw here anyway). The secret is synthetic.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-probe-legacy-session.test.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { readTarget } from "../support/w4-deploy-vm.mjs";

const PROBES = ["deployment/live-overview-check.cjs", "deployment/live-telegram-check.cjs", "deployment/messages-load-check.cjs"];

test("control: a token minted exactly as the probes mint it is rejected in production without the legacy flag", async (t) => {
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  t.after(() => { process.env = saved; globalThis.fetch = savedFetch; });
  globalThis.fetch = async () => { throw new Error("network is not allowed in this test"); };
  delete process.env.DASHBOARD_ALLOW_LEGACY_ADMIN_SESSIONS;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.DASHBOARD_SESSION_SECRET = "synthetic-test-secret-not-real-0123456789";
  const { verifySessionToken } = await import("../../lib/session.ts");
  // Same recipe as the probes: payload = String(Date.now()+60000), sig = hmac sha256 base64url.
  const payload = String(Date.now() + 60000);
  const token = `${payload}.${createHmac("sha256", process.env.DASHBOARD_SESSION_SECRET).update(payload).digest("base64url")}`;
  process.env.NODE_ENV = "test";
  assert.equal(await verifySessionToken(token), true, "fixture token must be well formed (accepted outside production)");
  process.env.NODE_ENV = "production";
  assert.equal(await verifySessionToken(token), false);
});

test("F24: no post-deploy probe mints a legacy allie_admin_session cookie from createHmac", () => {
  const offenders = [];
  for (const file of PROBES) {
    const text = readTarget(file);
    if (text === null) continue; // a retired probe mints nothing
    const lines = text.split("\n");
    if (!lines.some((l) => l.includes("createHmac"))) continue;
    lines.forEach((l, i) => { if (l.includes("allie_admin_session=")) offenders.push(`${file}:${i + 1}`); });
  }
  assert.deepEqual(offenders, [], `probes mint legacy sessions: ${offenders.join(", ")}`);
});
