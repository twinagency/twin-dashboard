/**
 * Child for tests/rules/G24-route-validator.test.ts; the `*.test.*` glob does not run it. Spawned under
 * --experimental-test-module-mocks. POSTs each body in argv[2] (a JSON array) to the REAL conversation controls route
 * (app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route.ts) as a synthetic agency chatter, and
 * prints the statuses as one JSON line. Replaced, as in W3-lib-onlyfans-2-route.child.ts: `next/headers` (synthetic session
 * cookie), `lib/view-as-banner.ts` (never viewing as), `lib/onlyfans/plan-c-owner.ts` (its "server-only" import). The wire is a
 * fake fetch at *.invalid origins answering 404 to every backend call. Synthetic values only.
 */
import { mock } from "node:test";
import { NextRequest } from "next/server";
import { namedOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";
import { SESSION_COOKIE } from "../../lib/session";
import { withDashboardAccess } from "../../lib/dashboard-access";

const DASH = "https://dash.fixture.invalid", BACKEND = "https://backend.fixture.invalid", SUPABASE = "https://supabase.fixture.invalid";
const UUID = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const CHATTER = { id: UUID(2), name: "Synthetic agency", cloneIds: [UUID(3)], userId: UUID(4), canManage: false, canChat: true };
const SESSION = ["owner", "1".repeat(64)].join("_");

async function main(bodies: unknown[]): Promise<number[]> {
  Object.assign(process.env, { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_KEY: "synthetic-service-key", ONLYFANS_API_BASE_URL: BACKEND,
    ONLYFANS_API_TOKEN: "synthetic-api", ONLYFANS_CONTROL_TOKEN: "synthetic-control", ONLYFANS_CONFIGURATION_TOKEN: "synthetic-configuration" });
  mock.module("next/headers", { namedExports: {
    cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE ? { name, value: SESSION } : undefined, getAll: () => [], has: () => false }),
    headers: async () => new Headers(),
  } });
  mock.module(new URL("../../lib/view-as-banner.ts", import.meta.url).href, { namedExports: { getViewAsBannerInfo: async () => null } });
  mock.module(new URL("../../lib/onlyfans/plan-c-owner.ts", import.meta.url).href, { namedExports: { namedOwnerActor } });
  globalThis.fetch = (async (input: RequestInfo | URL) => new URL(String(input)).origin === SUPABASE &&
    new URL(String(input)).pathname.endsWith("/dashboard_owner_session_verify") ? Response.json(true) : Response.json({ ok: false }, { status: 404 })) as typeof fetch;
  const { POST } = await import("../../app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route");
  const headers = { origin: DASH, "sec-fetch-site": "same-origin", "content-type": "application/json" };
  const statuses: number[] = [];
  for (const body of bodies) {
    const request = new NextRequest(`${DASH}/api/onlyfans-controls/accounts/of-a/conversations/conv-1`, { method: "POST", headers, body: JSON.stringify(body) });
    statuses.push((await withDashboardAccess(CHATTER, () => POST(request, { params: Promise.resolve({ accountId: "of-a", conversationId: "conv-1" }) }))).status);
  }
  return statuses;
}

main(JSON.parse(process.argv[2] ?? "[]") as unknown[]).then(out => process.stdout.write(JSON.stringify(out) + "\n"));
