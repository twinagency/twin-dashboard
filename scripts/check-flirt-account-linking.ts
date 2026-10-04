import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { identity, ID, CLONES } from "../deployment/flirt-live-twin.cjs";
import { withDashboardAccess } from "../lib/dashboard-access";
import { creatorBotLinkValues, getCreatorBotOptions, resolveCreatorBot } from "../lib/agency-creator-links";
import { POST as linkBot } from "../app/agency/creators/link/route";
import AccountsPage from "../app/agency/creators/page";

async function main() {
  Object.assign(globalThis, { React });
  configureFlirtOfflineEnv();
  Object.assign(process.env, {
    NODE_ENV: "production",
    FLIRT_LIVE_TWIN_ENABLED: "true",
    FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw",
    SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co",
    FLIRT_LIVE_TWIN_URL: "https://aouaenqayfltoqrmpitg.supabase.co",
    FLIRT_LIVE_TWIN_SERVICE_KEY: "sb_secret_synthetic_test_only_abcdefghijklmnopqrstuvwxyz",
  });
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const otherAccount = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const ungrantedBot = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const bots = CLONES.map((id, index) => ({ id, name: `Allowed bot ${index}`, slug: `allowed-bot-${index}` }));
  let conflict = false, failedSave = false, failedRead = false;
  const writes: any[] = [];
  const liveReads: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    let result: unknown = [];
    if (url.hostname === "aouaenqayfltoqrmpitg.supabase.co") {
      assert.equal(method, "GET", "linking never mutates Twin");
      assert.equal(url.pathname, "/rest/v1/clones", "only scoped bot lookups reach Twin");
      assert.equal(url.searchParams.get("id"), `in.(${CLONES.join(",")})`);
      liveReads.push(url.href);
      if (failedRead) return new Response(JSON.stringify({ message: "offline lookup failure" }), { status: 503 });
      result = bots;
    } else {
      assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co", "intake must stay in FLIRT");
      if (method !== "GET") {
        assert.equal(url.pathname, "/rest/v1/creator_clone_links");
        assert.equal(method, "POST", "never delete or steal an existing link");
        writes.push(JSON.parse(String(init?.body)));
        if (failedSave) return new Response(JSON.stringify({ code: "23505", message: "duplicate" }), { status: 409 });
        result = [];
      } else switch (url.pathname) {
        case "/rest/v1/partner_agencies": result = { id: ID, name: "FLIRT" }; break;
        case "/rest/v1/agency_creators": result = []; break;
        case "/rest/v1/creator_agency_assignments":
          assert.equal(url.searchParams.get("agency_id"), `eq.${ID}`);
          result = !url.searchParams.has("creator_account_id") ? [{ creator_account_id: account, agency_id: ID }]
            : url.searchParams.get("creator_account_id") === `eq.${account}` ? { creator_account_id: account } : null;
          break;
        case "/rest/v1/creator_clone_links":
          if (!url.searchParams.has("twin_slug")) {
            result = [{ creator_account_id: account, clone_id: null, twin_slug: bots[2].slug }];
            break;
          }
          assert.equal(url.searchParams.get("twin_slug"), `eq.${bots[0].slug}`);
          assert.equal(url.searchParams.get("creator_account_id"), `neq.${account}`);
          result = conflict ? [{ creator_account_id: otherAccount }] : [];
          break;
        case "/rest/v1/clones": result = []; break;
        case "/rest/v1/creator_accounts": result = [{ id: account, display_name: "Example creator", email: "example@example.invalid", account_status: "applicant", created_at: "2026-10-04T00:00:00Z" }]; break;
        case "/rest/v1/creator_applications": result = [{ creator_account_id: account, status: "submitted" }]; break;
        case "/rest/v1/creator_onboarding_progress": result = [{ creator_account_id: account, questionnaire_completed: true, content_completed: true }]; break;
        case "/rest/v1/creator_files": result = [{ creator_account_id: account, storage_transfer_status: "verified" }]; break;
        default: throw new Error(`Unexpected ${url.pathname}`);
      }
    }
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  };
  const req = (fields: Record<string, string>, source = origin) => new NextRequest(origin + "/agency/creators/link", { method: "POST", headers: { origin: source }, body: new URLSearchParams(fields) });
  const fields = { creator_account_id: account, clone_id: CLONES[0] };
  try {
    assert.equal((await withDashboardAccess(null, () => linkBot(req(fields)))).status, 401);
    await withDashboardAccess(identity(), async () => {
      assert.equal((await linkBot(req(fields, "https://evil.example"))).status, 403);
      assert.equal((await linkBot(req({ ...fields, creator_account_id: otherAccount }))).status, 403);
      assert.equal((await linkBot(req({ ...fields, clone_id: ungrantedBot }))).status, 403);
      const unchanged = await linkBot(req({ ...fields, clone_id: "" }));
      assert.match(unchanged.headers.get("location")!, /linkResult=unchanged$/);
      assert.equal(writes.length, 0, "empty selection preserves existing slug-only links");

      const options = await getCreatorBotOptions({ id: ID, name: "FLIRT", cloneIds: [] });
      assert.equal(options.source, "twin-live");
      assert.deepEqual(options.clones, bots);
      assert.equal(resolveCreatorBot({ clone_id: null, twin_slug: bots[0].slug }, bots)?.id, CLONES[0]);
      assert.equal(resolveCreatorBot({ clone_id: null, twin_slug: "outside-scope" }, bots), undefined);
      assert.deepEqual(creatorBotLinkValues(options, bots[0]), { clone_id: null, twin_slug: bots[0].slug });

      const html = renderToStaticMarkup(await AccountsPage({ searchParams: Promise.resolve({}) }));
      assert.ok(html.includes(`href="/clones/${CLONES[2]}"`), "slug-only link opens the correct allowed bot");
      assert.ok(html.includes(`value="${CLONES[2]}" selected=""`), "saved slug-only bot stays selected, rather than defaulting to the first bot");
      assert.ok(html.includes("Keep current link"));
      assert.ok(html.includes("Review profile &amp; content"));
      assert.equal(writes.length, 0, "rendering the account list must not change links");

      const ok = await linkBot(req(fields));
      assert.match(ok.headers.get("location")!, /linkResult=linked$/);
      assert.equal(writes.length, 1);
      assert.deepEqual(Object.fromEntries(Object.entries(writes[0]).filter(([key]) => key !== "linked_at")), {
        creator_account_id: account, clone_id: null, twin_slug: bots[0].slug,
      });

      writes.length = 0;
      conflict = true;
      assert.match((await linkBot(req(fields))).headers.get("location")!, /linkResult=conflict$/);
      assert.equal(writes.length, 0, "existing link is never stolen");
      conflict = false; failedSave = true;
      assert.match((await linkBot(req(fields))).headers.get("location")!, /linkResult=conflict$/);
      failedSave = false; failedRead = true; writes.length = 0;
      assert.match((await linkBot(req(fields))).headers.get("location")!, /linkResult=error$/);
      assert.equal(writes.length, 0, "lookup failures fail closed");
      failedRead = false;
    });
    const readsBefore = liveReads.length;
    await withDashboardAccess({ id: ID, name: "FLIRT", cloneIds: [] }, async () => {
      assert.equal((await linkBot(req(fields))).status, 403, "local agency identity cannot claim live Twin scope");
    });
    assert.equal(liveReads.length, readsBefore);
    assert.deepEqual(creatorBotLinkValues({ source: "local", clones: bots }, bots[0]), { clone_id: CLONES[0], twin_slug: bots[0].slug });
  } finally { globalThis.fetch = original; }
  console.log("FLIRT ACCOUNT LINKING PASSED: scoped live bot choices, slug-only mapping, origin/account checks, safe blank saves, conflict protection and read failures");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
