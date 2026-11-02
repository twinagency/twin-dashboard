import { syntheticAdminSessionRpc } from "./synthetic-admin-session-rpc";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { isMarketingPath } from "../lib/marketing-routing";
import { SESSION_COOKIE, signSession } from "../lib/session";

async function main() {
  Object.assign(process.env, { NODE_ENV: "production", DASHBOARD_PASSWORD: "offline-public-site-test" });
  process.env.SUPABASE_URL="https://session-fixture.invalid"; process.env.SUPABASE_SERVICE_KEY="synthetic-only";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => { const rpc = syntheticAdminSessionRpc(input, init); if(rpc) return rpc; calls++; throw new Error("Public marketing must not fetch private data"); };
  const admin = await signSession();
  try {
    for (const path of ["/twin-agency", "/twin-agency/", "/ava", "/ava/"]) assert.equal(isMarketingPath(path), true);
    for (const path of ["/", "/twin", "/twin-agency-secret", "/twin-agency/revenue", "/twin-agency/api", "/ava-secret", "/ava/revenue", "/revenue", "/api/dashboard", undefined, null]) assert.equal(isMarketingPath(path), false);
    for (const publicPath of ["/twin-agency", "/twin-agency/", "/ava", "/ava/"]) {
      for (const cookie of ["", "twin_agency_portal=moxy", "twin_agency_access=expired; twin_agency_portal=moxy", "twin_agency_access=expired; twin_agency_portal=lynq", "twin_agency_access=expired; twin_agency_portal=jess-and-kate-ai", `${SESSION_COOKIE}=${admin}`]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await middleware(new NextRequest(`https://dashboard.tgaiclone.xyz${publicPath}?clone=foreign`, { method, headers: { cookie, "x-pathname": "/revenue" } }));
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("location"), null);
          assert.equal(response.headers.get("x-middleware-rewrite"), null);
          assert.equal(response.headers.get("x-middleware-request-x-pathname"), publicPath);
          assert.match(response.headers.get("x-robots-tag")!, /noindex/);
          assert.match(response.headers.get("cache-control")!, /no-store/);
        }
        for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) assert.equal((await middleware(new NextRequest(`https://dashboard.tgaiclone.xyz${publicPath}`, { method, headers: { cookie } }))).status, 403);
        assert.equal((await middleware(new NextRequest(`https://dashboard.tgaiclone.xyz${publicPath}`, { headers: { cookie, "next-action": "known-action-id" } }))).status, 403);
      }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }

  const page = readFileSync("app/twin-agency/page.tsx", "utf8");
  const client = readFileSync("app/twin-agency/MarketingSite.tsx", "utf8");
  const ava = readFileSync("app/ava/page.tsx", "utf8");
  for (const source of [page, client, ava]) {
    assert.doesNotMatch(source, /supabase|serviceClient|supabaseAdmin|fetch\s*\(|["']use server["']|localStorage|sessionStorage/);
    assert.doesNotMatch(source, /<form\b|<input\b|signUp\s*\(/);
    assert.doesNotMatch(source, /\u2014/);
  }
  assert.match(client, /Fans paying right now across the globe/);
  assert.match(client, /creator dashboard are not connected yet/);
  assert.match(client, /Tokyo/);
  assert.match(client, /TelegramPhone/);
  assert.match(ava, /TelegramPhone/);
  assert.match(ava, /Everything You Need/);
  const layout = readFileSync("app/layout.tsx", "utf8");
  const metadata = layout.slice(layout.indexOf("export async function generateMetadata"), layout.indexOf("export default async function RootLayout"));
  const render = layout.slice(layout.indexOf("export default async function RootLayout"));
  assert.ok(metadata.indexOf("if (isMarketingPath(pathname))") < metadata.indexOf("await getDashboardAccess()"));
  assert.ok(render.indexOf("if (isMarketingPath(pathname))") < render.indexOf("await getDashboardAccess()"));
  assert.match(readFileSync("app/page.tsx", "utf8"), /login\/page/);
  console.log("Public marketing route checks passed: Twin Agency and Ava are public with or without trailing slash, stale partner cookies ignored, no private data/account writes, branded logins preserved.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
