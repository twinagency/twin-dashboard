import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPECTED_PROJECT_REF,
  PRESERVED_CLONE,
  PROTECTED_MEMBERSHIPS,
  STORAGE_OBJECTS,
  TARGETS,
  assertExecutionArguments,
  assertExpectedProject,
  runReset,
} from "./reset-recent-creator-test-accounts.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const accountIds = new Set(TARGETS.map((target) => target.accountId));
const authUserIds = new Set(TARGETS.map((target) => target.authUserId));

assert.equal(TARGETS.length, 3, "operation must remain locked to three creator/auth pairs");
assert.equal(accountIds.size, 3, "creator account IDs must be unique");
assert.equal(authUserIds.size, 3, "auth user IDs must be unique");
for (const target of TARGETS) {
  assert.match(target.accountId, uuid);
  assert.match(target.authUserId, uuid);
}

assert.equal(STORAGE_OBJECTS.length, 5, "operation must remain locked to five Storage objects");
assert.equal(new Set(STORAGE_OBJECTS.map((object) => `${object.bucket}/${object.path}`)).size, 5);
for (const object of STORAGE_OBJECTS) {
  assert.ok(accountIds.has(object.accountId), "each Storage object must belong to an allowlisted account");
  assert.match(object.path, new RegExp(`^creators/${object.accountId}/`));
  assert.ok(["onboarding-content", "voice-samples"].includes(object.bucket));
}

assert.match(PRESERVED_CLONE.id, uuid);
assert.equal(PRESERVED_CLONE.name, "Mrs Callace");
assert.ok(accountIds.has(PRESERVED_CLONE.linkedAccountId));
assert.equal(PROTECTED_MEMBERSHIPS.length, 3, "the three audited operator memberships must remain protected");
assert.equal(new Set(PROTECTED_MEMBERSHIPS.map((row) => `${row.userId}/${row.agencyId}`)).size, 3);

assert.doesNotThrow(() => assertExecutionArguments(["--execute"]));
for (const args of [[], ["--dry-run"], ["--execute", "extra"]]) {
  assert.throws(() => assertExecutionArguments(args), /refusing to run/);
}

assert.doesNotThrow(() => assertExpectedProject(`https://${EXPECTED_PROJECT_REF}.supabase.co`));
for (const url of [
  "http://aouaenqayfltoqrmpitg.supabase.co",
  "https://aouaenqayfltoqrmpitg.supabase.co.attacker.invalid",
  "https://different-project.supabase.co",
]) {
  assert.throws(() => assertExpectedProject(url));
}

