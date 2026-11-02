import { getDashboardAccess } from "@/lib/dashboard-access";
import { redirect } from "next/navigation";
export default async function RetiredCrmTeamPage() {
  redirect(await getDashboardAccess() ? "/revenue" : "/agency-admin");
}
