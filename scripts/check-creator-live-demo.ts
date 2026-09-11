import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { creatorDashboardIdentity } from "../lib/creator-dashboard-identity";
import {
  BRI_LIVE_DEMO_ACCOUNT_ID,
  BRI_LIVE_DEMO_AGENCY_ID,
  BRI_LIVE_DEMO_CLONE_ID,
} from "../lib/creator-live-demo-policy";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";
import { middleware } from "../middleware";
import { POST as onboardingPOST } from "../app/creator-auth/onboarding/route";
import { POST as uploadPOST } from "../app/creator-auth/upload/route";

const origin = "https://dashboard.tgaiclone.xyz";
const userId = "99999999-9999-4999-8999-999999999999";
const otherAccountId = "88888888-8888-4888-8888-888888888888";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    SUPABASE_URL: "https://creator-live-demo.test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-only-service-key",
    CREATOR_SESSION_SECRET: "offline-only-creator-session-secret",
  });

  const previous = globalThis.fetch;
  let briAssigned = true;
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "creator-live-demo.test.supabase.co", "The live-demo test must stay offline");
    if (!["GET", "HEAD"].includes(request.method)) {
      writes++;
      throw new Error(`Unexpected demo write ${request.method} ${url.pathname}`);
    }
    let body: unknown;
    if (url.pathname === "/rest/v1/creator_accounts") {
      const accountId = url.searchParams.get("id")?.replace(/^eq\./, "") || "";
      body = {
        id: accountId,
        auth_user_id: userId,
        display_name: accountId === BRI_LIVE_DEMO_ACCOUNT_ID ? "Bri Live Preview" : "Unrelated preview",
        account_status: "active",
        source: "admin",
      };
    } else if (url.pathname === "/rest/v1/creator_applications") body = { status: "approved" };
    else if (url.pathname === "/rest/v1/creator_agency_assignments") body = {
      agency_id: BRI_LIVE_DEMO_AGENCY_ID,
      partner_agencies: { name: "LYNQ", active: true },
    };
    else if (url.pathname === "/rest/v1/creator_clone_links") body = null;
    else if (url.pathname === "/rest/v1/agency_creators") body = briAssigned ? {
      clone_id: BRI_LIVE_DEMO_CLONE_ID,
      clones: { id: BRI_LIVE_DEMO_CLONE_ID, name: "Briana Redd" },
    } : null;
    else throw new Error(`Unexpected demo read ${url.pathname}`);
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };

  try {
    const token = await signCreatorSession(BRI_LIVE_DEMO_ACCOUNT_ID, userId);
    const identity = await creatorDashboardIdentity(token);
    assert.ok(identity);
    assert.equal(identity.readOnly, true);
    assert.equal(identity.name, "LYNQ");
    assert.equal(identity.creatorName, "Briana Redd");
    assert.deepEqual(identity.cloneIds, [BRI_LIVE_DEMO_CLONE_ID]);

    const cookie = `${CREATOR_SESSION_COOKIE}=${token}`;
    const request = (path: string, method = "GET") => new NextRequest(origin + path, {
      method,
      headers: { cookie, origin, referer: origin + "/creator" },
    });
    assert.equal((await middleware(request("/creator"))).status, 200);
    assert.equal((await middleware(request(`/api/dashboard?clone=${BRI_LIVE_DEMO_CLONE_ID}`))).status, 200);
    assert.equal((await middleware(request("/api/dashboard?clone=44444444-4444-4444-8444-444444444444"))).status, 403);
    assert.equal((await middleware(request(`/api/dashboard?clone=${BRI_LIVE_DEMO_CLONE_ID}`, "POST"))).status, 403);
    assert.equal((await onboardingPOST(request("/creator-auth/onboarding", "POST"))).status, 403);
    assert.equal((await uploadPOST(request("/creator-auth/upload", "POST"))).status, 403);
    assert.equal(writes, 0, "The Bri preview must not write to Bri's account, clone or onboarding records");

    const otherToken = await signCreatorSession(otherAccountId, userId);
    const other = await creatorDashboardIdentity(otherToken);
    assert.ok(other);
    assert.equal(other.readOnly, false);
    assert.deepEqual(other.cloneIds, [], "No other creator account may inherit Bri's live clone");

    briAssigned = false;
    assert.equal(await creatorDashboardIdentity(token), null, "The preview fails closed if Bri leaves LYNQ");

    for (const path of [
      "app/creator-auth/identity/route.ts",
      "app/creator-auth/onboarding/route.ts",
      "app/creator-auth/upload/route.ts",
    ]) assert.match(readFileSync(path, "utf8"), /creator\.readOnly/, `${path} must deny demo writes`);

    console.log("BRI LIVE DEMO PASSED: exact-account-only live scope, LYNQ assignment validation, no Bri account/link changes and all creator writes denied.");
  } finally {
    globalThis.fetch = previous;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
