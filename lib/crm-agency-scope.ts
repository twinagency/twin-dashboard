import type { AgencyIdentity } from "./agency-identity";
import { scopedSelection } from "./agency-query";
import { serviceClient } from "./supabase-service";

export const CRM_FOUNDATION_READ_TABLES = new Set([
  "crm_creators",
  "crm_creator_bindings",
  "crm_channel_connections",
  "crm_channel_connection_capabilities",
]);

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A UUID IN predicate is intentionally bounded so it stays below common URL
// limits. If a roster outgrows this Sprint 1 path, deny the read rather than
// silently return a truncated cross-tenant scope. The production follow-up is
// a database-native scoped RPC/view, not a larger unbounded URL.
const MAX_SCOPE_IDS = 200;

type CrmScopeIdentity = AgencyIdentity & {
  kind?: "creator";
  accountId?: string;
  agencyId?: string | null;
};

type CreatorBindingScope = {
  creator_id: string;
  creator_account_id: string | null;
  clone_id: string | null;
  agency_id: string | null;
};

function isCreatorIdentity(access: CrmScopeIdentity): access is CrmScopeIdentity & {
  kind: "creator";
  accountId: string;
  agencyId: string | null;
} {
  return access.kind === "creator" && typeof access.accountId === "string";
}

function validIds(values: readonly string[]): string[] {
  const ids = [...new Set(values)];
  if (ids.some(id => !UUID.test(id))) throw new Error("Invalid CRM resource assignment");
  if (ids.length > MAX_SCOPE_IDS) throw new Error("CRM resource scope exceeds the safe read limit");
  return ids;
}

function mandatoryIds(url: URL, key: string, values: readonly string[]): URL {
  const ids = validIds(values);
  // Append a second mandatory predicate. Caller-supplied filters remain in
  // place and can only narrow this server-owned scope, never replace it.
  url.searchParams.append("and", `(${key}.in.(${(ids.length ? ids : [EMPTY_UUID]).join(",")}))`);
  return url;
}

export function crmFoundationTable(input: URL): string | null {
  if (!input.pathname.startsWith("/rest/v1/")) return null;
  const table = input.pathname.slice("/rest/v1/".length);
  return CRM_FOUNDATION_READ_TABLES.has(table) ? table : null;
}

export async function allowedCrmCreatorIds(access: CrmScopeIdentity): Promise<string[]> {
  const db = serviceClient();
  let query = db
    .from("crm_creator_bindings")
    .select("creator_id,creator_account_id,clone_id,agency_id", { count: "exact" });

  if (isCreatorIdentity(access)) {
    if (!UUID.test(access.accountId)) throw new Error("Invalid creator account assignment");
    query = query.eq("creator_account_id", access.accountId);
  } else {
    if (!UUID.test(access.id)) throw new Error("Invalid agency assignment");
    query = query.eq("agency_id", access.id);
  }

  // Fetch one row beyond the supported scope so an oversized agency fails
  // closed instead of inheriting PostgREST's default row truncation.
  const result = await query.limit(MAX_SCOPE_IDS + 1);
  if (result.error) throw new Error("CRM creator assignments are unavailable");
  if (result.count === null || result.count > MAX_SCOPE_IDS || result.data?.length !== result.count) {
    throw new Error("CRM resource scope exceeds the safe read limit");
  }

  const allowedClones = new Set(validIds(access.cloneIds));
  const rows = (result.data ?? []) as CreatorBindingScope[];
  const creatorIds = rows
    .filter(row => {
      if (isCreatorIdentity(access)) {
        if (row.creator_account_id !== access.accountId || row.agency_id !== access.agencyId) return false;
      } else if (row.agency_id !== access.id) return false;
      return row.clone_id === null || allowedClones.has(row.clone_id);
    })
    .map(row => row.creator_id);

  return validIds(creatorIds);
}

async function allowedConnectionIds(creatorIds: readonly string[]): Promise<string[]> {
  const ids = validIds(creatorIds);
  if (!ids.length) return [];
  const result = await serviceClient()
    .from("crm_channel_connections")
    .select("id,creator_id", { count: "exact" })
    .in("creator_id", ids)
    .limit(MAX_SCOPE_IDS + 1);
  if (result.error) throw new Error("CRM connection assignments are unavailable");
  if (result.count === null || result.count > MAX_SCOPE_IDS || result.data?.length !== result.count) {
    throw new Error("CRM resource scope exceeds the safe read limit");
  }
  const allowedCreators = new Set(ids);
  return validIds((result.data ?? []).filter(row => allowedCreators.has(row.creator_id)).map(row => row.id));
}

export async function scopeCrmFoundationReadUrl(input: URL, access: CrmScopeIdentity): Promise<URL> {
  const url = new URL(input);
  const table = crmFoundationTable(url);
  if (!table) throw new Error("Unsupported CRM resource");
  url.searchParams.set("select", scopedSelection(table, url.searchParams.get("select") || "*"));

  const creatorIds = await allowedCrmCreatorIds(access);
  if (table === "crm_creators") return mandatoryIds(url, "id", creatorIds);
  if (table === "crm_creator_bindings" || table === "crm_channel_connections") {
    return mandatoryIds(url, "creator_id", creatorIds);
  }
  return mandatoryIds(url, "connection_id", await allowedConnectionIds(creatorIds));
}
