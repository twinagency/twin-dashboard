import assert from "node:assert/strict";
import { authenticateOwner, verifyOwnerSession } from "../lib/owner-auth";
import { signSession, verifySessionToken } from "../lib/session";

async function main() {
  process.env.SUPABASE_URL = "https://owner-test.invalid";
  process.env.SUPABASE_SERVICE_KEY = "test-server-key";
  process.env.DASHBOARD_PASSWORD = "existing-master-test-only";
  const originalFetch = globalThis.fetch;
  let result: unknown = true;
  let calls: { url: string; body: Record<string, string> }[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.cache, "no-store");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-server-key");
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json(result);
  };
  try {
    const token = await authenticateOwner(" Jesse-Ronan ", "test-owner-password");
    assert.match(token!, /^owner_[a-f0-9]{64}$/);
    assert.equal(calls[0].body.p_username, "jesse-ronan");
    assert.match(calls[0].body.p_session_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(calls[0].body.p_session_hash, token!.slice(6));
    assert.equal(await verifySessionToken(token), true);
    assert.equal(calls[1].body.p_session_hash, calls[0].body.p_session_hash);
    assert.ok(!("p_password" in calls[1].body));
    assert.notEqual(await authenticateOwner("jesse-ronan", "test-owner-password"), token);
    result = false;
    assert.equal(await authenticateOwner("jesse-ronan", "wrong"), null);
    assert.equal(await verifySessionToken(token), false); // revoked, expired or disabled
    result = { allowed: true };
    assert.equal(await verifyOwnerSession(token!), false);
    const beforeInvalid = calls.length;
    assert.equal(await authenticateOwner("bad name", "anything"), null);
    assert.equal(await authenticateOwner("jesse-ronan", "é".repeat(37)), null);
    assert.equal(await verifyOwnerSession("owner_fake"), false);
    assert.equal(calls.length, beforeInvalid);
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal(await verifySessionToken(token), false);
    assert.equal(await authenticateOwner("jesse-ronan", "test-owner-password"), null);
    // The existing master session remains independent of the database.
    const legacy = await signSession();
    assert.equal(await verifySessionToken(legacy), true);
    process.env.DASHBOARD_PASSWORD = "different-master";
    assert.equal(await verifySessionToken(legacy), false);
    assert.equal(await verifySessionToken(null), false);
    console.log("Owner authentication: hashing, distinct sessions, invalid input, revocation, outage and existing master checks passed.");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
