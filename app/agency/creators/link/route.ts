import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardAccess } from "@/lib/dashboard-access";
// serviceClient, not supabaseAdmin: supabaseAdmin's fetch is intercepted for
// agency sessions and force-scoped by clone_id, which these agency_id-scoped
// tables do not have. Every query here scopes to the signed-in agency explicitly.
import { serviceClient } from "@/lib/supabase-service";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const access = await getDashboardAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });

  const fd = await req.formData();
  const back = () => NextResponse.redirect(new URL("/agency/creators", dashboardOrigin(req)), 303);
  const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

  const creatorAccountId = String(fd.get("creator_account_id") ?? "");
  const cloneId = String(fd.get("clone_id") ?? "");
  if (!isUuid(creatorAccountId)) return back();

  // Only a creator this agency was assigned may be linked, and only to a
  // clone the agency was already granted. This never widens what an agency
  // can see, it only lets them do the linking step themselves.
  const assignment = await serviceClient()
    .from("creator_agency_assignments")
    .select("creator_account_id")
    .eq("creator_account_id", creatorAccountId)
    .eq("agency_id", access.id)
    .maybeSingle();
  if (assignment.error || !assignment.data) return back();

  if (!cloneId) {
    await serviceClient().from("creator_clone_links").delete().eq("creator_account_id", creatorAccountId);
    return back();
  }
  if (!isUuid(cloneId) || !access.cloneIds.includes(cloneId)) return back();

  const clone = await serviceClient().from("clones").select("id,slug").eq("id", cloneId).maybeSingle();
  if (clone.error || !clone.data) return back();

  await serviceClient().from("creator_clone_links").delete().eq("clone_id", cloneId).neq("creator_account_id", creatorAccountId);
  await serviceClient().from("creator_clone_links").upsert({
    creator_account_id: creatorAccountId,
    clone_id: clone.data.id,
    twin_slug: clone.data.slug,
    linked_at: new Date().toISOString(),
  }, { onConflict: "creator_account_id" });

  return back();
}
