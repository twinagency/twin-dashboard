import assert from "node:assert/strict";
import { agencyDashboardPath } from "../lib/agency-policy";
import { scopedSelection } from "../lib/agency-query";
import { dashboardFetch } from "../lib/agency-fetch";
import {
  CRM_FOUNDATION_READ_TABLES,
  allowedCrmCreatorIds,
  crmFoundationTable,
  scopeCrmFoundationReadUrl,
} from "../lib/crm-agency-scope";
import { withDashboardAccess } from "../lib/dashboard-access";

const agencyA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agencyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const cloneA = "11111111-1111-4111-8111-111111111111";
const cloneB = "22222222-2222-4222-8222-222222222222";
const creatorA = "33333333-3333-4333-8333-333333333333";
const creatorUnbound = "44444444-4444-4444-8444-444444444444";
const creatorWrongClone = "55555555-5555-4555-8555-555555555555";
const creatorOtherAgency = "66666666-6666-4666-8666-666666666666";
const connectionA = "77777777-7777-4777-8777-777777777777";
const connectionUnbound = "88888888-8888-4888-8888-888888888888";
const connectionOther = "99999999-9999-4999-8999-999999999999";
const accountA = "abababab-abab-4bab-8bab-abababababab";
const accountB = "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc";
const base = "https://crm-access.test.supabase.co/rest/v1/";

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: "https://crm-access.test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-crm-access-fixture",
  });

  assert.deepEqual([...CRM_FOUNDATION_READ_TABLES].sort(), [
    "crm_channel_connection_capabilities",
    "crm_channel_connections",
    "crm_creator_bindings",
    "crm_creators",
  ]);
  assert.equal(crmFoundationTable(new URL(base + "crm_creators")), "crm_creators");
  assert.equal(crmFoundationTable(new URL(base + "crm_activity_events")), null);

  const connectionProjection = scopedSelection("crm_channel_connections", "*").split(",");
  assert.ok(connectionProjection.includes("provider_account_id"));
  assert.equal(connectionProjection.includes("metadata"), false, "connection metadata is never agency-exposed");
  assert.throws(() => scopedSelection("crm_channel_connections", "*,metadata"), /Unsupported agency column/);
  assert.throws(() => scopedSelection("crm_creators", "*,crm_creator_bindings(*)"), /Unsupported/);

  assert.equal(agencyDashboardPath("/workspace/creators", "Tether", true), true);
  assert.equal(agencyDashboardPath("/crm/connections", "Tether", true), true);
  assert.equal(agencyDashboardPath("/workspace/creators", "Tether", false), false);
  assert.equal(agencyDashboardPath("/crm/connections", "Tether", false), false);
  assert.equal(agencyDashboardPath("/crm/connections/export", "Tether", true), false, "route access stays exact");

  const agencyIdentity = { id: agencyA, name: "Agency A", cloneIds: [cloneA] };
  const creatorIdentity = {
    ...agencyIdentity,
    id: `creator:${accountA}`,
    kind: "creator" as const,
    accountId: accountA,
    userId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    creatorName: "Creator A",
    onboarded: true,
    readOnly: false,
    agencyId: agencyA,
  };

  const originalFetch = globalThis.fetch;
  const finalReads: URL[] = [];
  let bindingError = false;
  let oversizedBindings = false;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "crm-access.test.supabase.co", "CRM access test must stay offline");
    const select = url.searchParams.get("select") || "";

    if (url.pathname === "/rest/v1/crm_creator_bindings" && select === "creator_id,creator_account_id,clone_id,agency_id") {
      if (bindingError) return new Response(JSON.stringify({ message: "offline error" }), { status: 503, headers: { "content-type": "application/json" } });
      const rows = oversizedBindings ? Array.from({ length: 1001 }, (_, index) => ({
        creator_id: `c0000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
        creator_account_id: accountB,
        clone_id: null,
        agency_id: agencyA,
      })) : [
        { creator_id: creatorA, creator_account_id: accountA, clone_id: cloneA, agency_id: agencyA },
        { creator_id: creatorUnbound, creator_account_id: accountB, clone_id: null, agency_id: agencyA },
        { creator_id: creatorWrongClone, creator_account_id: accountA, clone_id: cloneB, agency_id: agencyA },
        { creator_id: creatorOtherAgency, creator_account_id: accountA, clone_id: cloneB, agency_id: agencyB },
      ];
      return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json", "content-range": `0-${rows.length - 1}/${rows.length}` } });
    }
    if (url.pathname === "/rest/v1/crm_channel_connections" && select === "id,creator_id") {
      return new Response(JSON.stringify([
        { id: connectionA, creator_id: creatorA },
        { id: connectionUnbound, creator_id: creatorUnbound },
        { id: connectionOther, creator_id: creatorOtherAgency },
      ]), { headers: { "content-type": "application/json", "content-range": "0-2/3" } });
    }

    finalReads.push(url);
    return new Response(JSON.stringify([{ id: "safe-result" }]), { headers: { "content-type": "application/json" } });
  };

  try {
    oversizedBindings = true;
    await assert.rejects(allowedCrmCreatorIds(agencyIdentity), /exceeds the safe read limit/, "oversized rosters must fail closed, never truncate at 1,000 rows");
    oversizedBindings = false;

    const hostile = new URL(base + `crm_creators?select=*&id=eq.${creatorOtherAgency}&and=(id.eq.${creatorOtherAgency})`);
    const scoped = await scopeCrmFoundationReadUrl(hostile, agencyIdentity);
    const mandatory = scoped.searchParams.getAll("and");
    assert.equal(mandatory.length, 2, "the mandatory scope is appended beside hostile caller filters");
    assert.ok(mandatory[0].includes(creatorOtherAgency));
    assert.ok(mandatory[1].includes(creatorA));
    assert.ok(mandatory[1].includes(creatorUnbound));
    assert.equal(mandatory[1].includes(creatorWrongClone), false, "a clone outside the agency roster is excluded");
    assert.equal(mandatory[1].includes(creatorOtherAgency), false, "another agency is excluded");

    const creatorScoped = await scopeCrmFoundationReadUrl(new URL(base + "crm_creator_bindings?select=*"), creatorIdentity);
    const creatorMandatory = creatorScoped.searchParams.getAll("and").at(-1)!;
    assert.ok(creatorMandatory.includes(creatorA));
    assert.equal(creatorMandatory.includes(creatorUnbound), false, "another creator account remains hidden within the same agency");
    assert.equal(creatorMandatory.includes(creatorWrongClone), false);
    assert.equal(creatorMandatory.includes(creatorOtherAgency), false);

    const capabilityScoped = await scopeCrmFoundationReadUrl(new URL(base + "crm_channel_connection_capabilities?select=*"), agencyIdentity);
    const capabilityMandatory = capabilityScoped.searchParams.getAll("and").at(-1)!;
    assert.ok(capabilityMandatory.includes(connectionA));
    assert.ok(capabilityMandatory.includes(connectionUnbound));
    assert.equal(capabilityMandatory.includes(connectionOther), false, "capabilities derive only from allowed connections");

    await withDashboardAccess(agencyIdentity, async () => {
      const response = await dashboardFetch(base + `crm_creators?select=*&or=(id.eq.${creatorOtherAgency})`);
      assert.equal(response.status, 200);
      const read = finalReads.at(-1)!;
      assert.ok(read.searchParams.getAll("and").at(-1)?.includes(creatorA));
      assert.ok(read.searchParams.get("or")?.includes(creatorOtherAgency), "caller filter is retained but cannot replace mandatory scope");

      const beforeRejectedColumn = finalReads.length;
      assert.equal((await dashboardFetch(base + "crm_channel_connections?select=*,metadata")).status, 403);
      assert.equal(finalReads.length, beforeRejectedColumn, "a forbidden projection never reaches the data read");

      for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
        const beforeWrite = finalReads.length;
        assert.equal((await dashboardFetch(base + "crm_creators", { method })).status, 403);
        assert.equal(finalReads.length, beforeWrite, `${method} CRM mutation must not reach Supabase`);
      }
      assert.equal((await dashboardFetch(base + "crm_activity_events?select=*")).status, 403, "activity events are not exposed to agencies in Sprint 1");
    });

    bindingError = true;
    await withDashboardAccess(agencyIdentity, async () => {
      assert.equal((await dashboardFetch(base + "crm_creators?select=*")).status, 403, "assignment lookup errors fail closed");
    });
    bindingError = false;

    await withDashboardAccess(null, async () => {
      const before = finalReads.length;
      assert.equal((await dashboardFetch(base + "crm_creators", { method: "PATCH", body: "{}" })).status, 200);
      assert.equal(finalReads.length, before + 1, "internal admin behavior remains unchanged");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("HYBRID CRM ACCESS PASSED: narrow projections, exact routes, cross-agency isolation, creator binding checks, hostile-filter containment, fail-closed lookups and read-only enforcement.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
