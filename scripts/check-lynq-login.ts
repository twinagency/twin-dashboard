import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as login, GET as loginPage } from "../app/lynq/auth/route";
import { POST as logout } from "../app/agency/logout/route";
import { POST as adminLogin } from "../app/admin-auth/route";
import { POST as resetPassword } from "../app/agency-admin/lynq-password/update/route";
import { middleware } from "../middleware";
import { signSession, SESSION_COOKIE } from "../lib/session";
import { AGENCY_COOKIE } from "../lib/agency-policy";

const origin = "https://dashboard.flirt.example";
const agencyId = "74b03b70-397e-49ab-841f-8adb8241d87d";
const userId = "6e6491b9-8db0-43f5-b04a-d4509318dac9";
const partnerUserId = "77777777-7777-4777-8777-777777777777";
const creatorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function main() {
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_KEY: "sb_secret_synthetic_test_only", DASHBOARD_PASSWORD: "test-admin-password" });
  configureFlirtOfflineEnv();
  const previous = globalThis.fetch;
  let memberActive = true;
  let agencyActive = true;
  let returnedUser = userId;
  let tokenRequests = 0;
  let logoutScope = "";
  let passwordUpdates = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    let body: unknown;
    if (url.pathname === `/auth/v1/admin/users/${userId}`) {
      assert.equal(init?.method,"PUT");
      assert.deepEqual(JSON.parse(String(init?.body)),{password:"test-new-lynq-password"});
      passwordUpdates++;
      body={user:{id:userId}};
    } else if (url.pathname === "/auth/v1/token") {
      tokenRequests++;
      const credentials = JSON.parse(String(init?.body));
      const valid = (credentials.email === "shared@example.test" && credentials.password === "test-lynq-password")
        || (credentials.email === "partner@example.test" && credentials.password === "test-partner-password");
      if (!valid) return new Response(JSON.stringify({message:"Invalid login credentials"}), {status:400, headers:{"content-type":"application/json"}});
      body = {access_token:"test-session",refresh_token:"test-refresh",expires_in:3600,token_type:"bearer",user:{id:returnedUser}};
    } else if (url.pathname === "/auth/v1/user") body = {id:returnedUser};
    else if (url.pathname === "/auth/v1/logout") {logoutScope=url.searchParams.get("scope") ?? "";body={};}
    else if (url.pathname === "/rest/v1/agency_memberships") {
      assert.equal(url.searchParams.get("active"), "eq.true");
      if (url.searchParams.get("select") === "user_id,email") {
        assert.equal(url.searchParams.get("agency_id"),`eq.${agencyId}`);
        const requestedEmail = url.searchParams.get("email");
        const requestedUser = url.searchParams.get("user_id");
        if (requestedEmail === "eq.partner@example.test") body=memberActive?{user_id:partnerUserId,email:"partner@example.test"}:null;
        else if (requestedEmail === "eq.shared@example.test" || requestedUser === `eq.${userId}`) body=memberActive?{user_id:userId,email:"shared@example.test"}:null;
        else body=null;
      } else if(url.searchParams.get("select")==="user_id") {
        assert.equal(url.searchParams.get("agency_id"),`eq.${agencyId}`);
        assert.equal(url.searchParams.get("user_id"),`eq.${userId}`);
        body=memberActive?{user_id:userId}:null;
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
    for (const alias of ["/link", "/lynq"]) {
      const aliasReq = (password: string, source = origin) => new NextRequest(`${origin}${alias}/auth`, {method:"POST", headers:{origin:source}, body:new URLSearchParams({password})});
      assert.equal(loginPage(new NextRequest(`${origin}${alias}/auth`)).headers.get("location"), `${origin}${alias}`);
      assert.equal((await login(aliasReq("wrong-password"))).headers.get("location"), `${origin}${alias}?error=1`);
      assert.equal((await login(aliasReq("test-lynq-password", "https://evil.example"))).status, 403);
      const ok = await login(aliasReq("test-lynq-password"));
      assert.equal(ok.headers.get("location"), `${origin}/revenue`);
      assert.equal(ok.cookies.get(AGENCY_COOKIE)?.value, "test-session");
      assert.equal(ok.cookies.get(SESSION_COOKIE)?.value, "");
    }
    tokenRequests = 0;
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
    const unknown=await login(request("test-lynq-password",origin,{email:"admin@example.test",agency:"other",next:"/settings"}));
    assert.match(unknown.headers.get("location")!,/error=1/,"An email without an active LYNQ membership is denied");
    returnedUser=partnerUserId;
    const success=await login(request("test-partner-password",origin,{email:"partner@example.test",agency:"other",next:"/settings"}));
    assert.equal(success.status,303);
    assert.equal(success.headers.get("location"),`${origin}/revenue`);
    assert.equal(success.cookies.get(AGENCY_COOKIE)?.value,"test-session");
    assert.equal(success.cookies.get(AGENCY_COOKIE)?.httpOnly,true);
    assert.equal(success.cookies.get(AGENCY_COOKIE)?.secure,true);
    assert.equal(success.cookies.get(SESSION_COOKIE)?.value,"");
    assert.equal(success.cookies.get("clone_scope")?.value,"");
    returnedUser=userId;
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
    const resetRequest=(cookie:string,source=origin)=>new NextRequest(`${origin}/agency-admin/lynq-password/update`,{method:"POST",headers:{origin:source,cookie},body:new URLSearchParams({password:"test-new-lynq-password",user_id:"other-user",agency_id:"other-agency"})});
    assert.equal((await resetPassword(resetRequest(""))).status,401);
    assert.equal((await resetPassword(resetRequest(cookie))).status,401);
    assert.equal((await resetPassword(resetRequest(`${SESSION_COOKIE}=${signedAdmin}; ${cookie}`))).status,401);
    assert.equal((await resetPassword(resetRequest(`${SESSION_COOKIE}=${signedAdmin}`,"https://evil.example"))).status,403);
    assert.equal(passwordUpdates,0);
    memberActive=false;
    assert.equal((await resetPassword(resetRequest(`${SESSION_COOKIE}=${signedAdmin}`))).status,403);
    assert.equal(passwordUpdates,0);
    memberActive=true;
    assert.equal((await resetPassword(resetRequest(`${SESSION_COOKIE}=${signedAdmin}`))).status,200);
    assert.equal(passwordUpdates,1,"Only admin can reset the fixed LYNQ account");
    const setup=await middleware(new NextRequest(`${origin}/login?next=/agency-admin/lynq-password`,{headers:{cookie:`${SESSION_COOKIE}=${signedAdmin}`}}));
    assert.equal(setup.headers.get("location"),`${origin}/agency-admin/lynq-password`);
    const unsafeNext=await middleware(new NextRequest(`${origin}/login?next=//evil.example`,{headers:{cookie:`${SESSION_COOKIE}=${signedAdmin}`}}));
    assert.equal(unsafeNext.headers.get("location"),`${origin}/revenue`);
    assert.equal((await middleware(new NextRequest(`${origin}/login`,{headers:{cookie:`${cookie}; ${SESSION_COOKIE}=${signedAdmin}`}}))).status,200,"Admin sign-in remains reachable when switching accounts");
    const exited=await logout(new NextRequest(`${origin}/agency/logout`,{method:"POST",headers:{origin,cookie}}));
    assert.equal(exited.headers.get("location"),`${origin}/link`);
    assert.equal(exited.cookies.get(AGENCY_COOKIE)?.value,"");
    assert.equal(logoutScope,"local","One operator signing out must not sign out the other");
    const admin=await adminLogin(new NextRequest(`${origin}/admin-auth`,{method:"POST",headers:{origin},body:new URLSearchParams({password:"test-admin-password"})}));
    assert.ok(admin.cookies.get(SESSION_COOKIE)?.value);
    assert.equal(admin.cookies.get(AGENCY_COOKIE)?.value,"");
    assert.equal(admin.cookies.get("clone_scope")?.value,"");
  } finally {globalThis.fetch=previous;}
  console.log("LYNQ login: original and additional member authentication, revocation, read-only scope, sign-out and admin switching passed");
}
main().catch(error=>{console.error(error);process.exit(1)});
