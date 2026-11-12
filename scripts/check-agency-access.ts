import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import assert from "node:assert/strict";
import { dashboardOrigin, trustedFormOrigin } from "../lib/form-origin";
import { NextRequest } from "next/server";
import { agencyRequestAllowed, scopeAgencyClones, topOnlyfansAgencyPath } from "../lib/agency-policy";
import { middleware } from "../middleware";

async function main() {
  for (const path of ["/revenue", "/payouts", "/clones", "/agency/creators", "/agency/creator-invites"]) {
    assert.equal(topOnlyfansAgencyPath(path,"GET",false),true);
    assert.equal(topOnlyfansAgencyPath(path,"POST",true),false);
  }
  assert.equal(topOnlyfansAgencyPath("/agency/creator-invites/manage","POST",false),true);
  for (const path of ["/business", "/users", "/media", "/agency/creators/file", "/agency/creators/build-packet", "/api/payouts/bank"]) {
    assert.equal(topOnlyfansAgencyPath(path,"GET",false),false);
  }
  for (const path of ["/api/payouts", "/agency/creators/manage", "/agency/creators/link", "/agency/creators/review", "/agency/creators/build-clone"]) {
    assert.equal(topOnlyfansAgencyPath(path,"POST",false),false);
  }
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
  configureFlirtOfflineEnv();
  for (const path of ["/login", "/admin-auth"]) {
    assert.equal((await middleware(new NextRequest(`https://twin.test${path}`, {method:"POST",headers:{"next-action":"known-admin-action"}}))).status,403);
  }
  const proxyRequest = {url:"http://localhost:3000/agency-admin/provision",headers:new Headers({origin:"https://dashboard.flirt.example",host:"localhost:3000"})};
  assert.equal(trustedFormOrigin(proxyRequest),true,"Public origin must work behind an internal proxy host");
  assert.equal(new URL("/agency-admin?result=created", dashboardOrigin(proxyRequest)).href,"https://dashboard.flirt.example/agency-admin?result=created");
  for (const origin of ["https://evil.example","http://dashboard.flirt.example","null","not a url","https://dashboard.flirt.example.evil.example","https://dashboard.flirt.example/path", ""]) {
    const headers = new Headers({origin,host:"evil.example","x-forwarded-host":"evil.example"});
    assert.equal(trustedFormOrigin({...proxyRequest,headers}),false,`Reject ${origin}`);
  }
  assert.equal(trustedFormOrigin({...proxyRequest,headers:new Headers()}),false);
  process.env.SUPABASE_URL="https://abcdefghijklmnopqrst.supabase.co";
  process.env.SUPABASE_SERVICE_KEY="sb_secret_synthetic_test_only";
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
    else if(url.includes('/agency_creators')) {assert.match(url,/agency_id=eq.lynq/);body=[{clone_id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},{clone_id:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}];}
    else throw new Error(`Unexpected query ${url}`);
    return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
  };
  try {
    assert.equal(await agencyIdentity(undefined),null);
    assert.equal(calls.length,0);
    assert.deepEqual(await agencyIdentity("verified-token"),{id:"lynq",name:"LYNQ",cloneIds:["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]});
    for (const path of ["/revenue","/clones","/users","/flows","/media","/logs","/info","/api/dashboard","/api/users/live"]) {
      const req=new NextRequest(`https://twin.test${path}`,{headers:{cookie:"twin_agency_access=verified-token"}});
      assert.equal((await middleware(req)).status,200,`Shared page allowed: ${path}`);
      assert.equal((await middleware(new NextRequest(req.url,{method:"POST",headers:{cookie:"twin_agency_access=verified-token","next-action":"admin-write"}}))).status,403);
    }
    for (const path of ["/settings","/agency-admin","/clones/new","/tracker","/api/ai-assistant","/api/dashboard?clone=cccccccc-cccc-cccc-cccc-cccccccccccc"]) {
      assert.equal((await middleware(new NextRequest(`https://twin.test${path}`,{headers:{cookie:"twin_agency_access=verified-token"}}))).status,403,`Restricted: ${path}`);
    }
    enabled=false;
    assert.equal(await agencyIdentity("verified-token"),null,"revocation must apply immediately despite a valid token");
    globalThis.fetch=async()=>new Response(JSON.stringify({message:"invalid token"}),{status:401,headers:{"content-type":"application/json"}});
    assert.equal(await agencyIdentity("forged-token"),null);
    assert.equal((await middleware(new NextRequest("https://twin.test/revenue",{headers:{cookie:"twin_agency_access=forged-token"}}))).status,307);
  } finally {globalThis.fetch=originalFetch;}
  console.log("Agency access: scope, direct-route protection, server-action blocking, revocation and forged-token checks passed");
}
main().catch(e=>{console.error(e);process.exit(1)});
