import { isLiveAccess } from "../deployment/flirt-live-twin.cjs";
import { getDashboardAccess } from "./dashboard-access";
import { serviceClient } from "./supabase-service";
import type { AgencyIdentity } from "./agency-identity";

// The operator's dashboard identity addresses the four Twin bots. Intake is
// always local: resolve the agency and clone grants from FLIRT before using it.
// Never send Twin clone IDs into local account linking or invite generation.
export async function getAgencyOnboardingAccess(): Promise<AgencyIdentity | null> {
  const access = await getDashboardAccess();
  if (!access || !isLiveAccess(access)) return access;
  const db = serviceClient();
  const [agency, grants] = await Promise.all([
    db.from("partner_agencies").select("id,name").eq("id", access.id).eq("active", true).maybeSingle(),
    db.from("agency_creators").select("clone_id").eq("agency_id", access.id),
  ]);
  if (agency.error || grants.error || !agency.data) throw new Error("FLIRT onboarding agency is unavailable");
  const cloneIds = (grants.data ?? []).map(row => String(row.clone_id));
  if (cloneIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Invalid FLIRT creator assignment");
  return { id: agency.data.id, name: agency.data.name, cloneIds };
}

export async function assignedCreatorAccount(access: AgencyIdentity, accountId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return false;
  const result = await serviceClient().from("creator_agency_assignments")
    .select("creator_account_id").eq("creator_account_id", accountId).eq("agency_id", access.id).maybeSingle();
  if (result.error) throw new Error("Creator assignment is unavailable");
  return !!result.data;
}
