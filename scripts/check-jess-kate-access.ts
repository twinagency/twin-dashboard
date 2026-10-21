import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as login, GET as loginEntry } from "../app/jess-and-kate-ai/auth/route";
import { POST as logout } from "../app/agency/logout/route";
import { POST as resetPassword } from "../app/agency-admin/jess-kate-password/update/route";
import { middleware } from "../middleware";
import { signSession, SESSION_COOKIE } from "../lib/session";
import { AGENCY_COOKIE, scopeAgencyClones, isAgencyPath } from "../lib/agency-policy";
import { portalLoginPath, pathAgencyName, agencyLoginPath } from "../lib/agency-brand";
import { JESS_KATE_PORTAL as portal } from "../lib/partner-portals";
import { agencyCanManage } from "../lib/agency-management-policy";
import { withDashboardAccess, accessCacheKey } from "../lib/dashboard-access";
import { scopeReadUrl } from "../lib/agency-query";
import { scopeAgencyWrite } from "../lib/agency-write";
const origin="https://dashboard.tgaiclone.xyz";
const kate="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",other="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",user="11111111-1111-1111-1111-111111111111";
async function main(){
  Object.assign(process.env,{NODE_ENV:"production",SUPABASE_URL:"https://jess-kate-test.supabase.co",SUPABASE_SERVICE_KEY:"offline-test-key",DASHBOARD_PASSWORD:"offline-admin-password"});
  const oldFetch=globalThis.fetch;
  let active=true,agencyActive=true,wrongUser=false,wrongAgency=false,emptyScope=false,tokenRequests=0,passwordUpdates=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));let body:unknown;
    if(url.pathname==="/auth/v1/token"){
      tokenRequests++;const credentials=JSON.parse(String(init?.body));assert.equal(credentials.email,portal.loginEmail);
      if(credentials.password!=="offline-partner-password")return new Response(JSON.stringify({message:"Invalid credentials"}),{status:400,headers:{"content-type":"application/json"}});
      body={access_token:"partner-token",refresh_token:"fixture-refresh",expires_in:3600,token_type:"bearer",user:{id:wrongUser?"different-user":user}};
    }else if(url.pathname==="/auth/v1/user")body={id:user};
    else if(url.pathname==="/auth/v1/logout")body={};
    else if(url.pathname===`/auth/v1/admin/users/${user}`){passwordUpdates++;assert.equal(init?.method,"PUT");body={user:{id:user}};}
    else if(url.pathname==="/rest/v1/agency_memberships"){
      assert.equal(url.searchParams.get("active"),"eq.true");
      if(!url.searchParams.has("user_id")){
        assert.equal(url.searchParams.get("agency_id"),`eq.${portal.id}`);
        assert.equal(url.searchParams.get("email"),`eq.${portal.loginEmail}`);
        body=active?{user_id:user,email:portal.loginEmail}:null;
      }else {
        assert.equal(url.searchParams.get("select"),"agency_id,can_manage,creator_scope,creator_ids,creator_access_revision");
        assert.equal(url.searchParams.get("user_id"),`eq.${user}`);
        body=active?{ creator_scope: "all", creator_ids: [], creator_access_revision: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", agency_id:wrongAgency?"different-agency":portal.id,can_manage:false}:null;
      }
    }else if(url.pathname==="/rest/v1/partner_agencies")body=agencyActive?{id:wrongAgency?"different-agency":portal.id,name:portal.name}:null;
    else if(url.pathname==="/rest/v1/agency_creators")body=emptyScope?[]:[{clone_id:kate}];
    else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(body),{headers:{"content-type":"application/json"}});
  };
  const request=(password="offline-partner-password",source=origin,extra:Record<string,string>={},headers:Record<string,string>={})=>new NextRequest(origin+portal.loginPath+"/auth",{method:"POST",headers:{origin:source,accept:"application/json",...headers},body:new URLSearchParams({password,...extra})});
  try{
    assert.equal(portalLoginPath(portal.slug),portal.loginPath);assert.equal(pathAgencyName(portal.loginPath),portal.name);assert.equal(agencyLoginPath(portal.name),portal.loginPath);
    assert.equal(isAgencyPath("/jess-and-kate-ai-spoof"),false);
    assert.equal(loginEntry(new NextRequest(origin+portal.loginPath+"/auth")).headers.get("location"),origin+portal.loginPath);
    for(const cookie of ["","twin_agency_access=stale; twin_agency_portal=moxy","twin_agency_access=stale; twin_agency_portal=lynq"]){
      const page=await middleware(new NextRequest(origin+portal.loginPath,{headers:{cookie}}));assert.equal(page.status,200);assert.equal(page.headers.get("location"),null);
      assert.equal((await middleware(new NextRequest(origin+portal.loginPath,{method:"POST",headers:{cookie,"next-action":"forged"}}))).status,403);
    }
    assert.equal((await login(request(undefined,"https://evil.example"))).status,403);assert.equal(tokenRequests,0);
    assert.equal((await login(request(undefined,origin,{}, {"next-action":"forged"}))).status,403);assert.equal(tokenRequests,0);
    assert.equal((await login(request("wrong-password"))).status,401);
    const ok=await login(request(undefined,origin,{email:"admin@evil.test",agency:"other",clone:kate,next:"/settings"}));
    assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{ok:true});
    assert.equal(ok.cookies.get(AGENCY_COOKIE)?.value,"partner-token");assert.equal(ok.cookies.get(SESSION_COOKIE)?.value,"");
    assert.equal(ok.cookies.get("clone_scope")?.value,kate);assert.equal(ok.cookies.get("twin_agency_portal")?.value,portal.slug);
    assert.equal(ok.cookies.get(AGENCY_COOKIE)?.secure,true);assert.equal(ok.cookies.get(AGENCY_COOKIE)?.httpOnly,true);
    active=false;const count=tokenRequests;assert.equal((await login(request())).status,503);assert.equal(tokenRequests,count);active=true;
    for(const set of [(x:boolean)=>wrongUser=x,(x:boolean)=>wrongAgency=x,(x:boolean)=>emptyScope=x,(x:boolean)=>agencyActive=!x]){set(true);assert.equal((await login(request())).status,401);set(false);}
    const cookie=`${AGENCY_COOKIE}=partner-token; twin_agency_portal=${portal.slug}; clone_scope=${other}`;
    for(const path of ["/revenue","/clones","/users","/media","/flows","/business",`/clones/${kate}`])assert.equal((await middleware(new NextRequest(origin+path,{headers:{cookie}}))).status,200);
    for(const path of ["/settings","/agency-admin","/api-access",`/clones/${other}`,`/revenue?clone=${other}`,`/users?cloneId=${other}`])assert.equal((await middleware(new NextRequest(origin+path,{headers:{cookie}}))).status,403);
    active=false;const expired=await middleware(new NextRequest(origin+"/revenue",{headers:{cookie}}));assert.equal(expired.headers.get("location"),origin+portal.loginPath);active=true;
    const identity={id:portal.id,name:portal.name,cloneIds:[kate]};
    assert.equal(agencyCanManage(identity),true);assert.equal(agencyCanManage({id:"not-approved",name:portal.name} as any),false);
    assert.deepEqual(scopeAgencyClones(identity.cloneIds),[kate]);assert.throws(()=>scopeAgencyClones(identity.cloneIds,other));
    assert.notEqual(accessCacheKey(identity),accessCacheKey({id:"moxy",name:"Moxy",cloneIds:[other]}));
    await withDashboardAccess(identity,async()=>{
      for(const table of ["clones","users","star_transactions","photos","videos","chat_history"]){
        const {url}=scopeReadUrl(new URL(`https://jess-kate-test.supabase.co/rest/v1/${table}?select=*&or=(clone_id.eq.${other})`),identity);
        assert.ok(url.searchParams.get("and")?.includes(kate));
      }
      const u=new URL(`https://jess-kate-test.supabase.co/rest/v1/clones?id=eq.${kate}`);
      assert.ok((await scopeAgencyWrite(u,"PATCH",{text_model:"example-model",starting_credits:10},identity)).searchParams.get("and")?.includes(kate));
      await assert.rejects(scopeAgencyWrite(new URL(`https://jess-kate-test.supabase.co/rest/v1/clones?id=eq.${other}`),"PATCH",{starting_credits:10},identity));
    });
    const session=await signSession();
    const reset=(cookies:string,source=origin)=>new NextRequest(origin+"/agency-admin/jess-kate-password/update",{method:"POST",headers:{origin:source,cookie:cookies},body:new URLSearchParams({password:"a-new-offline-password",user_id:"other-user",agency_id:"other"})});
    assert.equal((await resetPassword(reset(cookie))).status,401);assert.equal((await resetPassword(reset(""))).status,401);
    assert.equal((await resetPassword(reset(`${SESSION_COOKIE}=${session}; ${cookie}`))).status,401);
    assert.equal((await resetPassword(reset(`${SESSION_COOKIE}=${session}`,"https://evil.example"))).status,403);
    assert.equal(passwordUpdates,0);assert.equal((await resetPassword(reset(`${SESSION_COOKIE}=${session}`))).status,303);assert.equal(passwordUpdates,1);
    const exit=await logout(new NextRequest(origin+"/agency/logout",{method:"POST",headers:{cookie,origin}}));assert.equal(exit.headers.get("location"),origin+portal.loginPath);
    assert.equal(exit.cookies.get(AGENCY_COOKIE)?.value,"");
  }finally{globalThis.fetch=oldFetch;}
  console.log("Jess and Kate AI: fixed-account login, one-creator scope, editing, cross-tenant denial, independent branding, revocation, admin password management and logout passed");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
