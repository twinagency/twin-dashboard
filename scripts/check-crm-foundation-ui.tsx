import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CreatorRegistry from "../components/workspace/CreatorRegistry";
import ConnectionsRegistry from "../components/crm/ConnectionsRegistry";
import {
  buildCrmActivityView,
  buildCrmFoundationReferences,
  buildCrmFoundationView,
  connectionDisplayStatus,
  type CrmFoundationAvailable,
  type CrmFoundationRows,
} from "../lib/crm-foundation-model";
import { readEveryCrmRow } from "../lib/crm-foundation-pagination";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
(globalThis as unknown as { React: typeof React }).React = React;

const rows: CrmFoundationRows = {
  creators: [{ id: "creator-1", display_name: "Test Creator", status: "mapping_conflict", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", revision: 4 }],
  bindings: [{ creator_id: "creator-1", creator_account_id: "account-1", clone_id: "clone-1", agency_id: "agency-1", mapping_status: "conflict", conflict_reason: "Agency assignment requires review", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", revision: 3 }],
  connections: [
    { id: "connection-1", creator_id: "creator-1", provider: "telegram", handle: "testcreator", display_name: "Test account", connection_status: "connected", sync_status: "current", last_verified_at: "2026-09-16T00:00:00Z", last_synced_at: "2026-09-16T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", revision: 2 },
    { id: "connection-2", creator_id: "creator-1", provider: "onlyfans", handle: null, display_name: null, connection_status: "auth_required", sync_status: "idle", last_verified_at: null, last_synced_at: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", revision: 1 },
  ],
  capabilities: [{ connection_id: "connection-1", capability: "messaging", state: "supported", detail: null, checked_at: "2026-09-16T00:00:00Z" }],
  agencies: [{ id: "agency-1", name: "Test Agency" }],
  clones: [{ id: "clone-1", name: "Test Twin", slug: "test-twin", status: "active" }],
  conflicts: [{ id: "conflict-1", creator_id: "creator-1", conflict_type: "agency_assignment_mismatch", status: "open", detected_at: "2026-09-15T00:00:00Z", revision: 1 }],
};

async function main() {
const creators = buildCrmFoundationView(rows);
assert.equal(creators.length, 1, "one canonical creator should render");
assert.equal(creators[0]?.agency?.name, "Test Agency", "agency should be resolved from the binding");
assert.equal(creators[0]?.twin?.name, "Test Twin", "Twin should be resolved from the binding");
assert.equal(creators[0]?.connections[0]?.providerLabel, "OnlyFans", "connections should sort by provider label");
assert.equal(creators[0]?.connections[0]?.displayStatus, "authentication_required", "auth-required status must remain honest");
assert.equal(creators[0]?.connections[1]?.displayStatus, "connected", "connected status must remain honest");
assert.equal("providerAccountId" in (creators[0]?.connections[0] ?? {}), false, "provider account ids must not enter the UI model");
assert.equal("metadata" in (creators[0]?.connections[0] ?? {}), false, "connection metadata must not enter the UI model");
assert.equal(connectionDisplayStatus("connected", "error").status, "sync_issue", "sync errors must take priority over a stale connected flag");
assert.equal(connectionDisplayStatus("unknown", "unknown").status, "unavailable", "unknown states must not be presented as connected");
const conflictFailClosed = buildCrmFoundationView({
  ...rows,
  creators: rows.creators.map((creator) => ({ ...creator, status: "active" })),
  bindings: rows.bindings.map((binding) => ({ ...binding, mapping_status: "resolved" })),
});
assert.equal(conflictFailClosed[0]?.mappingStatus, "conflict", "an open conflict must override a stale resolved binding in the operator view");

const pagedFixture = Array.from({ length: 2301 }, (_, index) => ({ id: index }));
let pageCalls = 0;
const pagedRead = await readEveryCrmRow<{ id: number }>("fixture", () => ({
  range: async (from: number, to: number) => {
    pageCalls += 1;
    return { data: pagedFixture.slice(from, to + 1), error: null };
  },
}), { pageSize: 1000, maxRows: 5000 });
assert.equal(pagedRead.error, null);
assert.equal(pagedRead.rows.length, 2301, "the registry reader must page past PostgREST's row cap");
assert.equal(pageCalls, 3, "paging should stop as soon as a short page proves the end");

const cappedRead = await readEveryCrmRow<{ id: number }>("fixture", () => ({
  range: async (from: number, to: number) => ({ data: pagedFixture.slice(from, to + 1), error: null }),
}), { pageSize: 1000, maxRows: 2000 });
assert.equal(cappedRead.error?.code, "CRM_ROW_LIMIT", "hitting the safety ceiling must fail closed");
assert.equal(cappedRead.rows.length, 0, "a capped result must never masquerade as a complete registry");

const result: CrmFoundationAvailable = {
  status: "available",
  creators,
  loadedAt: "2026-09-16T00:00:00Z",
  references: buildCrmFoundationReferences({
    agencies: rows.agencies,
    clones: rows.clones,
    creatorAccounts: [{ id: "account-1", display_name: "Test creator account", account_status: "approved" }],
  }),
  activities: buildCrmActivityView([{ id: "activity-1", creator_id: "creator-1", agency_id: "agency-1", connection_id: null, event_type: "creator.updated", status: "succeeded", occurred_at: "2026-09-16T01:00:00Z" }]),
};
const creatorMarkup = renderToStaticMarkup(<CreatorRegistry result={result} />);
const connectionMarkup = renderToStaticMarkup(<ConnectionsRegistry result={result} />);
const creatorManageMarkup = renderToStaticMarkup(<CreatorRegistry result={result} canManage />);
const connectionManageMarkup = renderToStaticMarkup(<ConnectionsRegistry result={result} canManage />);
assert.match(creatorMarkup, /Creator registry|Test Creator/);
assert.match(creatorMarkup, /Test Agency/);
assert.match(creatorMarkup, /OnlyFans/);
assert.doesNotMatch(source("lib/crm-foundation-read.ts"), /provider_account_id|\bmetadata\b/, "private provider ids and metadata must never be read by the UI loader");
assert.match(connectionMarkup, /Authentication required/);
assert.match(connectionMarkup, /Messaging/);
assert.doesNotMatch(creatorMarkup, /Save creator|Save binding|Operator activity/, "agency mode must remain read only");
assert.doesNotMatch(connectionMarkup, /Add connection record|Manage connection/, "agency mode must not render write controls");
assert.match(creatorManageMarkup, /Save creator/);
assert.match(creatorManageMarkup, /Save binding/);
assert.match(creatorManageMarkup, /Resolve mapping/);
assert.doesNotMatch(creatorManageMarkup, /Ignore conflict/, "conflicts must not be closed without a recoverable binding decision");
assert.match(creatorManageMarkup, /name="binding_revision" value="3"/, "conflict decisions must submit the current binding revision");
assert.match(creatorManageMarkup, /Creator Updated/);
assert.match(connectionManageMarkup, /Add connection record/);
assert.match(connectionManageMarkup, /Registry only/);
assert.match(connectionManageMarkup, /metadata only/i);
assert.match(connectionManageMarkup, /Mark disconnected/);
assert.doesNotMatch(connectionManageMarkup, /Provider account ID/, "private provider identifiers must not be rendered in management controls");
assert.match(source("components/crm/ConnectionsRegistry.tsx"), /mappingStatus === "resolved" && Boolean\(creator\.agency\)/, "new connections must be limited to resolved agency creators");
assert.match(source("components/crm/ConnectionsRegistry.tsx"), /connection\?\.displayName \?\? connection\?\.accountLabel/, "connection labels must default without copying a handle into the display name");
assert.match(source("components/crm/ConnectionsRegistry.tsx"), /defaultValue=\{connection\?\.handle\}/, "connection edits must preserve the handle");
assert.match(source("lib/crm-foundation-model.ts"), /mappingConflicts\.length > 0 \|\| creatorStatus === "mapping_conflict"/, "open conflicts and conflicted creator status must fail closed even if the stored binding says resolved");

for (const page of ["app/workspace/creators/page.tsx", "app/crm/connections/page.tsx"]) {
  const contents = source(page);
  const guard = contents.indexOf("if (!hybridCrmFoundationEnabled()) notFound()");
  const read = contents.indexOf("await readCrmFoundation()");
  assert.ok(guard >= 0 && read > guard, `${page} must stop before its database read while the flag is off`);
  assert.match(contents, /const canManage = !access/, `${page} must keep writes internal-admin only`);
}

assert.match(source(".env.example"), /HYBRID_CRM_FOUNDATION_ENABLED=false/);
assert.match(source("components/Sidebar.tsx"), /href: "\/workspace\/creators"/);
assert.match(source("components/Sidebar.tsx"), /href: "\/crm\/connections", label: "Connections"/);
assert.match(source("app/layout.tsx"), /!agency && hybridCrmFoundationEnabled\(\)/, "navigation substitution must remain internal-admin only");
assert.match(source("lib/crm-foundation-read.ts"), /access\s*\?\s*Promise\.resolve\(/, "agency sessions must use their verified identity instead of reading partner_agencies");
assert.match(source("lib/crm-foundation-read.ts"), /if \(access\) return \{ rows: \[\], error: null \};/, "operator activity must remain internal-admin only");
assert.match(source("lib/crm-foundation-read.ts"), /creatorAccountId: null,[\s\S]*revision: null,[\s\S]*bindingRevision: null/, "write-only identifiers and revisions must be scrubbed from agency and creator payloads");

const newUiFiles = [
  "app/workspace/creators/page.tsx",
  "app/crm/connections/page.tsx",
  "components/workspace/CreatorRegistry.tsx",
  "components/crm/ConnectionsRegistry.tsx",
  "lib/crm-foundation-feature.ts",
  "lib/crm-foundation-model.ts",
  "lib/crm-foundation-pagination.ts",
  "lib/crm-foundation-read.ts",
];
for (const file of newUiFiles) assert.equal(source(file).includes("—"), false, `${file} must not introduce em dashes`);

console.log("Hybrid CRM foundation UI checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
