import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { withDashboardAccess } from "../lib/dashboard-access";
import {
  CrmMutationError,
  disconnectCrmChannelConnection,
  parseResolveCrmMappingConflictInput,
  resolveCrmMappingConflict,
  setCrmCreatorBinding,
  updateCrmCreator,
  upsertCrmChannelConnection,
} from "../lib/crm-foundation-write";

const agencyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const creatorId = "33333333-3333-4333-8333-333333333333";
const cloneId = "11111111-1111-4111-8111-111111111111";
const accountId = "abababab-abab-4bab-8bab-abababababab";
const conflictId = "88888888-8888-4888-8888-888888888888";

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: "https://crm-write.test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-crm-write-fixture",
  });

  const originalFetch = globalThis.fetch;
  const requests: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  let staleUpdate = false;
  let missingCreatorTwinLink = false;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "crm-write.test.supabase.co", "CRM write checks must stay offline");
    const body = request.method === "POST" ? JSON.parse(await request.text()) as Record<string, unknown> : null;
    requests.push({ method: request.method, path: url.pathname, body });

    if (url.pathname === "/rest/v1/crm_creator_bindings") {
      return Response.json({
        creator_id: creatorId,
        creator_account_id: accountId,
        clone_id: cloneId,
        agency_id: agencyId,
        revision: 4,
      });
    }
    if (url.pathname === "/rest/v1/crm_channel_connections") {
      return Response.json({
        creator_id: creatorId,
        provider: "onlyfans",
        provider_account_id: "private-provider-id",
        handle: "existing-handle",
        display_name: "Existing account",
        connection_status: "connected",
        sync_status: "current",
        last_verified_at: "2026-09-16T00:00:00.000Z",
        last_synced_at: "2026-09-16T00:00:00.000Z",
        metadata: { verification_source: "provider" },
        revision: 7,
      });
    }
    if (url.pathname === "/rest/v1/partner_agencies") return Response.json({ id: agencyId });
    if (url.pathname === "/rest/v1/clones") return Response.json({ id: cloneId });
    if (url.pathname === "/rest/v1/agency_creators") return Response.json({ clone_id: cloneId });
    if (url.pathname === "/rest/v1/creator_accounts") return Response.json({ id: accountId });
    if (url.pathname === "/rest/v1/creator_agency_assignments") return Response.json({ agency_id: agencyId });
    if (url.pathname === "/rest/v1/creator_clone_links") {
      return Response.json(missingCreatorTwinLink ? null : { creator_account_id: accountId });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      if (staleUpdate && url.pathname.endsWith("/crm_update_creator")) {
        return Response.json({ code: "40001", message: "CRM_STALE_REVISION" }, { status: 409 });
      }
      return Response.json({ id: creatorId, revision: 5 });
    }
    throw new Error(`Unexpected offline request: ${request.method} ${url.pathname}`);
  };

  try {
    assert.deepEqual(
      parseResolveCrmMappingConflictInput({
        conflictId,
        expectedRevision: 2,
        bindingExpectedRevision: 4,
        resolutionStatus: "resolved",
        agencyId,
        creatorAccountId: accountId,
        cloneId,
        resolutionNote: "Duplicate detection was reviewed against the source records.",
      }),
      {
        conflictId,
        expectedRevision: 2,
        bindingExpectedRevision: 4,
        resolutionStatus: "resolved",
        agencyId,
        creatorAccountId: accountId,
        cloneId,
        resolutionNote: "Duplicate detection was reviewed against the source records.",
      },
      "conflict resolution must carry both conflict and binding revisions",
    );
    assert.throws(
      () => parseResolveCrmMappingConflictInput({
        conflictId,
        expectedRevision: 2,
        bindingExpectedRevision: 4,
        resolutionStatus: "ignored",
        resolutionNote: "Do not silently close this review.",
      }),
      (error: unknown) => error instanceof CrmMutationError && error.code === "INVALID_INPUT",
      "ignored conflicts must be rejected until they have recoverable semantics",
    );

    const agency = { id: agencyId, name: "Agency A", cloneIds: [cloneId] };
    const beforeAgency = requests.length;
    await assert.rejects(
      withDashboardAccess(agency, () => updateCrmCreator({ creatorId, expectedRevision: 3, displayName: "Blocked", status: "active" })),
      (error: unknown) => error instanceof CrmMutationError && error.code === "FORBIDDEN",
      "agency sessions must not reach Sprint 2 mutation RPCs",
    );
    assert.equal(requests.length, beforeAgency, "denied sessions perform no database request");

    await assert.rejects(
      withDashboardAccess(null, () => updateCrmCreator({ creatorId, expectedRevision: 0, displayName: "Invalid", status: "active" })),
      (error: unknown) => error instanceof CrmMutationError && error.code === "INVALID_INPUT",
      "creator updates require a positive optimistic revision",
    );

    await withDashboardAccess(null, () => updateCrmCreator({ creatorId, expectedRevision: 3, displayName: "Updated Creator", status: "paused" }));
    const updateRpc = requests.findLast((request) => request.path.endsWith("/crm_update_creator"));
    assert.equal(updateRpc?.body?.p_creator_id, creatorId);
    assert.equal(updateRpc?.body?.p_agency_id, agencyId, "the verified binding owns the RPC scope");
    assert.equal(updateRpc?.body?.p_expected_revision, 3);
    assert.match(String(updateRpc?.body?.p_correlation_id), /^dashboard:/);

    staleUpdate = true;
    await assert.rejects(
      withDashboardAccess(null, () => updateCrmCreator({ creatorId, expectedRevision: 3, displayName: "Stale", status: "active" })),
      (error: unknown) => error instanceof CrmMutationError && error.code === "STALE_REVISION",
      "database serialization failures map to a safe stale-revision result",
    );
    staleUpdate = false;

    await withDashboardAccess(null, () => setCrmCreatorBinding({
      creator_id: creatorId,
      agency_id: agencyId,
      creator_account_id: accountId,
      clone_id: cloneId,
      revision: "4",
    }));
    const bindingRpc = requests.findLast((request) => request.path.endsWith("/crm_set_creator_binding"));
    assert.equal(bindingRpc?.body?.p_agency_id, agencyId);
    assert.equal(bindingRpc?.body?.p_creator_account_id, accountId);
    assert.equal(bindingRpc?.body?.p_clone_id, cloneId);

    missingCreatorTwinLink = true;
    await assert.rejects(
      withDashboardAccess(null, () => setCrmCreatorBinding({
        creatorId,
        agencyId,
        creatorAccountId: accountId,
        cloneId,
        expectedRevision: 4,
      })),
      (error: unknown) => error instanceof CrmMutationError && error.code === "CONFLICT" && /not explicitly linked/i.test(error.message),
      "an account and Twin without an explicit identity relationship must fail clearly",
    );
    missingCreatorTwinLink = false;

    await withDashboardAccess(null, () => upsertCrmChannelConnection({
      creator_id: creatorId,
      provider: "onlyfans",
      revision: "7",
      provider_account_id: "must-not-overwrite-private-id",
      metadata: { verification_source: "must-not-overwrite-private-metadata" },
      display_name: "Renamed account",
      connection_status: "connected",
      sync_status: "current",
    }));
    const connectionRpc = requests.findLast((request) => request.path.endsWith("/crm_upsert_channel_connection"));
    assert.equal(connectionRpc?.body?.p_provider_account_id, "private-provider-id", "omitted private identifiers are preserved server-side");
    assert.deepEqual(connectionRpc?.body?.p_metadata, { verification_source: "provider" }, "omitted private metadata is preserved server-side");
    assert.equal(connectionRpc?.body?.p_display_name, "Renamed account");

    await withDashboardAccess(null, () => upsertCrmChannelConnection({
      creatorId,
      provider: "fanvue",
      expectedRevision: 0,
      handle: "new-account",
      displayName: "New account",
      connectionStatus: "unknown",
      syncStatus: "unknown",
      lastVerifiedAt: null,
      lastSyncedAt: null,
    }));
    const createRpc = requests.findLast((request) => request.path.endsWith("/crm_upsert_channel_connection"));
    assert.equal(createRpc?.body?.p_provider, "fanvue");
    assert.equal(createRpc?.body?.p_expected_revision, 0, "only connection creation admits revision zero");

    await withDashboardAccess(null, () => disconnectCrmChannelConnection({ creatorId, provider: "onlyfans", expectedRevision: 7 }));
    const disconnectRpc = requests.findLast((request) => request.path.endsWith("/crm_upsert_channel_connection"));
    assert.equal(disconnectRpc?.body?.p_connection_status, "disconnected");
    assert.equal(disconnectRpc?.body?.p_sync_status, "idle");
    assert.equal(disconnectRpc?.body?.p_provider_account_id, "private-provider-id");

    await withDashboardAccess(null, () => resolveCrmMappingConflict({
      conflictId,
      expectedRevision: 2,
      bindingExpectedRevision: 4,
      resolutionStatus: "resolved",
      agencyId,
      creatorAccountId: accountId,
      cloneId,
      resolutionNote: "Verified both legacy assignments against the agency roster.",
    }));
    const conflictRpc = requests.findLast((request) => request.path.endsWith("/crm_resolve_creator_mapping_conflict"));
    assert.equal(conflictRpc?.body?.p_conflict_id, conflictId);
    assert.equal(conflictRpc?.body?.p_expected_binding_revision, 4);
    assert.equal(conflictRpc?.body?.p_resolution_status, "resolved");

    const source = readFileSync(path.resolve(__dirname, "../lib/crm-foundation-write.ts"), "utf8");
    assert.match(source, /getDashboardAccess\(\)/, "every mutation verifies request access server-side");
    assert.doesNotMatch(source, /supabaseAdmin/, "controlled writes never travel through the general dashboard client");
    assert.doesNotMatch(source, /SUPABASE_SERVICE_KEY/, "the service credential is never read or exposed by an action");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("HYBRID CRM WRITES PASSED: internal-only access, optimistic revisions, scoped linking, private metadata preservation, disconnect semantics and conflict resolution.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
