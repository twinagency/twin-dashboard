import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CreatorRegistry from "../components/workspace/CreatorRegistry";
import ConnectionsRegistry from "../components/crm/ConnectionsRegistry";
import {
  buildCrmFoundationView,
  connectionDisplayStatus,
  type CrmFoundationAvailable,
  type CrmFoundationRows,
} from "../lib/crm-foundation-model";
import { readEveryCrmRow } from "../lib/crm-foundation-pagination";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

const rows: CrmFoundationRows = {
  creators: [{ id: "creator-1", display_name: "Test Creator", status: "active", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" }],
  bindings: [{ creator_id: "creator-1", creator_account_id: "account-1", clone_id: "clone-1", agency_id: "agency-1", mapping_status: "resolved", conflict_reason: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" }],
  connections: [
    { id: "connection-1", creator_id: "creator-1", provider: "telegram", handle: "testcreator", display_name: "Test account", connection_status: "connected", sync_status: "current", last_verified_at: "2026-09-16T00:00:00Z", last_synced_at: "2026-09-16T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" },
    { id: "connection-2", creator_id: "creator-1", provider: "onlyfans", handle: null, display_name: null, connection_status: "auth_required", sync_status: "idle", last_verified_at: null, last_synced_at: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" },
  ],
  capabilities: [{ connection_id: "connection-1", capability: "messaging", state: "supported", detail: null, checked_at: "2026-09-16T00:00:00Z" }],
  agencies: [{ id: "agency-1", name: "Test Agency" }],
  clones: [{ id: "clone-1", name: "Test Twin", slug: "test-twin", status: "active" }],
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

const result: CrmFoundationAvailable = { status: "available", creators, loadedAt: "2026-09-16T00:00:00Z" };
const creatorMarkup = renderToStaticMarkup(<CreatorRegistry result={result} />);
const connectionMarkup = renderToStaticMarkup(<ConnectionsRegistry result={result} />);
assert.match(creatorMarkup, /Creator registry|Test Creator/);
assert.match(creatorMarkup, /Test Agency/);
assert.match(creatorMarkup, /OnlyFans/);
assert.doesNotMatch(source("lib/crm-foundation-read.ts"), /provider_account_id|\bmetadata\b/, "private provider ids and metadata must never be read by the UI loader");
assert.match(connectionMarkup, /Authentication required/);
assert.match(connectionMarkup, /Messaging/);

for (const page of ["app/workspace/creators/page.tsx", "app/crm/connections/page.tsx"]) {
  const contents = source(page);
  const guard = contents.indexOf("if (!hybridCrmFoundationEnabled()) notFound()");
  const read = contents.indexOf("await readCrmFoundation()");
  assert.ok(guard >= 0 && read > guard, `${page} must stop before its database read while the flag is off`);
}

assert.match(source(".env.example"), /HYBRID_CRM_FOUNDATION_ENABLED=false/);
assert.match(source("components/Sidebar.tsx"), /href: "\/workspace\/creators"/);
assert.match(source("components/Sidebar.tsx"), /href: "\/crm\/connections", label: "Connections"/);
assert.match(source("app/layout.tsx"), /!agency && hybridCrmFoundationEnabled\(\)/, "navigation substitution must remain internal-admin only");
assert.match(source("lib/crm-foundation-read.ts"), /access\s*\?\s*Promise\.resolve\(/, "agency sessions must use their verified identity instead of reading partner_agencies");

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
