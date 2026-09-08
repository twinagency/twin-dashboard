import { getDashboardAccess } from "@/lib/dashboard-access";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { redirect } from "next/navigation";
import CrmPreview from "@/components/crm/CrmPreview";

export default async function CrmPlatformsPage() {
  if (agencyCanManage(await getDashboardAccess())) redirect("/business");
  return <CrmPreview view="platforms" />;
}
