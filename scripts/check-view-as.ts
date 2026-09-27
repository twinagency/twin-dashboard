// ── Checks for master-admin "View as" (dashboard) and "act as" (admin API) ──
// Run: npm run test:view-as
//
// Covers: a view-as cookie is ignored without an admin session, an expired
// cookie/session is ignored, identity resolves to the target, mutations are
// blocked while viewing as someone, and act-as rejects a missing admin key
// and a non-allowed network.

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { signSession, SESSION_COOKIE } from "../lib/session";
import { signViewAs, verifyViewAs, VIEW_AS_COOKIE } from "../lib/view-as-session";
import { activeViewAs, resolveViewAsAgency, resolveViewAsCreator, VIEW_AS_EXIT_PATH } from "../lib/view-as";
import { middleware } from "../middleware";
import { GET as actAsRevenue } from "../app/api/admin/v1/act-as/revenue/route";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; })
    .catch((e) => { failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`); });
}

const origin = "https://dashboard.tgaiclone.xyz";
const AGENCY_ID = "74b03b70-397e-49ab-841f-8adb8241d87d"; // LYNQ_MANAGEMENT_AGENCY_ID, a real-shaped fixture id
const CREATOR_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function cookieJar(pairs: Record<string, string>) {
  const cookie = Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(origin + "/revenue", { headers: cookie ? { cookie } : {} }).cookies;
}

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    DASHBOARD_PASSWORD: "offline-admin-password",
    SUPABASE_URL: "https://view-as-test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-test-key",
    TWIN_ADMIN_API_KEY: "a".repeat(40),
  });

  // Mocked Supabase REST responses, shared by every check below.
  let agencyActive = true;
  let creatorStatus: string | null = "active";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    let body: unknown = null;
    if (url.pathname === "/rest/v1/partner_agencies") {
      body = agencyActive ? { id: AGENCY_ID, name: "LYNQ" } : null;
    } else if (url.pathname === "/rest/v1/agency_creators") {
      body = [{ clone_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }];
    } else if (url.pathname === "/rest/v1/creator_accounts") {
      body = creatorStatus ? { id: CREATOR_ID, auth_user_id: "user-1", display_name: "Riley", account_status: creatorStatus, source: "admin" } : null;
    } else if (url.pathname === "/rest/v1/creator_applications") {
      body = null;
    } else if (url.pathname === "/rest/v1/creator_agency_assignments") {
      body = null;
    } else if (url.pathname === "/rest/v1/creator_clone_links") {
      body = null;
    } else {
      return new Response(JSON.stringify(null), { headers: { "content-type": "application/json" } });
    }
    void init;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    await check("V1 a view-as cookie is ignored without an admin session", async () => {
      const token = await signViewAs("agency", AGENCY_ID, "master-admin");
      const jar = cookieJar({ [VIEW_AS_COOKIE]: token }); // no SESSION_COOKIE at all
      assert.equal(await activeViewAs(jar), null);
      assert.equal(await resolveViewAsAgency(jar), null);
    });

    await check("V2 a view-as cookie is ignored when the admin session cookie is garbage/expired", async () => {
      const token = await signViewAs("agency", AGENCY_ID, "master-admin");
      const jar = cookieJar({ [VIEW_AS_COOKIE]: token, [SESSION_COOKIE]: "not-a-real-session-token" });
      assert.equal(await activeViewAs(jar), null);
    });

    await check("V3 an expired view-as cookie is ignored even with a currently-valid admin session", async () => {
      const session = await signSession();
      const token = await signViewAs("agency", AGENCY_ID, "master-admin");
      const realNow = Date.now;
      try {
        Date.now = () => realNow() + 2 * 60 * 60 * 1000; // +2h, past the 1h TTL
        assert.equal(await verifyViewAs(token), null);
        const jar = cookieJar({ [VIEW_AS_COOKIE]: token, [SESSION_COOKIE]: session });
        assert.equal(await activeViewAs(jar), null);
      } finally {
        Date.now = realNow;
      }
    });

    await check("V4 a live view-as cookie plus a live admin session resolves to the target identity", async () => {
      const session = await signSession();
      const agencyToken = await signViewAs("agency", AGENCY_ID, "master-admin");
      const agencyJar = cookieJar({ [VIEW_AS_COOKIE]: agencyToken, [SESSION_COOKIE]: session });
      const viewAs = await activeViewAs(agencyJar);
      assert.equal(viewAs?.targetType, "agency");
      assert.equal(viewAs?.targetId, AGENCY_ID);
      const agency = await resolveViewAsAgency(agencyJar);
      assert.equal(agency?.id, AGENCY_ID);
      assert.equal(agency?.name, "LYNQ");

      const creatorToken = await signViewAs("creator", CREATOR_ID, "master-admin");
      const creatorJar = cookieJar({ [VIEW_AS_COOKIE]: creatorToken, [SESSION_COOKIE]: session });
      const creator = await resolveViewAsCreator(creatorJar);
      assert.equal(creator?.accountId, CREATOR_ID);
      assert.equal(creator?.readOnly, true, "a view-as creator identity must always be read-only");
    });

    await check("V5 resolveViewAsAgency/Creator refuse a target that no longer exists", async () => {
      const session = await signSession();
      agencyActive = false;
      creatorStatus = null;
      try {
        const agencyToken = await signViewAs("agency", AGENCY_ID, "master-admin");
        assert.equal(await resolveViewAsAgency(cookieJar({ [VIEW_AS_COOKIE]: agencyToken, [SESSION_COOKIE]: session })), null);
        const creatorToken = await signViewAs("creator", CREATOR_ID, "master-admin");
        assert.equal(await resolveViewAsCreator(cookieJar({ [VIEW_AS_COOKIE]: creatorToken, [SESSION_COOKIE]: session })), null);
      } finally {
        agencyActive = true;
        creatorStatus = "active";
      }
    });

    await check("V6 mutations are blocked while viewing as someone (server action AND non-GET method)", async () => {
      const session = await signSession();
      const token = await signViewAs("agency", AGENCY_ID, "master-admin");
      const cookie = `${SESSION_COOKIE}=${session}; ${VIEW_AS_COOKIE}=${token}`;

      const postRes = await middleware(new NextRequest(origin + "/clones/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", { method: "POST", headers: { cookie } }));
      assert.equal(postRes.status, 403);

      const actionRes = await middleware(new NextRequest(origin + "/revenue", { method: "POST", headers: { cookie, "next-action": "deadbeef" } }));
      assert.equal(actionRes.status, 403);

      const getRes = await middleware(new NextRequest(origin + "/revenue", { headers: { cookie } }));
      assert.notEqual(getRes.status, 403, "a plain GET while viewing as must NOT be blocked by the mutation guard");
    });

    await check("V7 the exit path is exempt from the mutation guard so leaving view-as mode always works", async () => {
      const session = await signSession();
      const token = await signViewAs("agency", AGENCY_ID, "master-admin");
      const cookie = `${SESSION_COOKIE}=${session}; ${VIEW_AS_COOKIE}=${token}`;
      const res = await middleware(new NextRequest(origin + VIEW_AS_EXIT_PATH, {
        method: "POST",
        headers: { cookie, origin, "x-forwarded-for": "127.0.0.1" },
      }));
      assert.notEqual(res.status, 403);
    });

    await check("V8 without any view-as cookie, an ordinary admin mutation is unaffected", async () => {
      const session = await signSession();
      const res = await middleware(new NextRequest(origin + "/revenue", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${session}`, "next-action": "deadbeef" } }));
      assert.notEqual(res.status, 403);
    });

    await check("V9 act-as rejects a missing admin key", async () => {
      const req = new Request(origin + "/api/admin/v1/act-as/revenue", {
        headers: { host: "localhost:3001", "x-twin-act-as": "clone:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
      });
      const res = await actAsRevenue(req);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.code, "missing_key");
    });

    await check("V10 act-as rejects a non-allowed network even with a valid key", async () => {
      const req = new Request(origin + "/api/admin/v1/act-as/revenue", {
        headers: {
          authorization: `Bearer ${process.env.TWIN_ADMIN_API_KEY}`,
          "x-forwarded-for": "8.8.8.8",
          "x-twin-act-as": "clone:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        },
      });
      const res = await actAsRevenue(req);
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.code, "network_denied");
    });

    await check("V11 act-as with a good key/network but no x-twin-act-as header 400s before touching the DB", async () => {
      const req = new Request(origin + "/api/admin/v1/act-as/revenue", {
        headers: { authorization: `Bearer ${process.env.TWIN_ADMIN_API_KEY}`, host: "localhost:3001" },
      });
      const res = await actAsRevenue(req);
      assert.equal(res.status, 400);
    });
  } finally {
    globalThis.fetch = oldFetch;
  }

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ALL ${total} CHECKS PASSED\n`);
}

main();
