import assert from "node:assert/strict";
const sessions = new Set<string>();
// Test-only RPC transport. Production auth and permission assertions stay real.
export function syntheticAdminSessionRpc(input: unknown, init?: RequestInit): Response | undefined {
  const url = new URL(String(input));
  if (!url.pathname.startsWith("/rest/v1/rpc/dashboard_")) return undefined;
  assert.equal(url.origin, new URL(process.env.SUPABASE_URL!).origin);
  assert.equal(init?.method, "POST"); assert.equal(init?.cache, "no-store");
  const body = JSON.parse(String(init?.body));
  assert.deepEqual(Object.keys(body), ["p_session_hash"]);
  assert.match(body.p_session_hash, /^[a-f0-9]{64}$/);
  const hash = body.p_session_hash;
  if (url.pathname.endsWith("/dashboard_admin_session_create")) { sessions.add(hash); return Response.json(true); }
  if (url.pathname.endsWith("/dashboard_owner_session_verify")) return Response.json(sessions.has(hash));
  if (url.pathname.endsWith("/dashboard_owner_session_revoke")) { sessions.delete(hash); return Response.json(true); }
  throw new Error("Unexpected synthetic session RPC");
}
