// Regression guard (G25): was KNOWN RED tests/known-red/W4-lib-onlyfans-preview-2-plus2-middleware-view-as-exit-referer.test.ts (origin/jaka/fix-sweep-20261112), fixed in this PR (middleware.ts). Promoted: N1 (both), F19a. Original header below.
/**
 * KNOWN RED (W4 lib-onlyfans-preview-2-plus2 N1 [i] and F19a; REVIEW known failure mode "Auth skips" + inv 4 "every
 * /api/v1/* route authenticates itself"): middleware.ts:33-38,246-258 picks the creator branch from the client-sent
 * Referer header (`creatorReferrer`) before the admin session (:280-289) and before the self-authenticated prefix check
 * (:259). A request whose Referer is a dashboard /creator/... page therefore gets JSON 403 "Creator access unavailable"
 * whatever credential it carries:
 *   N1  an admin with a valid session who opens /admin/view-as from a creator page they were viewing is refused; an
 *       anonymous request with that Referer gets the creator 403 instead of the admin login redirect.
 *   F19a /api/v1/me with that Referer never reaches withModelKey.
 * Both fail closed today; the defect is that a client header picks the credential.
 * Fixed looks like: the Referer picks the creator branch only when a creator credential (creator cookie or creator
 * view-as) is present. Without one, a valid admin session passes through, a cookieless admin page redirects to /twin,
 * and /api/v1/* is handed to its own key check. A control pins the other side: with a (here unverifiable) creator
 * cookie the Referer still takes the creator branch.
 * The creator cookie is a synthetic unsigned value; verifyCreatorSession (lib/creator-session.ts:70-79) checks it with a
 * local HMAC under a synthetic CREATOR_SESSION_SECRET and rejects it before any database read, so no network is used.
 * Driven through the real `middleware()` with NODE_ENV=production and DASHBOARD_PUBLIC_ORIGIN=https://dashboard.invalid
 * set before import. BYPASS (declared): the admin session is an `owner_` token (low-entropy synthetic) and the one wire
 * call it causes, the Supabase RPC `dashboard_owner_session_verify` (lib/owner-auth.ts:4-19), is answered `true` by a
 * fake globalThis.fetch for https://supabase.invalid only; any other URL throws. No creator or view-as cookie is sent.
 * Team's Claude owns the fix. Not wired into npm scripts or init.sh.
 * Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' <this file>   (green)
 *      nice -n 10 node --import tsx --test --test-skip-pattern='^control' <this file>   (red, ERR_ASSERTION)
 */
import assert from "node:assert/strict";
import test from "node:test";

const ORIGIN = "https://dashboard.invalid";
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "production";
env.DASHBOARD_PUBLIC_ORIGIN = ORIGIN;
env.SUPABASE_URL = "https://supabase.invalid";
env.SUPABASE_SERVICE_KEY = "synthetic".repeat(4);
env.CREATOR_SESSION_SECRET = "synthetic".repeat(4);
for (const name of ["DASHBOARD_NO_AUTH", "TWIN_APP_MODE", "DASHBOARD_EXTRA_ORIGINS", "DASHBOARD_ALLOW_LEGACY_ADMIN_SESSIONS"]) delete env[name];
const OWNER_SESSION = "owner_" + "a".repeat(64);
const unexpected: string[] = [];
globalThis.fetch = (async (url: string | URL | Request) => {
  if (String(url) === "https://supabase.invalid/rest/v1/rpc/dashboard_owner_session_verify")
    return new Response("true", { status: 200, headers: { "Content-Type": "application/json" } });
  unexpected.push(String(url));
  throw new Error("network is not allowed in this test");
}) as typeof fetch;

async function run(path: string, { referer, session, creator }: { referer?: boolean; session?: boolean; creator?: boolean }) {
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../../middleware");
  const { SESSION_COOKIE } = await import("../../lib/session");
  const { CREATOR_SESSION_COOKIE } = await import("../../lib/creator-session");
  const headers = new Headers();
  if (referer) headers.set("referer", `${ORIGIN}/creator/dashboard`);
  const cookies = [session ? `${SESSION_COOKIE}=${OWNER_SESSION}` : "", creator ? `${CREATOR_SESSION_COOKIE}=synthetic.marker` : ""].filter(Boolean);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return middleware(new NextRequest(`${ORIGIN}${path}`, { method: "GET", headers }));
}
const describe = (r: Response) => `${r.status} location=${r.headers.get("location")} next=${r.headers.get("x-middleware-next")}`;
function assertPassedThrough(r: Response) {
  assert.equal(r.headers.get("x-middleware-next"), "1", `expected pass-through, got ${describe(r)}`);
  assert.deepEqual(unexpected, []);
}
function assertAdminLogin(r: Response) {
  assert.ok([302, 303, 307, 308].includes(r.status), `expected the admin login redirect, got ${describe(r)}`);
  assert.equal(new URL(r.headers.get("location") ?? "", ORIGIN).pathname, "/twin");
  assert.deepEqual(unexpected, []);
}

test("control: /admin/view-as with a valid admin session and no Referer passes through", async () => {
  assertPassedThrough(await run("/admin/view-as", { session: true }));
});

test("control: /admin/view-as with no session and no Referer redirects to /twin", async () => {
  assertAdminLogin(await run("/admin/view-as", {}));
});

test("control: /api/v1/me with no Referer passes through to its own key check", async () => {
  assertPassedThrough(await run("/api/v1/me", {}));
});

test("control: a creator cookie (unverifiable) + admin session + creator Referer still takes the creator branch", async () => {
  const response = await run("/admin/view-as", { session: true, referer: true, creator: true });
  assert.equal(response.status, 403, `expected the creator 403, got ${describe(response)}`);
  assert.match(await response.text(), /Creator access unavailable/);
  assert.deepEqual(unexpected, []);
});

test("N1: /admin/view-as with a valid admin session and a creator-page Referer passes through", async () => {
  assertPassedThrough(await run("/admin/view-as", { session: true, referer: true }));
});

test("N1: /admin/view-as with no session and a creator-page Referer redirects to /twin, not a creator 403", async () => {
  assertAdminLogin(await run("/admin/view-as", { referer: true }));
});

test("F19a: /api/v1/me with a creator-page Referer passes through to its own key check", async () => {
  assertPassedThrough(await run("/api/v1/me", { referer: true }));
});
