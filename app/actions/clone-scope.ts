"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";

// Called from the header CloneSwitcher (and the "All clones" table rows on
// Info/Drip/Media) to change which clone the 7 data pages are scoped to.
// null/"" means "All clones".
export async function setCloneScope(id: string | null) {
  await guardDashboardAction("app/actions/clone-scope.ts#setCloneScope", [id]);
  const jar = await cookies();
  if (id) {
    jar.set(CLONE_SCOPE_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    jar.delete(CLONE_SCOPE_COOKIE);
  }
  // Every server-rendered data page reads the cookie, so a full-tree
  // revalidate is the simplest way to make the switch take effect everywhere.
  revalidatePath("/", "layout");
}
