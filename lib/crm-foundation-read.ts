import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { readCrmReferenceRowsByIds, readEveryCrmRow, type CrmReadError } from "@/lib/crm-foundation-pagination";
import {
  buildCrmFoundationView,
  type CrmAgencyRow,
  type CrmChannelConnectionRow,
  type CrmCloneRow,
  type CrmConnectionCapabilityRow,
  type CrmCreatorBindingRow,
  type CrmCreatorRow,
  type CrmFoundationResult,
} from "@/lib/crm-foundation-model";

const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"]);

const unavailable = (reason: "not_migrated" | "query_failed", message: string): CrmFoundationResult => ({
  status: "unavailable",
  reason,
  message,
  creators: [],
});

const logReadFailure = (table: string, error: CrmReadError) => {
  console.error("Hybrid CRM foundation read failed", { table, code: error.code ?? "unknown", message: error.message });
};

export async function readCrmFoundation(): Promise<CrmFoundationResult> {
  const access = await getDashboardAccess();
  const [creatorResult, bindingResult, connectionResult, capabilityResult] = await Promise.all([
    readEveryCrmRow<CrmCreatorRow>("crm_creators", () =>
      supabaseAdmin.from("crm_creators").select("id,display_name,status,created_at,updated_at").order("id", { ascending: true }),
    ),
    readEveryCrmRow<CrmCreatorBindingRow>("crm_creator_bindings", () =>
      supabaseAdmin.from("crm_creator_bindings").select("creator_id,creator_account_id,clone_id,agency_id,mapping_status,conflict_reason,created_at,updated_at").order("creator_id", { ascending: true }),
    ),
    readEveryCrmRow<CrmChannelConnectionRow>("crm_channel_connections", () =>
      supabaseAdmin.from("crm_channel_connections").select("id,creator_id,provider,handle,display_name,connection_status,sync_status,last_verified_at,last_synced_at,created_at,updated_at").order("id", { ascending: true }),
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

  const [agencyResult, cloneResult] = await Promise.all([
    access
      ? Promise.resolve({
          rows: sessionAgencyId && agencyIds.includes(sessionAgencyId) ? [{ id: sessionAgencyId, name: access.name }] as CrmAgencyRow[] : [],
          error: null,
        })
      : readCrmReferenceRowsByIds<CrmAgencyRow>("partner_agencies", agencyIds, (ids) =>
          supabaseAdmin.from("partner_agencies").select("id,name").in("id", ids).order("id", { ascending: true }),
        ),
    readCrmReferenceRowsByIds<CrmCloneRow>("clones", cloneIds, (ids) =>
      supabaseAdmin.from("clones").select("id,name,slug,status").in("id", ids).order("id", { ascending: true }),
    ),
  ]);

  if (agencyResult.error) {
    logReadFailure("partner_agencies", agencyResult.error);
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }
  if (cloneResult.error) {
    logReadFailure("clones", cloneResult.error);
    return unavailable("query_failed", "The creator registry could not be loaded. No partial data is being shown.");
  }

  return {
    status: "available",
    creators: buildCrmFoundationView({
      creators,
      bindings,
      connections,
      capabilities,
      agencies: agencyResult.rows,
      clones: cloneResult.rows,
    }),
    loadedAt: new Date().toISOString(),
  };
}
