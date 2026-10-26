import assert from "node:assert/strict";
import { signSession, verifySessionToken } from "../lib/session";
import { revokeOwnerSession } from "../lib/owner-auth";
async function main() {
  process.env.SUPABASE_URL="https://sessions.invalid";
  process.env.SUPABASE_SERVICE_KEY="synthetic-server-only";
  process.env.DASHBOARD_SERVER_ADMIN_SESSIONS="1";
  const original=globalThis.fetch, sessions=new Set<string>();
  let unavailable=false, lastBody:Record<string,string>={};
  globalThis.fetch=async (url, init)=>{
    assert.equal(init?.cache,"no-store");
    lastBody=JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(lastBody),["p_session_hash"]);
    assert.match(lastBody.p_session_hash,/^[a-f0-9]{64}$/);
    if(unavailable) throw Error("private network detail");
    const hash=lastBody.p_session_hash;
    if(String(url).endsWith("/dashboard_admin_session_create")) { sessions.add(hash); return Response.json(true); }
    if(String(url).endsWith("/dashboard_owner_session_revoke")) { sessions.delete(hash); return Response.json(true); }
    assert(String(url).endsWith("/dashboard_owner_session_verify"));
    return Response.json(sessions.has(hash));
  };
  try {
    const a=await signSession(), b=await signSession();
    assert.notEqual(a,b); assert.match(a,/^owner_[a-f0-9]{64}$/);
    assert(await verifySessionToken(a)); assert(await verifySessionToken(b));
    assert(await revokeOwnerSession(a)); assert(!(await verifySessionToken(a)));
    assert(await revokeOwnerSession(a)); assert(await verifySessionToken(b));
    assert(await revokeOwnerSession(undefined));
    assert(!(await revokeOwnerSession("legacy.stateless")));
    unavailable=true;
    assert(!(await revokeOwnerSession(b)));
    await assert.rejects(signSession(),/session service is unavailable/);
    assert(!(await verifySessionToken(b)));
    console.log("Session revocation PASS: distinct server sessions, copied-token replay refused, other session preserved, repeated logout, invalid legacy and visible outage.");
  } finally {globalThis.fetch=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
