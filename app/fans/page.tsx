import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { activeViewAs } from "@/lib/view-as";
import FanWorkspace from "@/components/fans/FanWorkspace";
import { creators, authoredFans } from "@/components/fans/data";

export const dynamic = "force-dynamic";
export default async function FanProfilesPage() {
  if (!await hasInternalAdminAccess()) redirect("/twin");
  if (await activeViewAs(await cookies())) redirect("/revenue");
  return <FanWorkspace creators={creators} fans={authoredFans} includeBriannaLedger />;
}
