import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { agencyRequestAllowed, scopeAgencyClones } from "../lib/agency-policy";
import { middleware } from "../middleware";

async function main() {
  assert.deepEqual(scopeAgencyClones(["a","b"],"a"),["a"]);
  assert.deepEqual(scopeAgencyClones([],undefined),[]);
  assert.throws(()=>scopeAgencyClones(["a"],"other"));
  assert.throws(()=>scopeAgencyClones([],"a"));
  assert.equal(agencyRequestAllowed("/agency", "GET",false),true);
  for (const path of ["/agency","/agency/login","/agency/auth","/agency/logout"]) {
    assert.equal(agencyRequestAllowed(path,"POST",true),false);
    const req = new NextRequest(`https://twin.test${path}`,{method:"POST",headers:{"next-action":"known-admin-action"}});
    assert.equal((await middleware(req)).status,403);
  }
  assert.equal(agencyRequestAllowed("/agency", "POST",false),false);
  assert.equal(agencyRequestAllowed("/agency-admin/provision", "POST",false),false);
  assert.equal(agencyRequestAllowed("/agency/auth", "POST",false),true);
  Object.assign(process.env, { NODE_ENV: "production" });
  for (const path of ["/login", "/admin-auth"]) {
    assert.equal((await middleware(new NextRequest(`https://twin.test${path}`, {method:"POST",headers:{"next-action":"known-admin-action"}}))).status,403);
  }
  process.env.DASHBOARD_NO_AUTH = "true";
  for (const path of ["/clones","/revenue","/api/media-sign","/agency-admin/provision"]) {
    const req = new NextRequest(`https://twin.test${path}`,{headers:{cookie:"twin_agency_access=some-agency-token"}});
    assert.equal((await middleware(req)).status,307,`agency cookie cannot access ${path}`);
  }
  process.env.SUPABASE_URL="https://agency-test.supabase.co";
  process.env.SUPABASE_SERVICE_KEY="fake-service-key";
  const { agencyIdentity } = await import("../lib/agency-access");
  const originalFetch=globalThis.fetch;
  let enabled=true;
  const calls:string[]=[];
  globalThis.fetch=async(input:any)=> {
    const url=String(input);calls.push(url);
    let body:any;
    if(url.includes('/auth/v1/user')) body={id:"verified-user"};
    else if(url.includes('/agency_memberships')) {
      assert.match(url,/user_id=eq.verified-user/);assert.match(url,/active=eq.true/);
      body=enabled?{agency_id:"lynq"}:null;
    } else if(url.includes('/partner_agencies')) {assert.match(url,/id=eq.lynq/);body={id:"lynq",name:"LYNQ"};}
    else if(url.includes('/agency_creators')) {assert.match(url,/agency_id=eq.lynq/);body=[{clone_id:"a"},{clone_id:"b"}];}
    else throw new Error(`Unexpected query ${url}`);
    return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
  };
  try {
    assert.equal(await agencyIdentity(undefined),null);
    assert.equal(calls.length,0);
    assert.deepEqual(await agencyIdentity("verified-token"),{id:"lynq",name:"LYNQ",cloneIds:["a","b"]});
    enabled=false;
    assert.equal(await agencyIdentity("verified-token"),null,"revocation must apply immediately despite a valid token");
    globalThis.fetch=async()=>new Response(JSON.stringify({message:"invalid token"}),{status:401,headers:{"content-type":"application/json"}});
    assert.equal(await agencyIdentity("forged-token"),null);
  } finally {globalThis.fetch=originalFetch;}
  console.log("Agency access: scope, direct-route protection, server-action blocking, revocation and forged-token checks passed");
}
main().catch(e=>{console.error(e);process.exit(1)});
