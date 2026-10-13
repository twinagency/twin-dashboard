import { getDashboardAccess } from "@/lib/dashboard-access";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { redirect } from "next/navigation";

export default async function CrmPlatformsPage() {
  if (agencyCanManage(await getDashboardAccess())) redirect("/business");
  redirect("/revenue");
}
