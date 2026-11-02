import { getDashboardAccess } from "@/lib/dashboard-access";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { redirect } from "next/navigation";


export default async function CrmCampaignsPage() {
  if (agencyCanManage(await getDashboardAccess())) redirect("/flows");
  redirect("/mtproto-campaign/media");
}

