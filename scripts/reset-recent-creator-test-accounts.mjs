/**
 * One-time, allowlisted production reset for four creator test signups.
 * It intentionally matches immutable IDs, never dates or email addresses.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_PROJECT_REF = "aouaenqayfltoqrmpitg";

export const TARGETS = Object.freeze([
  Object.freeze({
    accountId: "36311e0c-3b1a-4aad-aa97-ed40e32cb31d",
    authUserId: "70018ea2-81f1-4ff4-bdd2-439bc533df94",
    accountCreatedAt: "2026-09-10T19:47:32.960Z",
    authCreatedAt: "2026-09-10T19:47:32.905Z",
  }),
  Object.freeze({
    accountId: "215409bb-ed0c-40d8-8676-75bc47d491a7",
    authUserId: "7e664d9b-4e01-48f9-b482-d870155d50e5",
    accountCreatedAt: "2026-09-10T18:44:54.924Z",
    authCreatedAt: "2026-09-10T18:44:54.854Z",
  }),
  Object.freeze({
    accountId: "4d2bdbd9-2cbd-4417-bc05-65934c9d10c3",
    authUserId: "cc704869-17bb-46d6-9360-8e97cfe0d966",
    accountCreatedAt: "2026-09-10T18:02:17.578Z",
    authCreatedAt: "2026-09-10T18:02:17.341Z",
  }),
  Object.freeze({
    accountId: "5031e297-7667-4042-b7aa-41dd35334f0a",
    authUserId: "ae57d307-9bc0-4cb3-8abe-2459ca834240",
    accountCreatedAt: "2026-09-09T20:38:02.657Z",
    authCreatedAt: "2026-09-09T20:38:02.597Z",
  }),
]);

export const STORAGE_OBJECTS = Object.freeze([
  Object.freeze({ accountId: "36311e0c-3b1a-4aad-aa97-ed40e32cb31d", bucket: "onboarding-content", path: "creators/36311e0c-3b1a-4aad-aa97-ed40e32cb31d/content/1789070712346-ae5013fb-a20e-44b4-b684-6ca4792f6bd4-aaa.png" }),
  Object.freeze({ accountId: "5031e297-7667-4042-b7aa-41dd35334f0a", bucket: "onboarding-content", path: "creators/5031e297-7667-4042-b7aa-41dd35334f0a/content/1788987544317-409d7b41-09e8-4f80-8358-d78509b47c9e-IMG_0678.png" }),
  Object.freeze({ accountId: "5031e297-7667-4042-b7aa-41dd35334f0a", bucket: "onboarding-content", path: "creators/5031e297-7667-4042-b7aa-41dd35334f0a/content/1788987768271-abbbe135-0c81-4b75-aa68-9b495b5a73eb-IMG_0678.png" }),
  Object.freeze({ accountId: "5031e297-7667-4042-b7aa-41dd35334f0a", bucket: "onboarding-content", path: "creators/5031e297-7667-4042-b7aa-41dd35334f0a/content/1788987787365-617ee64d-3c47-4a35-87db-6b4b2fcf4399-BC8390AC-AB0D-4885-B162-FF7D9BC005CA.png" }),
  Object.freeze({ accountId: "5031e297-7667-4042-b7aa-41dd35334f0a", bucket: "onboarding-content", path: "creators/5031e297-7667-4042-b7aa-41dd35334f0a/content/1788990991532-73474a36-8d73-4da4-8f1c-e8c3722bed86-IMG_0678.png" }),
  Object.freeze({ accountId: "5031e297-7667-4042-b7aa-41dd35334f0a", bucket: "voice-samples", path: "creators/5031e297-7667-4042-b7aa-41dd35334f0a/voice/1788991041291-d55cd840-ad41-4d63-a8ad-1039de9e451d-2422107ee5554ce3944da2f000ddaf52.mov" }),
]);

export const PRESERVED_CLONE = Object.freeze({
  id: "2e5eb05f-cc88-4ba6-870a-924948d4b09a",
  name: "Mrs Callace",
  linkedAccountId: "5031e297-7667-4042-b7aa-41dd35334f0a",
});

export const PROTECTED_MEMBERSHIPS = Object.freeze([
  Object.freeze({ userId: "d7d14620-448f-4243-8692-65a6cb38333a", agencyId: "40563447-698f-4ec2-b175-c816f877a1f6" }),
  Object.freeze({ userId: "dafb158f-742c-4b7c-83c1-b7b319bf14d6", agencyId: "95b1f78a-1eb2-43d2-84f3-630c2a125ee6" }),
  Object.freeze({ userId: "f6271793-7df3-4af3-9a5b-70ffc31d32cb", agencyId: "95b1f78a-1eb2-43d2-84f3-630c2a125ee6" }),
]);

const EXPECTED_CHILD_IDS = Object.freeze({
  creator_applications: new Set(["7a7d6196-b5c3-48cb-a3b9-591e2ddf84f6", "c1318626-c3c7-4402-b32d-e06535d82af8"]),
  creator_consents: new Set(["9951ad7a-0656-433d-986c-71dd0d756795", "c6ca3489-e7fe-4106-abd6-879cdf1e1940"]),
  creator_files: new Set(["69610a53-163e-40ba-a134-1cafcfef35b7", "5a1a0142-10d4-462f-afdb-b9c92c87da24", "304246f2-59db-4bbd-b94d-fa1bc96645ee", "6c37209e-239f-4cf3-848b-4c5a7db0f8ac", "2c9d88b-6a04-4e65-89a5-f5df91769c76", "11e2e877-e478-4ef1-930d-487363a1cc17"]),
});

const DEPENDENT_TABLES = Object.freeze([
  "creator_agency_assignments",
  "creator_applications",
  "creator_clone_links",
  "creator_consents",
  "creator_files",
  "creator_onboarding_progress",
]);

class OpsError extends Error {}
class ApiError extends Error {
  constructor(label, status, code = "unknown") {
    super(`${label} failed${code !== "unknown" ? ` (${code})` : ""} (HTTP ${status}); provider details were suppressed.`);
    this.status = status;
    this.code = code;
  }
}

function stop(message) {
  throw new OpsError(`[reset] ${message}`);
}

export function assertExecutionArguments(args) {
  if (args.length !== 1 || args[0] !== "--execute") stop("refusing to run without the sole argument --execute");
}

export function assertExpectedProject(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { stop("SUPABASE_URL is invalid"); }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== `${EXPECTED_PROJECT_REF}.supabase.co` || parsed.pathname !== "/") {
    stop("Supabase URL does not match the production allowlist");
  }
}

function iso(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) stop("an allowlisted timestamp is invalid");
  return parsed.toISOString();
}

function inFilter(values) {
  return `in.(${values.join(",")})`;
}

function encodeObjectPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function createApi(rawUrl, serviceKey, request = fetch) {
  const base = rawUrl.replace(/\/$/, "");
  const authHeaders = Object.freeze({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });

  async function timedRequest(path, init, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      return await request(`${base}${path}`, { ...init, signal: controller.signal });
    } catch {
      stop(`${label} could not reach the provider within 20 seconds`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(path, { label, method = "GET", headers = {}, body, allow404 = false } = {}) {
    const response = await timedRequest(path, {
      method,
      headers: { ...authHeaders, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, label || "Supabase request");
    let payload = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (allow404 && response.status === 404 && payload?.code === "user_not_found") return null;
    if (!response.ok) {
      const rawCode = typeof payload?.code === "string" ? payload.code : "unknown";
      const code = /^[a-z0-9_]{1,64}$/i.test(rawCode) ? rawCode : "unknown";
      throw new ApiError(label || "Supabase request", response.status, code);
    }
    return payload;
  }

  function restPath(table, query) {
    return `/rest/v1/${table}?${new URLSearchParams(query).toString()}`;
  }

  return Object.freeze({
    select(table, query) {
      return call(restPath(table, query), { label: `${table} lookup` });
    },
    deleteRows(table, query) {
      return call(restPath(table, query), {
        label: `${table} deletion`,
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });
    },
    getAuthUser(id) {
      return call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { label: "Auth-user lookup", allow404: true });
    },
    deleteAuthUser(id) {
      return call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
        label: "Auth-user deletion",
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: { should_soft_delete: false },
        allow404: true,
      });
    },
    async storageExists(object) {
      const response = await timedRequest(
        `/storage/v1/object/${encodeURIComponent(object.bucket)}/${encodeObjectPath(object.path)}`,
        { method: "HEAD", headers: authHeaders },
        "Storage-object lookup",
      );
      if (response.status === 404) return false;
      if (!response.ok) throw new ApiError("Storage-object lookup", response.status);
      return true;
    },
    removeStorage(bucket, paths) {
      return call(`/storage/v1/object/${encodeURIComponent(bucket)}`, {
        label: "Storage removal",
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: { prefixes: paths },
      });
    },
  });
}

function targetIds(key) {
  return TARGETS.map((target) => target[key]);
}

async function assertPreservedClone(client) {
  const rows = await client.select("clones", { select: "id,name,status", id: `eq.${PRESERVED_CLONE.id}` });
  const clone = rows?.[0];
  if (rows?.length !== 1 || clone.id !== PRESERVED_CLONE.id || clone.name !== PRESERVED_CLONE.name || clone.status !== "active") {
    stop("Mrs Callace clone did not match its preservation guard");
  }
}

async function assertProtectedMemberships(client) {
  const rows = await client.select("agency_memberships", {
    select: "user_id,agency_id,active",
    user_id: inFilter(PROTECTED_MEMBERSHIPS.map((row) => row.userId)),
  });
  for (const expected of PROTECTED_MEMBERSHIPS) {
    if (!rows.some((row) => row.user_id === expected.userId && row.agency_id === expected.agencyId && row.active === true)) {
      stop("a protected agency administrator membership is missing or inactive");
    }
  }
}

async function assertTargetsHaveNoMembership(client) {
  const rows = await client.select("agency_memberships", {
    select: "user_id",
    user_id: inFilter(targetIds("authUserId")),
  });
  if (rows.length) stop("an allowlisted creator auth user now has agency access; nothing further was deleted");
}

async function assertChildAllowlist(client) {
  const accountFilter = inFilter(targetIds("accountId"));
  const [applications, consents, files, onboarding, assignments, links] = await Promise.all([
    client.select("creator_applications", { select: "id,creator_account_id", creator_account_id: accountFilter }),
    client.select("creator_consents", { select: "id,creator_account_id", creator_account_id: accountFilter }),
    client.select("creator_files", { select: "id,creator_account_id,bucket,storage_path", creator_account_id: accountFilter }),
    client.select("creator_onboarding_progress", { select: "creator_account_id", creator_account_id: accountFilter }),
    client.select("creator_agency_assignments", { select: "creator_account_id,agency_id", creator_account_id: accountFilter }),
    client.select("creator_clone_links", { select: "creator_account_id,clone_id", creator_account_id: accountFilter }),
  ]);
  for (const [table, rows] of [["creator_applications", applications], ["creator_consents", consents], ["creator_files", files]]) {
    const allowed = EXPECTED_CHILD_IDS[table];
    if (rows.some((row) => !allowed.has(row.id))) stop(`${table} contains a new row outside the deletion allowlist`);
  }
  const allowedFiles = new Set(STORAGE_OBJECTS.map((row) => `${row.accountId}\n${row.bucket}\n${row.path}`));
  if (files.some((row) => !allowedFiles.has(`${row.creator_account_id}\n${row.bucket}\n${row.storage_path}`))) {
    stop("creator_files contains a Storage path outside the deletion allowlist");
  }
  if (assignments.length) stop("a target creator now has an agency assignment");
  if (onboarding.some((row) => !targetIds("accountId").includes(row.creator_account_id))) stop("unexpected onboarding row found");
  if (links.some((row) => row.creator_account_id !== PRESERVED_CLONE.linkedAccountId || row.clone_id !== PRESERVED_CLONE.id)) {
    stop("a target creator has an unexpected clone link");
  }
  return { fileRowsPresent: files.length };
}

async function getAuthUser(client, target) {
  const user = await client.getAuthUser(target.authUserId);
  if (!user) return null;
  if (user.id !== target.authUserId || iso(user.created_at) !== target.authCreatedAt) stop("an Auth identity no longer matches its deletion allowlist");
  return user;
}

async function preflight(client) {
  await assertPreservedClone(client);
  await assertProtectedMemberships(client);
  await assertTargetsHaveNoMembership(client);
  const accounts = await client.select("creator_accounts", {
    select: "id,auth_user_id,source,account_status,created_at",
    id: inFilter(targetIds("accountId")),
  });
  const byAccount = new Map(TARGETS.map((target) => [target.accountId, target]));
  for (const row of accounts) {
    const expected = byAccount.get(row.id);
    if (!expected || row.auth_user_id !== expected.authUserId || row.source !== "twin" || row.account_status !== "applicant" || iso(row.created_at) !== expected.accountCreatedAt) {
      stop("a creator account no longer matches its deletion allowlist");
    }
  }
  const authLinks = await client.select("creator_accounts", {
    select: "id,auth_user_id",
    auth_user_id: inFilter(targetIds("authUserId")),
  });
  if (authLinks.some((row) => byAccount.get(row.id)?.authUserId !== row.auth_user_id)) stop("an allowlisted Auth user is linked to a different creator account");
  const childState = await assertChildAllowlist(client);
  let authUsersPresent = 0;
  for (const target of TARGETS) if (await getAuthUser(client, target)) authUsersPresent += 1;
  return { accountsPresent: accounts.length, authUsersPresent, fileRowsPresent: childState.fileRowsPresent };
}

async function removeStorageObjects(client) {
  let present = 0;
  for (const object of STORAGE_OBJECTS) if (await client.storageExists(object)) present += 1;
  const grouped = new Map();
  for (const object of STORAGE_OBJECTS) grouped.set(object.bucket, [...(grouped.get(object.bucket) || []), object.path]);
  for (const [bucket, paths] of grouped) await client.removeStorage(bucket, paths);
  for (const object of STORAGE_OBJECTS) if (await client.storageExists(object)) stop("an allowlisted Storage object remained after removal");
  return present;
}

async function deleteCreatorAccounts(client) {
  let deleted = 0;
  for (const target of TARGETS) {
    const rows = await client.deleteRows("creator_accounts", { id: `eq.${target.accountId}`, auth_user_id: `eq.${target.authUserId}` });
    if (rows.length > 1) stop("creator-account deletion affected more than one row");
    deleted += rows.length;
  }
  return deleted;
}

async function assertCreatorAccountsAbsent(client) {
  const [byId, byAuth] = await Promise.all([
    client.select("creator_accounts", { select: "id", id: inFilter(targetIds("accountId")) }),
    client.select("creator_accounts", { select: "id", auth_user_id: inFilter(targetIds("authUserId")) }),
  ]);
  if (byId.length || byAuth.length) stop("a target creator account remained after database deletion; Auth deletion was blocked");
}

async function deleteAuthUsers(client) {
  let deleted = 0;
  for (const target of TARGETS) {
    await assertTargetsHaveNoMembership(client);
    if (!await getAuthUser(client, target)) continue;
    await client.deleteAuthUser(target.authUserId);
    deleted += 1;
  }
  return deleted;
}

async function verifyAftermath(client) {
  const accountFilter = inFilter(targetIds("accountId"));
  const authFilter = inFilter(targetIds("authUserId"));
  const [byId, byAuth] = await Promise.all([
    client.select("creator_accounts", { select: "id", id: accountFilter }),
    client.select("creator_accounts", { select: "id", auth_user_id: authFilter }),
  ]);
  if (byId.length || byAuth.length) stop("creator account cleanup did not fully complete");
  for (const table of DEPENDENT_TABLES) {
    const rows = await client.select(table, { select: "creator_account_id", creator_account_id: accountFilter });
    if (rows.length) stop(`${table} still contains target rows`);
  }
  for (const target of TARGETS) if (await client.getAuthUser(target.authUserId)) stop("an allowlisted Auth user remained after deletion");
  for (const object of STORAGE_OBJECTS) if (await client.storageExists(object)) stop("an allowlisted Storage object remained after final verification");
  await assertTargetsHaveNoMembership(client);
  await assertProtectedMemberships(client);
  await assertPreservedClone(client);
}

export async function runReset({ args, env, request = fetch }) {
  assertExecutionArguments(args);
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) stop("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  assertExpectedProject(url);
  const client = createApi(url, serviceKey, request);
  console.log(`[reset] Allowlist locked to ${TARGETS.length} creator/auth pairs and ${STORAGE_OBJECTS.length} Storage objects.`);
  const before = await preflight(client);
  console.log(`[reset] Preflight passed (${before.accountsPresent} account rows, ${before.authUsersPresent} auth users, ${before.fileRowsPresent} file rows present).`);
  // Re-run the relationship guards at the destructive boundary, after every
  // read-only preflight request and immediately before the first deletion.
  await assertTargetsHaveNoMembership(client);
  await assertProtectedMemberships(client);
  await assertChildAllowlist(client);
  const storageDeleted = await removeStorageObjects(client);
  console.log(`[reset] Storage phase complete (${storageDeleted} existing objects removed).`);
  const accountsDeleted = await deleteCreatorAccounts(client);
  if (accountsDeleted !== before.accountsPresent) stop("creator-account deletion count changed after preflight; Auth deletion was blocked");
  await assertCreatorAccountsAbsent(client);
  await assertTargetsHaveNoMembership(client);
  const authUsersDeleted = await deleteAuthUsers(client);
  console.log(`[reset] Identity phase complete (${accountsDeleted} creator accounts and ${authUsersDeleted} auth users removed).`);
  await verifyAftermath(client);
  console.log("[reset] Verified: all allowlisted test identities/data are absent; protected agency admins and Mrs Callace remain intact.");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  runReset({ args: process.argv.slice(2), env: process.env }).catch((error) => {
    console.error(error instanceof OpsError || error instanceof ApiError ? `[reset] ${error.message.replace(/^\[reset\] /, "")}` : "[reset] Unexpected failure; details were intentionally suppressed.");
    process.exitCode = 1;
  });
}
