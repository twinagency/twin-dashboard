import { portalLoginPath } from "../lib/agency-brand";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { flirtForeignBrandDecision } from "../lib/flirt-brand-policy";
import { middleware } from "../middleware";

const flirt = { FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw" };
assert.equal(portalLoginPath("flirt"), "/agency/login");
assert.equal(portalLoginPath(), "/link");
const twin = {} as Record<string, string>;

// Policy: other brands vanish on the FLIRT host only.
for (const path of ["/lynq", "/link", "/moxy", "/tether", "/jess-and-kate-ai", "/ava", "/lynq/auth", "/link/reset", "/tether/auth", "/moxy/auth", "/creator-auth/link/signup", "/creator-auth/tether/signup"]) {
  assert.deepEqual(flirtForeignBrandDecision(path, "GET", flirt), { action: "notfound" }, path);
  assert.equal(flirtForeignBrandDecision(path, "GET", twin), null, `${path} must be untouched outside FLIRT`);
}
assert.deepEqual(flirtForeignBrandDecision("/creator/link/signup", "GET", flirt), { action: "redirect", path: "/creator/signup" });
assert.deepEqual(flirtForeignBrandDecision("/creator/link/reset-password", "GET", flirt), { action: "redirect", path: "/creator/reset-password" });
assert.deepEqual(flirtForeignBrandDecision("/creator/tether/forgot-password", "HEAD", flirt), { action: "redirect", path: "/creator/forgot-password" });
assert.deepEqual(flirtForeignBrandDecision("/creator/moxy/login", "GET", flirt), { action: "redirect", path: "/creator/login" });
assert.deepEqual(flirtForeignBrandDecision("/creator/moxy/whatever", "GET", flirt), { action: "redirect", path: "/creator/login" });
assert.deepEqual(flirtForeignBrandDecision("/creator/link/signup", "POST", flirt), { action: "notfound" });
assert.equal(flirtForeignBrandDecision("/agency/login", "GET", flirt), null);
for (const path of ["/creator/login", "/creator/signup", "/creator/forgot-password", "/creator/reset-password", "/creator/onboarding", "/creator-auth/signup", "/creator-auth/login", "/login", "/agency/creators", "/agency/creator-invites", "/linkedin", "/avatar", "/api/health"]) {
  assert.equal(flirtForeignBrandDecision(path, "GET", flirt), null, `${path} is FLIRT's own and must stay`);
}
assert.equal(flirtForeignBrandDecision("/agency/login", "GET", twin), null);
assert.equal(flirtForeignBrandDecision("/creator/link/signup", "GET", twin), null);

async function main() {
  // Middleware: invite codes survive the old LYNQ creator link.
  configureFlirtOfflineEnv();
  Object.assign(process.env, flirt);
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const entry = await middleware(new NextRequest(origin + "/agency/login"));
  assert.equal(entry.status, 200);
  assert.equal(entry.headers.get("location"), null);
  const moved = await middleware(new NextRequest(origin + "/creator/link/signup?code=ABC234DEFG"));
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.get("location"), origin + "/creator/signup?code=ABC234DEFG");
  assert.equal((await middleware(new NextRequest(origin + "/lynq"))).status, 404);
  assert.equal((await middleware(new NextRequest(origin + "/creator-auth/link/signup", { method: "POST", headers: { origin } }))).status, 404);
  assert.equal((await middleware(new NextRequest(origin + "/creator/login"))).status, 200);
  console.log("FLIRT BRAND POLICY PASSED: LYNQ/Link/Moxy/Tether/Ava portals and sign-ups are gone on FLIRT, own pages and invite codes untouched, Twin unaffected");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
