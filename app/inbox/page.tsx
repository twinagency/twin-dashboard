import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { activeViewAs } from "@/lib/view-as";

export const dynamic = "force-dynamic";
// Retired presentation route. Bookmarks now open the real workspace.
export default async function RetiredPresentationPage() {
  if (!await hasInternalAdminAccess()) redirect("/twin");
  if (await activeViewAs(await cookies())) redirect("/revenue");
  redirect("/users");
}
