import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { identity, ID, CLONES } from "../deployment/flirt-live-twin.cjs";
import { withDashboardAccess } from "../lib/dashboard-access";
import { getAgencyOnboardingAccess } from "../lib/agency-onboarding-access";
import { flirtOperatorAgencyPath } from "../lib/flirt-onboarding-policy";
import { POST as invite } from "../app/agency/creator-invites/manage/route";
import { POST as edit } from "../app/agency/creators/manage/route";
import { middleware } from "../middleware";
import { SESSION_COOKIE, signSession } from "../lib/session";

async function main() {
  configureFlirtOfflineEnv();
  Object.assign(process.env,{NODE_ENV:"production",FLIRT_LIVE_TWIN_ENABLED:"true",FLIRT_SUPABASE_PROJECT_REF:"lkmfwpqegjluirfusnaw",SUPABASE_URL:"https://lkmfwpqegjluirfusnaw.supabase.co"});
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const code = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const calls: {url:URL;method:string;body:any}[] = [];
  const original = globalThis.fetch;
  let agencyActive = true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname,"lkmfwpqegjluirfusnaw.supabase.co","Intake must never reach Twin");
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({url,method,body});
    let result:unknown;
    switch(url.pathname) {
      case "/rest/v1/partner_agencies": assert.equal(url.searchParams.get("id"),`eq.${ID}`); result=agencyActive?{id:ID,name:"FLIRT"}:null; break;
      case "/rest/v1/agency_creators": assert.equal(url.searchParams.get("agency_id"),`eq.${ID}`); result=[]; break;
      case "/rest/v1/creator_agency_codes":
        if(method==="POST") {assert.equal(body.agency_id,ID); assert.equal(body.uses,0); assert.match(body.code_hash,/^[0-9a-f]{64}$/);}
        else {assert.equal(url.searchParams.get("agency_id"),`eq.${ID}`); assert.equal(body.active,false);}
        result=[{id:code}];break;
      case "/rest/v1/creator_agency_assignments": assert.equal(url.searchParams.get("agency_id"),`eq.${ID}`); result=url.searchParams.get("creator_account_id")===`eq.${account}`?{creator_account_id:account}:null;break;
      case "/rest/v1/creator_accounts": assert.equal(method,"PATCH"); assert.equal(url.searchParams.get("id"),`eq.${account}`); assert.equal(body.display_name,"Edited test creator"); assert.ok(url.searchParams.get("updated_at")); result=[{id:account}];break;
      default:throw new Error(`Unexpected ${url.pathname}`);
    }
    return new Response(JSON.stringify(result),{headers:{"content-type":"application/json"}});
  };
  const req=(path:string,fields:Record<string,string>,requestOrigin=origin)=>new NextRequest(origin+path,{method:"POST",headers:{origin:requestOrigin},body:new URLSearchParams(fields)});
  try {
    assert.equal(await withDashboardAccess(null,()=>getAgencyOnboardingAccess()),null);
    assert.equal((await withDashboardAccess(null,()=>invite(req("/agency/creator-invites/manage",{action:"generate"})))).status,401);
    assert.equal(calls.length,0);
    await withDashboardAccess(identity(),async()=>{
      const access=await getAgencyOnboardingAccess();
      assert.deepEqual(access,{id:ID,name:"FLIRT",cloneIds:[]},"Twin IDs must not become local linking grants");
      const generated=await invite(req("/agency/creator-invites/manage",{action:"generate",max_uses:"1",expires_days:"7",agency_id:CLONES[0]}));
      assert.equal(generated.status,303); assert.match(generated.headers.get("location")!,/created=[A-Z2-9]{10}$/);
      assert.equal((await invite(req("/agency/creator-invites/manage",{action:"revoke",id:code}))).status,303);
      const before=calls.length;
      assert.equal((await invite(req("/agency/creator-invites/manage",{action:"generate"},"https://evil.example"))).status,403);
      assert.equal(calls.length,before);
      assert.equal((await edit(req("/agency/creators/manage",{creator_account_id:CLONES[0],display_name:"Intruder",revision:new Date().toISOString()}))).status,403);
      assert.equal(calls.filter(call=>call.method==="PATCH"&&call.url.pathname.endsWith("/creator_accounts")).length,0);
      const saved=await edit(req("/agency/creators/manage",{creator_account_id:account,display_name:"Edited test creator",revision:new Date().toISOString()}));
      assert.match(saved.headers.get("location")!,/result=saved$/);
      agencyActive=false;
      await assert.rejects(()=>getAgencyOnboardingAccess(),/agency is unavailable/);
    });
    const cookie=`${SESSION_COOKIE}=${await signSession()}`;
    for(const path of ["/agency-admin/creator-codes","/agency-admin/creator-codes/manage"]){
      const method=path.endsWith("manage")?"POST":"GET";
      const redirected=await middleware(new NextRequest(origin+path,{method,headers:{cookie,origin}}));
      assert.equal(redirected.status,307); assert.match(redirected.headers.get("location")!,/\/agency\/creator-invites(?:\/manage)?$/);
    }
    const anonymous=await middleware(new NextRequest(origin+"/agency-admin/creator-codes"));
    assert.ok(!anonymous.headers.get("location")?.includes("/agency/creator-invites"));
    for(const path of ["/agency/creator-invites","/agency/creator-invites/manage","/agency/creators",`/agency/creators/${account}`])assert.equal(flirtOperatorAgencyPath(path),true);
    for(const path of ["/agency","/agency/auth","/agency/unknown","/agency-admin","/agency/creators/not-an-id"])assert.equal(flirtOperatorAgencyPath(path),false);
  } finally {globalThis.fetch=original;}
  console.log("FLIRT invites: local-only writes, agency validation, anonymous/CSRF/foreign-account denials, profile editing and legacy routing passed");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
