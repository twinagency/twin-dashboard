import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { serviceClient } from "@/lib/supabase-service";
import { readCrmReferenceRowsByIds, readEveryCrmRow, type CrmReadError } from "@/lib/crm-foundation-pagination";
import {
  buildCrmActivityView,
  buildCrmFoundationReferences,
  buildCrmFoundationView,
  type CrmActivityRow,
  type CrmAgencyRow,
  type CrmChannelConnectionRow,
  type CrmCloneRow,
  type CrmConnectionCapabilityRow,
  type CrmCreatorBindingRow,
  type CrmCreatorAccountRow,
  type CrmCreatorRow,
  type CrmFoundationResult,
  type CrmMappingConflictRow,
} from "@/lib/crm-foundation-model";

const MISSING_RELATION_CODES = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

const unavailable = (reason: "not_migrated" | "query_failed", message: string): CrmFoundationResult => ({
  status: "unavailable",
  reason,
  message,
  creators: [],
});

const logReadFailure = (table: string, error: CrmReadError) => {
  console.error("Hybrid CRM foundation read failed", { table, code: error.code ?? "unknown", message: error.message });
};

async function readRecentActivity(
  access: Awaited<ReturnType<typeof getDashboardAccess>>,
): Promise<{ rows: CrmActivityRow[]; error: CrmReadError | null }> {
  if (access) return { rows: [], error: null };
  const query = serviceClient()
    .from("crm_activity_events")
    .select("id,creator_id,agency_id,connection_id,event_type,status,occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(100);
  const result = await query;
  if (result.error) return { rows: [], error: result.error };
  return { rows: (result.data ?? []) as CrmActivityRow[], error: null };
}

export async function readCrmFoundation(): Promise<CrmFoundationResult> {
  const access = await getDashboardAccess();
  const [creatorResult, bindingResult, connectionResult, capabilityResult] = await Promise.all([
    readEveryCrmRow<CrmCreatorRow>("crm_creators", () =>
      supabaseAdmin.from("crm_creators").select("id,display_name,status,created_at,updated_at,revision").order("id", { ascending: true }),
    ),
    readEveryCrmRow<CrmCreatorBindingRow>("crm_creator_bindings", () =>
      supabaseAdmin.from("crm_creator_bindings").select("creator_id,creator_account_id,clone_id,agency_id,mapping_status,conflict_reason,created_at,updated_at,revision").order("creator_id", { ascending: true }),
    ),
    readEveryCrmRow<CrmChannelConnectionRow>("crm_channel_connections", () =>
      supabaseAdmin.from("crm_channel_connections").select("id,creator_id,provider,handle,display_name,connection_status,sync_status,last_verified_at,last_synced_at,created_at,updated_at,revision").order("id", { ascending: true }),
    ),
    readEveryCrmRow<CrmConnectionCapabilityRow>("crm_channel_connection_capabilities", () =>
      supabaseAdmin.from("crm_channel_connection_capabilities").select("connection_id,capability,state,detail,checked_at").order("connection_id", { ascending: true }).order("capability", { ascending: true }),
    ),
  ]);

  const coreResults = [
    ["crm_creators", creatorResult],
    ["crm_creator_bindings", bindingResult],
    ["crm_channel_connections", connectionResult],
    ["crm_channel_connection_capabilities", capabilityResult],
  ] as const;
  const failed = coreResults.find(([, result]) => result.error);
  const failedError = failed?.[1].error;
  if (failed && failedError) {
    const [table] = failed;
    logReadFailure(table, failedError);
    if (MISSING_RELATION_CODES.has(failedError.code ?? "")) {
      return unavailable("not_migrated", "The hybrid CRM foundation is not available in this environment yet.");
    }
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }

  const creators = creatorResult.rows;
  const bindings = bindingResult.rows;
  const connections = connectionResult.rows;
  const capabilities = capabilityResult.rows;
  const agencyIds = [...new Set(bindings.map((binding) => binding.agency_id).filter((id): id is string => Boolean(id)))];
  const cloneIds = [...new Set(bindings.map((binding) => binding.clone_id).filter((id): id is string => Boolean(id)))];
  const scopedAccess = access as (typeof access & { kind?: "creator"; agencyId?: string | null });
  const sessionAgencyId = access ? (scopedAccess.kind === "creator" ? scopedAccess.agencyId ?? null : access.id) : null;
  if (access && agencyIds.some((id) => id !== sessionAgencyId)) {
    console.error("Hybrid CRM foundation read returned an agency outside the verified session scope");
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }

  const [agencyResult, cloneResult, creatorAccountResult, conflictResult, activityResult] = await Promise.all([
    access
      ? Promise.resolve({
          rows: sessionAgencyId && agencyIds.includes(sessionAgencyId) ? [{ id: sessionAgencyId, name: access.name }] as CrmAgencyRow[] : [],
          error: null,
        })
      : readEveryCrmRow<CrmAgencyRow>("partner_agencies", () =>
          serviceClient().from("partner_agencies").select("id,name").eq("active", true).order("id", { ascending: true }),
        ),
    access
      ? readCrmReferenceRowsByIds<CrmCloneRow>("clones", cloneIds, (ids) =>
          supabaseAdmin.from("clones").select("id,name,slug,status").in("id", ids).order("id", { ascending: true }),
        )
      : readEveryCrmRow<CrmCloneRow>("clones", () =>
          serviceClient().from("clones").select("id,name,slug,status").order("id", { ascending: true }),
        ),
    access
      ? Promise.resolve({ rows: [] as CrmCreatorAccountRow[], error: null })
      : readEveryCrmRow<CrmCreatorAccountRow>("creator_accounts", () =>
          serviceClient().from("creator_accounts").select("id,display_name,account_status").order("id", { ascending: true }),
        ),
    access
      ? Promise.resolve({ rows: [] as CrmMappingConflictRow[], error: null })
      : readEveryCrmRow<CrmMappingConflictRow>("crm_creator_mapping_conflicts", () =>
          serviceClient()
            .from("crm_creator_mapping_conflicts")
            .select("id,creator_id,conflict_type,status,detected_at,revision")
            .eq("status", "open")
            .order("detected_at", { ascending: false }),
        ),
    readRecentActivity(access),
  ]);

  if (agencyResult.error) {
    logReadFailure("partner_agencies", agencyResult.error);
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }
  if (cloneResult.error) {
    logReadFailure("clones", cloneResult.error);
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }
  if (creatorAccountResult.error) {
    logReadFailure("creator_accounts", creatorAccountResult.error);
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }
  if (conflictResult.error) {
    logReadFailure("crm_creator_mapping_conflicts", conflictResult.error);
    if (MISSING_RELATION_CODES.has(conflictResult.error.code ?? "")) {
      return unavailable("not_migrated", "The hybrid CRM foundation is not available in this environment yet.");
    }
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }
  if (activityResult.error) {
    logReadFailure("crm_activity_events", activityResult.error);
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }

  const references = !access ? buildCrmFoundationReferences({
    agencies: agencyResult.rows,
    clones: cloneResult.rows,
    creatorAccounts: creatorAccountResult.rows,
  }) : undefined;

  const creatorViews = buildCrmFoundationView({
    creators,
    bindings,
    connections,
    capabilities,
    agencies: agencyResult.rows,
    clones: cloneResult.rows,
    conflicts: conflictResult.rows,
  });
  const visibleCreators = access
    ? creatorViews.map((creator) => ({
        ...creator,
        creatorAccountId: null,
        revision: null,
        bindingRevision: null,
        mappingConflicts: [],
        connections: creator.connections.map((connection) => ({ ...connection, revision: null })),
      }))
    : creatorViews;

  return {
    status: "available",
    creators: visibleCreators,
    references,
    activities: buildCrmActivityView(activityResult.rows),
    loadedAt: new Date().toISOString(),
  };
}
