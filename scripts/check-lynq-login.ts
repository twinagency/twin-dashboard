import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as login, GET as loginPage } from "../app/lynq/auth/route";
import { POST as logout } from "../app/agency/logout/route";
import { POST as adminLogin } from "../app/admin-auth/route";
import { middleware } from "../middleware";
import { signSession, SESSION_COOKIE } from "../lib/session";
import { AGENCY_COOKIE } from "../lib/agency-policy";

const origin = "https://dashboard.tgaiclone.xyz";
const agencyId = "74b03b70-397e-49ab-841f-8adb8241d87d";
const userId = "6e6491b9-8db0-43f5-b04a-d4509318dac9";
const creatorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function main() {
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://lynq-test.supabase.co", SUPABASE_SERVICE_KEY: "test-service", DASHBOARD_PASSWORD: "test-admin-password" });
  const previous = globalThis.fetch;
  let memberActive = true;
  let agencyActive = true;
  let returnedUser = userId;
  let tokenRequests = 0;
  let logoutScope = "";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    let body: unknown;
    if (url.pathname === "/auth/v1/token") {
      tokenRequests++;
      const credentials = JSON.parse(String(init?.body));
      assert.equal(credentials.email, "shared@example.test", "Never take an email from the form");
      if (credentials.password !== "test-lynq-password") return new Response(JSON.stringify({message:"Invalid login credentials"}), {status:400, headers:{"content-type":"application/json"}});
      body = {access_token:"test-session",refresh_token:"test-refresh",expires_in:3600,token_type:"bearer",user:{id:returnedUser}};
    } else if (url.pathname === "/auth/v1/user") body = {id:returnedUser};
    else if (url.pathname === "/auth/v1/logout") {logoutScope=url.searchParams.get("scope") ?? "";body={};}
    else if (url.pathname === "/rest/v1/agency_memberships") {
      assert.equal(url.searchParams.get("active"), "eq.true");
      if (url.searchParams.get("select") === "email") {
        assert.equal(url.searchParams.get("agency_id"),`eq.${agencyId}`);
        assert.equal(url.searchParams.get("user_id"),`eq.${userId}`);
        body=memberActive?{email:"shared@example.test"}:null;
      } else body=memberActive?{agency_id:agencyId}:null;
    } else if (url.pathname === "/rest/v1/partner_agencies") body=agencyActive?{id:agencyId,name:"LYNQ"}:null;
    else if (url.pathname === "/rest/v1/agency_creators") body=[{clone_id:creatorId}];
    else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(body), {headers:{"content-type":"application/json"}});
  };
  const request = (password: string, source = origin, extra: Record<string,string> = {}) => new NextRequest(`${origin}/lynq/auth`, {
    method:"POST",headers:{origin:source},body:new URLSearchParams({password,...extra}),
  });
  try {
    assert.equal((await login(request("test-lynq-password","https://evil.example"))).status,403);
    assert.equal(tokenRequests,0);
    assert.equal(loginPage(new NextRequest(`${origin}/lynq/auth`)).headers.get("location"),`${origin}/lynq`,"Opening the submission URL must not show a blank 405 page");
    assert.match((await login(request("wrong-password"))).headers.get("location")!,/\/lynq\?error=1$/);
    const jsonRequest=(password:string)=>new NextRequest(`${origin}/lynq/auth`,{method:"POST",headers:{origin,accept:"application/json"},body:new URLSearchParams({password})});
    const rejected=await login(jsonRequest("wrong-password"));
    assert.equal(rejected.status,401);
    assert.deepEqual(await rejected.json(),{ok:false,error:"credentials"});
    const accepted=await login(jsonRequest("test-lynq-password"));
    assert.equal(accepted.status,200);
    assert.deepEqual(await accepted.json(),{ok:true});
    assert.equal(accepted.cookies.get(AGENCY_COOKIE)?.value,"test-session");
    assert.equal(accepted.headers.get("location"),null,"Browser stays on the sign-in page until success is handled");
    const malformed=await login(new NextRequest(`${origin}/lynq/auth`,{method:"POST",headers:{origin,accept:"application/json","content-type":"application/json"},body:"invalid"}));
    assert.equal(malformed.status,503);
    assert.deepEqual(await malformed.json(),{ok:false,error:"unavailable"},"Unexpected errors must return a usable response");
    const success=await login(request("test-lynq-password",origin,{email:"admin@example.test",agency:"other",next:"/settings"}));
    assert.equal(success.status,303);
    assert.equal(success.headers.get("location"),`${origin}/revenue`);
    assert.equal(success.cookies.get(AGENCY_COOKIE)?.value,"test-session");
    assert.equal(success.cookies.get(AGENCY_COOKIE)?.httpOnly,true);
    assert.equal(success.cookies.get(AGENCY_COOKIE)?.secure,true);
    assert.equal(success.cookies.get(SESSION_COOKIE)?.value,"");
    assert.equal(success.cookies.get("clone_scope")?.value,"");
    memberActive=false;
    const before=tokenRequests;
    assert.match((await login(request("test-lynq-password"))).headers.get("location")!,/error=1/);
    assert.equal(tokenRequests,before,"Revoked shared login must never authenticate");
    memberActive=true;agencyActive=false;
    assert.match((await login(request("test-lynq-password"))).headers.get("location")!,/error=1/);
    agencyActive=true;returnedUser="other-user";
    assert.match((await login(request("test-lynq-password"))).headers.get("location")!,/error=1/);
    returnedUser=userId;
    for (const path of ["/lynq","/lynq/auth"]) {
      assert.equal((await middleware(new NextRequest(origin+path))).status,200);
      assert.equal((await middleware(new NextRequest(origin+path,{method:"POST",headers:{"next-action":"admin-action"}}))).status,403);
    }
    const cookie=`${AGENCY_COOKIE}=test-session`;
    assert.equal((await middleware(new NextRequest(`${origin}/settings`,{headers:{cookie}}))).status,403);
    assert.equal((await middleware(new NextRequest(`${origin}/clones/cccccccc-cccc-cccc-cccc-cccccccccccc`,{headers:{cookie}}))).status,403);
    const signedAdmin=await signSession();
    assert.equal((await middleware(new NextRequest(`${origin}/login`,{headers:{cookie:`${cookie}; ${SESSION_COOKIE}=${signedAdmin}`}}))).status,200,"Admin sign-in remains reachable when switching accounts");
    const exited=await logout(new NextRequest(`${origin}/agency/logout`,{method:"POST",headers:{origin,cookie}}));
    assert.equal(exited.headers.get("location"),`${origin}/lynq`);
    assert.equal(exited.cookies.get(AGENCY_COOKIE)?.value,"");
    assert.equal(logoutScope,"local","One operator signing out must not sign out the other");
    const admin=await adminLogin(new NextRequest(`${origin}/admin-auth`,{method:"POST",headers:{origin},body:new URLSearchParams({password:"test-admin-password"})}));
    assert.ok(admin.cookies.get(SESSION_COOKIE)?.value);
    assert.equal(admin.cookies.get(AGENCY_COOKIE)?.value,"");
    assert.equal(admin.cookies.get("clone_scope")?.value,"");
  } finally {globalThis.fetch=previous;}
  console.log("LYNQ login: password authentication, fixed account, revocation, read-only scope, sign-out and admin switching passed");
}
main().catch(error=>{console.error(error);process.exit(1)});
