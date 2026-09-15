import CrmSettingsShell, {
  CRM_SETTINGS_SECTIONS,
  type CrmSettingsSection,
} from "@/components/crm/CrmSettingsShell";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CrmSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const access = await getDashboardAccess();
  if (access && !agencyCanManage(access)) redirect("/revenue");
  const params = await searchParams;
  const requested = Array.isArray(params.section) ? params.section[0] : params.section;
  const activeSection: CrmSettingsSection = CRM_SETTINGS_SECTIONS.includes(requested as CrmSettingsSection)
    ? requested as CrmSettingsSection
    : "connections";

  return (
    <CrmSettingsShell
      activeSection={activeSection}
      agencyName={access?.name}
      isAgency={Boolean(access)}
      canManage={!access || agencyCanManage(access)}
    />
  );
}