const script = readFileSync(new URL("./reset-recent-creator-test-accounts.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/reset-recent-creator-test-accounts.yml", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const runBody = script.slice(script.indexOf("export async function runReset"));

assert.ok(runBody.indexOf("removeStorageObjects(client)") < runBody.indexOf("deleteCreatorAccounts(client)"));
assert.ok(runBody.indexOf("deleteCreatorAccounts(client)") < runBody.indexOf("deleteAuthUsers(client)"));
assert.doesNotMatch(script, /\.from\(["']clones["']\)\s*\.delete/);
assert.doesNotMatch(script, /\.from\(["']agency_memberships["']\)\s*\.delete/);
assert.doesNotMatch(script, /@[^\s"']+\.[a-z]{2,}/i, "the operation must not embed an email address");
assert.doesNotMatch(script, /from "@supabase\/supabase-js"/, "the production runner does not package the Supabase SDK");
assert.match(script, /assertProtectedMemberships\(client\)/);

assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
assert.match(workflow, /RESET-RECENT-CREATOR-TEST-ACCOUNTS/);
assert.match(workflow, /exec node \/app\/scripts\/reset-recent-creator-test-accounts\.mjs --execute/);
assert.match(workflow, /group: deploy-dashboard/);
assert.match(workflow, /test \\"\\\$GIT_SHA\\" = \\"\\\$RESET_EXPECTED_SHA\\"/);
assert.match(dockerfile, /COPY --from=builder[^\n]+reset-recent-creator-test-accounts\.mjs/);

const applicationIds = [
  "7a7d6196-b5c3-48cb-a3b9-591e2ddf84f6",
];
const consentIds = [
  "9951ad7a-0656-433d-986c-71dd0d756795",
];
const fileIds = [
  "69610a53-163e-40ba-a134-1cafcfef35b7",
  "5a1a0142-10d4-462f-afdb-b9c92c87da24",
  "304246f2-59db-4bbd-b94d-fa1bc96645ee",
  "6c37209e-239f-4cf3-848b-4c5a7db0f8ac",
  "2c9d88b2-6a04-4e65-89a5-f5df91769c76",
];
for (const id of [...applicationIds, ...consentIds, ...fileIds]) {
  assert.match(id, uuid, "every destructive child-record allowlist entry must be a valid UUID");
}
const sentinel = Object.freeze({
  accountId: "36311e0c-3b1a-4aad-aa97-ed40e32cb31d",
  authUserId: "70018ea2-81f1-4ff4-bdd2-439bc533df94",
  applicationId: "c1318626-c3c7-4402-b32d-e06535d82af8",
  consentId: "c6ca3489-e7fe-4106-abd6-879cdf1e1940",
  fileId: "11e2e877-e478-4ef1-930d-487363a1cc17",
  storageKey: "onboarding-content/creators/36311e0c-3b1a-4aad-aa97-ed40e32cb31d/content/1789070712346-ae5013fb-a20e-44b4-b684-6ca4792f6bd4-aaa.png",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function initialMockState() {
  const tables = {
    creator_accounts: [
      ...TARGETS.map((target) => ({
        id: target.accountId,
        auth_user_id: target.authUserId,
        source: "twin",
        account_status: "applicant",
        created_at: target.accountCreatedAt,
      })),
      {
        id: sentinel.accountId,
        auth_user_id: sentinel.authUserId,
        source: "twin",
        account_status: "active",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    creator_applications: [
      ...applicationIds.map((id) => ({ id, creator_account_id: TARGETS[2].accountId })),
      { id: sentinel.applicationId, creator_account_id: sentinel.accountId },
    ],
    creator_consents: [
      ...consentIds.map((id) => ({ id, creator_account_id: TARGETS[2].accountId })),
      { id: sentinel.consentId, creator_account_id: sentinel.accountId },
    ],
    creator_files: [
      ...STORAGE_OBJECTS.map((object, index) => ({
        id: fileIds[index],
        creator_account_id: object.accountId,
        bucket: object.bucket,
        storage_path: object.path,
      })),
      {
        id: sentinel.fileId,
        creator_account_id: sentinel.accountId,
        bucket: "onboarding-content",
        storage_path: sentinel.storageKey.slice("onboarding-content/".length),
      },
    ],
    creator_onboarding_progress: [
      ...TARGETS.map((target) => ({ creator_account_id: target.accountId })),
      { creator_account_id: sentinel.accountId },
    ],
    creator_agency_assignments: [],
    creator_clone_links: [{
      creator_account_id: PRESERVED_CLONE.linkedAccountId,
      clone_id: PRESERVED_CLONE.id,
    }],
    agency_memberships: PROTECTED_MEMBERSHIPS.map((membership) => ({
      user_id: membership.userId,
      agency_id: membership.agencyId,
      active: true,
    })),
    clones: [{ id: PRESERVED_CLONE.id, name: PRESERVED_CLONE.name, status: "active" }],
  };
  const authUsers = new Map([
    ...TARGETS.map((target) => [target.authUserId, { id: target.authUserId, created_at: target.authCreatedAt }]),
    [sentinel.authUserId, { id: sentinel.authUserId, created_at: "2026-09-01T00:00:00.000Z" }],
  ]);
  const storageObjects = new Set([
    ...STORAGE_OBJECTS.map((object) => `${object.bucket}/${object.path}`),
    sentinel.storageKey,
  ]);
  return {
    tables,
    authUsers,
    storageObjects,
    events: [],
    deletedAccountIds: [],
    deletedAuthUserIds: [],
    deletedStorageKeys: [],
  };
}

function valuesFromFilter(expression) {
  if (expression.startsWith("eq.")) return [expression.slice(3)];
  const match = expression.match(/^in\.\((.*)\)$/);
  if (match) return match[1] ? match[1].split(",") : [];
  throw new Error(`mock received an unsupported filter: ${expression}`);
}

function filterRows(rows, searchParams) {
  const filters = [...searchParams.entries()].filter(([key]) => key !== "select");
  return rows.filter((row) => filters.every(([key, expression]) => valuesFromFilter(expression).includes(String(row[key]))));
}

function jsonResponse(payload, status = 200) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: payload === null ? undefined : { "Content-Type": "application/json" },
  });
}

function createFetchMock(state, serviceKey) {
  return async function mockFetch(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method || "GET";
    assert.equal(url.origin, `https://${EXPECTED_PROJECT_REF}.supabase.co`, "mock must never accept another host");
    assert.equal(init.headers.apikey, serviceKey);
    assert.equal(init.headers.Authorization, `Bearer ${serviceKey}`);

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
      assert.ok(Object.hasOwn(state.tables, table), `unexpected REST table: ${table}`);
      if (method === "GET") return jsonResponse(clone(filterRows(state.tables[table], url.searchParams)));
      assert.equal(method, "DELETE");
      assert.equal(table, "creator_accounts", "the runner may only delete creator_accounts via REST");
      const matches = filterRows(state.tables.creator_accounts, url.searchParams)
        .filter((row) => row.id !== state.blockCreatorDeleteId);
      state.events.push({ type: "creator-delete", ids: matches.map((row) => row.id) });
      state.deletedAccountIds.push(...matches.map((row) => row.id));
      const deletedIds = new Set(matches.map((row) => row.id));
      state.tables.creator_accounts = state.tables.creator_accounts.filter((row) => !deletedIds.has(row.id));
      for (const tableName of [
        "creator_applications",
        "creator_consents",
        "creator_files",
        "creator_onboarding_progress",
        "creator_agency_assignments",
        "creator_clone_links",
      ]) {
        state.tables[tableName] = state.tables[tableName].filter((row) => !deletedIds.has(row.creator_account_id));
      }
      return jsonResponse(clone(matches));
    }

    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      const id = decodeURIComponent(url.pathname.slice("/auth/v1/admin/users/".length));
      if (method === "GET") return state.authUsers.has(id)
        ? jsonResponse(clone(state.authUsers.get(id)))
        : jsonResponse({ code: "user_not_found" }, 404);
      assert.equal(method, "DELETE");
      assert.deepEqual(JSON.parse(init.body), { should_soft_delete: false }, "Auth deletion must be a permanent reset");
      state.events.push({ type: "auth-delete", id });
      if (!state.authUsers.has(id)) return jsonResponse({ code: "user_not_found" }, 404);
      state.authUsers.delete(id);
      state.deletedAuthUserIds.push(id);
      return jsonResponse({});
    }

    if (url.pathname.startsWith("/storage/v1/object/info/")) {
      assert.equal(method, "GET", "Storage existence checks must use the metadata endpoint");
      const suffix = url.pathname.slice("/storage/v1/object/info/".length);
      const [encodedBucket, ...encodedPath] = suffix.split("/");
      const bucket = decodeURIComponent(encodedBucket);
      const path = encodedPath.map(decodeURIComponent).join("/");
      return state.storageObjects.has(`${bucket}/${path}`)
        ? jsonResponse({ name: path }, 200)
        : jsonResponse({ code: "NoSuchKey", message: "not found" }, 400);
    }

    if (url.pathname.startsWith("/storage/v1/object/")) {
      const suffix = url.pathname.slice("/storage/v1/object/".length);
      const [encodedBucket, ...encodedPath] = suffix.split("/");
      const bucket = decodeURIComponent(encodedBucket);
      assert.equal(method, "DELETE");
      assert.equal(encodedPath.length, 0, "Storage DELETE must target a bucket endpoint");
      const body = JSON.parse(init.body);
      assert.ok(Array.isArray(body.prefixes));
      state.events.push({ type: "storage-delete", bucket, paths: [...body.prefixes] });
      for (const path of body.prefixes) {
        const key = `${bucket}/${path}`;
        if (state.storageObjects.delete(key)) state.deletedStorageKeys.push(key);
      }
      return jsonResponse([]);
    }

    throw new Error(`mock received an unexpected request: ${method} ${url.pathname}`);
  };
}

const mockServiceKey = "mock-service-role-key";
const state = initialMockState();
const membershipsBefore = clone(state.tables.agency_memberships);
const cloneBefore = clone(state.tables.clones);
await runReset({
  args: ["--execute"],
  env: {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: mockServiceKey,
  },
  request: createFetchMock(state, mockServiceKey),
});

assert.deepEqual(new Set(state.deletedAccountIds), accountIds, "exactly the three allowlisted creator accounts must be removed");
assert.equal(state.deletedAccountIds.length, TARGETS.length, "no creator account may be deleted more than once");
assert.deepEqual(new Set(state.deletedAuthUserIds), authUserIds, "exactly the three allowlisted Auth users must be removed");
assert.equal(state.deletedAuthUserIds.length, TARGETS.length, "no Auth user may be deleted more than once");
assert.deepEqual(
  new Set(state.deletedStorageKeys),
  new Set(STORAGE_OBJECTS.map((object) => `${object.bucket}/${object.path}`)),
  "exactly the five allowlisted Storage objects must be removed",
);
assert.equal(state.deletedStorageKeys.length, STORAGE_OBJECTS.length, "no Storage object may be removed more than once");

assert.ok(state.tables.creator_accounts.some((row) => row.id === sentinel.accountId), "an unrelated creator account must survive");
assert.ok(state.authUsers.has(sentinel.authUserId), "an unrelated Auth user must survive");
assert.ok(state.storageObjects.has(sentinel.storageKey), "an unrelated Storage object must survive");
assert.ok(state.tables.creator_applications.some((row) => row.id === sentinel.applicationId), "Zane's submitted application must survive");
assert.ok(state.tables.creator_consents.some((row) => row.id === sentinel.consentId), "Zane's consent must survive");
assert.ok(state.tables.creator_files.some((row) => row.id === sentinel.fileId), "Zane's uploaded file record must survive");
assert.ok(state.tables.creator_onboarding_progress.some((row) => row.creator_account_id === sentinel.accountId), "Zane's onboarding progress must survive");
assert.deepEqual(state.tables.agency_memberships, membershipsBefore, "protected memberships must remain byte-for-byte intact");
assert.deepEqual(state.tables.clones, cloneBefore, "Mrs Callace must remain byte-for-byte intact");

const protectedTargetState = initialMockState();
protectedTargetState.tables.agency_memberships.push({
  user_id: TARGETS[0].authUserId,
  agency_id: "00000000-0000-4000-8000-000000000099",
  active: false,
});
await assert.rejects(runReset({
  args: ["--execute"],
  env: {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: mockServiceKey,
  },
  request: createFetchMock(protectedTargetState, mockServiceKey),
}), /now has agency access/);
assert.equal(protectedTargetState.events.length, 0, "even an inactive target membership must block before mutation");

const unexpectedChildState = initialMockState();
unexpectedChildState.tables.creator_applications.push({
  id: "00000000-0000-4000-8000-000000000098",
  creator_account_id: TARGETS[0].accountId,
});
await assert.rejects(runReset({
  args: ["--execute"],
  env: {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: mockServiceKey,
  },
  request: createFetchMock(unexpectedChildState, mockServiceKey),
}), /outside the deletion allowlist/);
assert.equal(unexpectedChildState.events.length, 0, "an unexpected dependent row must block before mutation");

const failedDatabaseState = initialMockState();
failedDatabaseState.blockCreatorDeleteId = TARGETS[1].accountId;
await assert.rejects(runReset({
  args: ["--execute"],
  env: {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: mockServiceKey,
  },
  request: createFetchMock(failedDatabaseState, mockServiceKey),
}), /deletion count changed/);
assert.equal(
  failedDatabaseState.events.filter((event) => event.type === "auth-delete").length,
  0,
  "a creator-row deletion mismatch must block every Auth deletion",
);

const mutationEvents = state.events.filter((event) => event.type.endsWith("-delete"));
const finalStorageDelete = mutationEvents.map((event) => event.type).lastIndexOf("storage-delete");
const firstCreatorDelete = mutationEvents.findIndex((event) => event.type === "creator-delete");
const firstAuthDelete = mutationEvents.findIndex((event) => event.type === "auth-delete");
assert.equal(mutationEvents.filter((event) => event.type === "storage-delete").length, 2, "Storage deletion must be grouped by the two buckets");
assert.equal(mutationEvents.filter((event) => event.type === "creator-delete").length, TARGETS.length);
assert.equal(mutationEvents.filter((event) => event.type === "auth-delete").length, TARGETS.length);
assert.ok(finalStorageDelete >= 0 && finalStorageDelete < firstCreatorDelete, "all Storage DELETEs must precede creator deletion");
assert.ok(finalStorageDelete < firstAuthDelete, "all Storage DELETEs must precede Auth deletion");

const deletionTotals = {
  accounts: state.deletedAccountIds.length,
  auth: state.deletedAuthUserIds.length,
  storage: state.deletedStorageKeys.length,
};
await runReset({
  args: ["--execute"],
  env: {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: mockServiceKey,
  },
  request: createFetchMock(state, mockServiceKey),
});
assert.deepEqual({
  accounts: state.deletedAccountIds.length,
  auth: state.deletedAuthUserIds.length,
  storage: state.deletedStorageKeys.length,
}, deletionTotals, "a second run must be idempotent and delete nothing new");
assert.ok(state.tables.creator_accounts.some((row) => row.id === sentinel.accountId));
assert.ok(state.authUsers.has(sentinel.authUserId));
assert.ok(state.storageObjects.has(sentinel.storageKey));
assert.deepEqual(state.tables.agency_memberships, membershipsBefore);
assert.deepEqual(state.tables.clones, cloneBefore);

console.log("recent creator reset guardrail checks passed");
