import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { isTwinLoginPath, safeAdminNext } from "../lib/login-routing";
import { signSession, SESSION_COOKIE, verifySessionToken } from "../lib/session";
import { AGENCY_COOKIE, isAgencyPath, agencyRequestAllowed } from "../lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "../lib/agency-brand";
import { POST as adminLogin } from "../app/admin-auth/route";
import { GET as linkAuthEntry } from "../app/link/auth/route";

async function main() {
  Object.assign(process.env, { NODE_ENV:"production", DASHBOARD_PASSWORD:"offline-routing-password" });
  configureFlirtOfflineEnv();
  const origin = "https://dashboard.flirt.example";
  const admin = await signSession();
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Login entry must not query private data"); };
  try {
    for (const cookie of ["", `${AGENCY_PORTAL_COOKIE}=moxy`, `${AGENCY_PORTAL_COOKIE}=lynq`, `${AGENCY_COOKIE}=stale; ${AGENCY_PORTAL_COOKIE}=moxy`, `${AGENCY_COOKIE}=stale; ${AGENCY_PORTAL_COOKIE}=lynq`, `${SESSION_COOKIE}=${admin}`, `${SESSION_COOKIE}=${admin}; ${AGENCY_COOKIE}=stale; ${AGENCY_PORTAL_COOKIE}=moxy`]) {
      for (const path of ["/", "/twin"]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await middleware(new NextRequest(origin + path, {method, headers:{cookie, "x-pathname":"/moxy"}}));
          assert.equal(response.status, 200, `${path} must render, not redirect to a partner`);
          assert.equal(response.headers.get("location"), null);
          assert.equal(response.headers.get("x-middleware-rewrite"), null, "No backend namespace rewrites");
          assert.equal(response.headers.get("x-middleware-request-x-pathname"), path);
          assert.match(response.headers.get("Cache-Control")!, /no-store/);
        }
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
          assert.equal((await middleware(new NextRequest(origin + path, {method,headers:{cookie}}))).status,403);
        }
        assert.equal((await middleware(new NextRequest(origin + path, {headers:{cookie,"next-action":"known-action"}}))).status,403);
      }
    }
    assert.equal(calls, 0);
    for (const path of ["/moxy", "/link", "/lynq"]) {
      assert.equal(isAgencyPath(path), true);
      assert.equal((await middleware(new NextRequest(origin + path, {headers:{cookie:`${AGENCY_COOKIE}=stale; ${AGENCY_PORTAL_COOKIE}=moxy`}}))).status, 200);
      assert.equal(agencyRequestAllowed(path,"POST",true),false);
      assert.equal(agencyRequestAllowed(path + "/auth","POST",false),true);
    }
    assert.equal(linkAuthEntry(new NextRequest(origin + "/link/auth")).headers.get("location"), origin + "/link");
    assert.equal((await middleware(new NextRequest(origin + "/settings"))).headers.get("location"), origin + "/twin?next=%2Fsettings");
    const protectedPage = await middleware(new NextRequest(origin + "/settings", {headers:{cookie:`${SESSION_COOKIE}=${admin}`}}));
    assert.equal(protectedPage.status,200);
    assert.equal(protectedPage.headers.get("location"),null,"Do not force authenticated backend pages into /twin/*");
    assert.equal((await middleware(new NextRequest(origin + "/brand/twin-blue-texture.png"))).status,200);
    assert.equal((await middleware(new NextRequest(origin + "/brand/twin-blue-texture.png", {method:"POST",headers:{"next-action":"known-action"}}))).status,403);
    for (const value of [undefined,"/","/twin","/login","//evil.example","/\\evil.example","/\t/evil.example","https://evil.example"]) assert.equal(safeAdminNext(value),"/revenue");
    assert.equal(safeAdminNext("/clones?tab=settings"),"/clones?tab=settings");
    assert.equal(isTwinLoginPath("/twins"),false);
    for (const path of ["/creator-management", "/creator-management/fixture", "/creator-other"]) {
      assert.equal(isTwinLoginPath(path), false, "prefix lookalikes are not public creator entries");
      const denied = await middleware(new NextRequest(origin + path));
      assert.notEqual(denied.status, 200, "signed-out management must never reach the data page");
    }
    for (const path of ["/creator", "/creator/login"]) assert.equal(isTwinLoginPath(path), true);
    for (const path of ["/creator-management", "/creator-management/fixture"]) {
      const allowed = await middleware(new NextRequest(origin + path, { headers: { cookie: `${SESSION_COOKIE}=${admin}` } }));
      assert.equal(allowed.status, 200, "verified administrator keeps its existing route access");
    }
    const request = (password:string,next:string,source=origin) => new NextRequest(origin + "/admin-auth", {method:"POST",headers:{origin:source,cookie:`${AGENCY_COOKIE}=stale; ${AGENCY_PORTAL_COOKIE}=moxy; clone_scope=other`},body:new URLSearchParams({password,next})});
    for (const next of ["/", "/twin", "//evil.example"]) {
      const response = await adminLogin(request("offline-routing-password",next));
      assert.equal(response.status,303);
      assert.equal(response.headers.get("location"),origin + "/revenue");
      assert.equal(await verifySessionToken(response.cookies.get(SESSION_COOKIE)?.value),true);
      for (const key of [AGENCY_COOKIE,AGENCY_PORTAL_COOKIE,"clone_scope"]) assert.equal(response.cookies.get(key)?.value,"");
    }
    assert.equal((await adminLogin(request("wrong","/"))).headers.get("location"),origin + "/twin?error=1");
    assert.equal((await adminLogin(request("offline-routing-password","/","https://evil.example"))).status,403);
    assert.equal(calls,0);
  } finally { globalThis.fetch = previous; }
  for (const file of ["app/page.tsx","app/twin/page.tsx"]) assert.match(readFileSync(file,"utf8"), /export \{ default, metadata \} from .*login\/page/);
  const layout = readFileSync("app/layout.tsx","utf8");
  assert.match(layout,/isTwinLoginPath\(pathname\) \? undefined/);
  assert.match(layout,/if \(isTwinLoginPath\(pathname\) \|\|/);
  // Link and LYNQ now share the approved dashboard branding, but keep their
  // own public route title and authentication endpoint.
  const linkPage = readFileSync("app/link/page.tsx","utf8");
  const lynqPage = readFileSync("app/lynq/page.tsx","utf8");
  const loginShell = readFileSync("app/lynq/LoginShell.tsx","utf8");
  assert.match(linkPage, /Sign in · Link/);
  assert.match(linkPage, /<LoginShell>/);
  assert.match(lynqPage, /<LoginShell>/);
  assert.match(loginShell, /<TwinWordmark agencyName="LYNQ"/);
  assert.match(loginShell, /data-lynq-login="light"/);
  assert.match(linkPage, /action="\/link\/auth"/);
  assert.match(readFileSync("app/moxy/page.tsx","utf8"), /Moxy/);
  console.log("Login routing passed: Twin root/twin, stale partner cookies, Link/LYNQ aliases, Moxy branding, authentication and action isolation");
}
main().catch(error => {console.error(error);process.exitCode=1;});
