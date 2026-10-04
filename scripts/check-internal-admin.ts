import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { signSession, verifySessionToken, SESSION_COOKIE } from "../lib/session";
import { CREATOR_SESSION_COOKIE } from "../lib/creator-session";
import { AGENCY_COOKIE } from "../lib/agency-policy";

process.env.DASHBOARD_SESSION_SECRET = "offline-internal-admin-test-only";
let jar: Record<string, string | undefined> = {};
let queries = 0;
function load(path: string, dependencies: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext(`(function(require,exports){${source}\n})`, {})((name: string) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, exports);
  return exports;
}
async function main() {
  const admin = await signSession();
  const guard = load("lib/internal-admin.ts", {
    "next/headers": { cookies: async () => ({ get: (name: string) => jar[name] ? { value: jar[name] } : undefined }) },
    "./session": { SESSION_COOKIE, verifySessionToken }, "./creator-session": { CREATOR_SESSION_COOKIE }, "./agency-policy": { AGENCY_COOKIE },
  });
  const db = { from: () => { queries++; throw new Error("query-reached"); }, storage: { from: () => { queries++; throw new Error("query-reached"); } } };
  const pageDependencies = {
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null }, "next/link": { default: () => null },
    "next/navigation": { redirect: () => { throw new Error("redirect-denied"); }, notFound: () => { throw new Error("not-found"); } },
    "@/lib/internal-admin": guard, "@/lib/dashboard-access": { getDashboardAccess: async () => null },
    "@/lib/supabase": { supabaseAdmin: db }, "@/components/ui/card": {}, "@/components/ui/button": {}, "../actions": {},
  };
  const list = load("app/creator-management/page.tsx", pageDependencies).default;
  const detail = load("app/creator-management/[id]/page.tsx", pageDependencies).default;
  const mutations = load("app/creator-management/actions.ts", {
    "@/lib/internal-admin": guard, "next/cache": { revalidatePath: () => {} },
    "@/lib/agency-management": { guardDashboardAction: async () => {} }, "@/lib/supabase": { supabaseAdmin: db },
  });
  for (const audience of [{}, { [CREATOR_SESSION_COOKIE]: "creator-only" }, { [AGENCY_COOKIE]: "agency-only" }, { [SESSION_COOKIE]: "broken.token" }, { [SESSION_COOKIE]: admin, [CREATOR_SESSION_COOKIE]: "creator-only" }, { [SESSION_COOKIE]: admin, [AGENCY_COOKIE]: "agency-only" }]) {
    jar = audience;
    assert.equal(await guard.hasInternalAdminAccess(), false);
    await assert.rejects(guard.requireInternalAdmin(), /Administrator access required/);
    await assert.rejects(list(), /redirect-denied/);
    await assert.rejects(detail({ params: Promise.resolve({ id: "disposable-fixture" }) }), /redirect-denied/);
    for (const fn of [mutations.updateCreatorReviewStatus, mutations.linkCreatorClone, mutations.assignCreatorAgency]) await assert.rejects(fn(new FormData()), /Administrator access required/);
    assert.equal(queries, 0, "denied audiences must not query or sign private content");
  }
  jar = { [SESSION_COOKIE]: admin };
  assert.equal(await guard.hasInternalAdminAccess(), true);
  await guard.requireInternalAdmin();
  await assert.rejects(list(), /query-reached/);
  await assert.rejects(detail({ params: Promise.resolve({ id: "disposable-fixture" }) }), /query-reached/);
  assert.ok(queries > 0, "verified admin reaches existing query path");
  console.log("Internal-admin boundaries passed: signed-out, creator, agency, malformed and mixed sessions stop before private queries/actions; verified admin remains allowed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
