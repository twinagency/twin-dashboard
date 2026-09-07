import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { POST as login, GET as loginPage } from "../app/moxy/auth/route";
import { POST as logout } from "../app/agency/logout/route";
import { middleware } from "../middleware";
import { AGENCY_COOKIE, agencyDashboardPath, agencyRequestAllowed } from "../lib/agency-policy";
import { AGENCY_PORTAL_COOKIE, isMoxy, pathAgencyName, portalLoginPath, MOXY_PRIVATE_MODEL_COLUMNS } from "../lib/agency-brand";
import { scopeReadUrl } from "../lib/agency-query";
import { SESSION_COOKIE, signSession } from "../lib/session";
import { accessCacheKey } from "../lib/dashboard-access";

const origin="https://dashboard.tgaiclone.xyz";
const moxyId="11111111-1111-1111-1111-111111111111";
const lynqId="22222222-2222-2222-2222-222222222222";
const creator="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const secondCreator="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const outsider="cccccccc-cccc-cccc-cccc-cccccccccccc";

async function main() {
  Object.assign(process.env,{NODE_ENV:"production",SUPABASE_URL:"https://moxy-test.supabase.co",SUPABASE_SERVICE_KEY:"test-key",DASHBOARD_PASSWORD:"offline-admin-password"});
  const previous=globalThis.fetch;
  let active=true, memberActive=true, signedInAgency=moxyId, authCalls=0, signoutScope="";
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)); let body:unknown;
    if(url.pathname==="/auth/v1/token") {
      authCalls++;
      const credentials=JSON.parse(String(init?.body));
      assert.equal(credentials.email,"moxy@example.test");
      if(credentials.password!=="offline-moxy-password") return new Response(JSON.stringify({message:"Invalid login credentials"}),{status:400,headers:{"content-type":"application/json"}});
      body={access_token:"moxy-session",refresh_token:"test-refresh",expires_in:3600,token_type:"bearer",user:{id:"verified-moxy-user"}};
    } else if(url.pathname==="/auth/v1/user") body={id:"verified-moxy-user"};
    else if(url.pathname==="/auth/v1/logout") {signoutScope=url.searchParams.get("scope")!;body={};}
    else if(url.pathname==="/rest/v1/partner_agencies") {
      assert.equal(url.searchParams.get("active"),"eq.true");
      if(url.searchParams.has("slug")) {
        assert.equal(url.searchParams.get("slug"),"eq.moxy");
        body=active?{id:moxyId}:null;
      } else {
        assert.equal(url.searchParams.get("id"),`eq.${signedInAgency}`);
        body=active?{id:signedInAgency,name:signedInAgency===moxyId?"Moxy":"LYNQ"}:null;
      }
    } else if(url.pathname==="/rest/v1/agency_memberships") {
      assert.equal(url.searchParams.get("user_id"),"eq.verified-moxy-user");
      assert.equal(url.searchParams.get("active"),"eq.true");
      body=memberActive?{agency_id:signedInAgency}:null;
    } else if(url.pathname==="/rest/v1/agency_creators") {
      assert.equal(url.searchParams.get("agency_id"),`eq.${signedInAgency}`);
      body=[{clone_id:creator},{clone_id:secondCreator}];
    } else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(body),{headers:{"content-type":"application/json"}});
  };
  const request=(password="offline-moxy-password",source=origin,extra:Record<string,string>={})=>new NextRequest(origin+"/moxy/auth",{method:"POST",headers:{origin:source,accept:"application/json"},body:new URLSearchParams({email:"Moxy@Example.Test",password,...extra})});
  const cookie=`${AGENCY_COOKIE}=moxy-session; ${AGENCY_PORTAL_COOKIE}=moxy`;
  try {
    assert.equal((await login(request(undefined,"https://evil.example"))).status,403);
    assert.equal(authCalls,0);
    assert.equal((await login(request("wrong-password"))).status,401);
    const ok=await login(request(undefined,origin,{agency:lynqId,next:"/agency-admin",clone:outsider}));
    assert.deepEqual(await ok.json(),{ok:true});
    const session=ok.cookies.get(AGENCY_COOKIE)!;
    assert.equal(session.value,"moxy-session");assert.equal(session.httpOnly,true);assert.equal(session.secure,true);assert.equal(session.sameSite,"strict");
    assert.equal(ok.cookies.get(AGENCY_PORTAL_COOKIE)?.value,"moxy");
    assert.equal(ok.cookies.get(SESSION_COOKIE)?.value,"");
    assert.equal(ok.cookies.get("clone_scope")?.value,"");
    assert.equal(new URL(loginPage(new NextRequest(origin+"/moxy/auth")).headers.get("location")!).pathname,"/moxy");
    signedInAgency=lynqId;
    assert.equal((await login(request())).status,401,"LYNQ credentials cannot open Moxy");
    signedInAgency=moxyId;memberActive=false;
    assert.equal((await login(request())).status,401,"Revoked memberships fail closed");
    memberActive=true;active=false;
    assert.equal((await login(request())).status,503,"Disabled portal fails closed");
    active=true;
    for(const path of ["/moxy","/moxy/auth","/moxy/logo.png","/moxy/icon.svg"]){
      assert.equal((await middleware(new NextRequest(origin+path))).status,200);
      assert.equal(agencyRequestAllowed(path,"POST",true),false);
    }
    for(const path of ["/revenue","/analytics","/clones","/users","/media","/flows","/logs","/business",`/clones/${creator}`,`/clones/${secondCreator}`]) {
      assert.equal((await middleware(new NextRequest(origin+path,{headers:{cookie}}))).status,200,path);
      for(const method of ["POST","PUT","PATCH","DELETE"])
        assert.equal((await middleware(new NextRequest(origin+path,{method,headers:{cookie,"next-action":"admin-write"}}))).status,403,`${method} ${path}`);
    }
    for(const path of ["/crm/inbox","/crm/fans","/crm/campaigns","/crm/team","/crm/platforms","/ai","/jarvis","/tracker","/api-access","/agency-admin","/agency-admin/provision","/api/models","/settings","/clones/new",`/clones/${outsider}`,`/api/dashboard?clone=${outsider}`])
      assert.equal((await middleware(new NextRequest(origin+path,{headers:{cookie}}))).status,403,path);
    assert.equal(agencyDashboardPath("/api/models","LYNQ"),true,"Existing LYNQ model access preserved");
    const fakeBrandCookie=`${AGENCY_PORTAL_COOKIE}=moxy`;
    const unauth=await middleware(new NextRequest(origin+"/revenue",{headers:{cookie:fakeBrandCookie}}));
    assert.equal(unauth.status,307,"Brand hint alone never authenticates");
    assert.equal(new URL(unauth.headers.get("location")!).pathname,"/moxy");
    const admin=await signSession();
    assert.equal((await middleware(new NextRequest(origin+"/agency-admin",{headers:{cookie:`${SESSION_COOKIE}=${admin}; ${fakeBrandCookie}`}}))).status,200,"Admin cookie retains original authority");
    memberActive=false;
    const expired=await middleware(new NextRequest(origin+"/revenue",{headers:{cookie}}));
    assert.equal(new URL(expired.headers.get("location")!).pathname,"/moxy");
    memberActive=true;
    const signedOut=await logout(new NextRequest(origin+"/agency/logout",{method:"POST",headers:{origin,cookie}}));
    assert.equal(new URL(signedOut.headers.get("location")!).pathname,"/moxy");
    assert.equal(signoutScope,"local");
    assert.equal(signedOut.cookies.get(AGENCY_COOKIE)?.value,"");
  } finally {globalThis.fetch=previous;}
  const moxy={id:moxyId,name:"Moxy",cloneIds:[creator,secondCreator]};
  const scoped=scopeReadUrl(new URL("https://test.supabase.co/rest/v1/clones?select=*"),moxy).url;
  const fields=scoped.searchParams.get("select")!.split(",");
  for(const field of ["bot_token",...MOXY_PRIVATE_MODEL_COLUMNS]) assert.ok(!fields.includes(field),`Never project ${field}`);
  const explicit=scopeReadUrl(new URL("https://test.supabase.co/rest/v1/clones?select=id,text_model,bot_token"),moxy).url;
  assert.equal(explicit.searchParams.get("select"),"id");
  assert.ok(scoped.searchParams.get("and")!.includes(creator));assert.ok(scoped.searchParams.get("and")!.includes(secondCreator));assert.ok(!scoped.searchParams.get("and")!.includes(outsider));
  assert.notEqual(accessCacheKey(moxy),accessCacheKey({...moxy,id:lynqId}));
  assert.equal(pathAgencyName("/moxy/auth"),"Moxy");assert.equal(isMoxy("Moxy"),true);assert.equal(isMoxy("LYNQ"),false);assert.equal(portalLoginPath("https://evil.example"),"/lynq");
  const sidebar=readFileSync("components/Sidebar.tsx","utf8");
  assert.match(sidebar,/aria-disabled="true"/);assert.match(sidebar,/Not available/);assert.match(sidebar,/!readOnly \|\| showUnavailable/);
  const settings=readFileSync("components/clone/ConfigSections.tsx","utf8");
  assert.match(settings,/!privateSettings && <Collapse/);assert.match(settings,/Bot token concealed/);
  const loginForm=readFileSync("app/moxy/LoginForm.tsx","utf8");
  assert.match(loginForm,/event.preventDefault\(\)/);assert.match(loginForm,/window.location.assign\("\/revenue"\)/);
  console.log("Moxy: tenant-bound login, revocation, read-only methods, disabled routes, two-creator scoping, private settings, branding and admin isolation passed");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
