import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { assignedCreatorAccount, getAgencyOnboardingAccess } from "@/lib/agency-onboarding-access";
import { creatorBotLinkValues, getCreatorBotOptions } from "@/lib/agency-creator-links";
import { serviceClient } from "@/lib/supabase-service";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const access = await getAgencyOnboardingAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });

  const fd = await req.formData();
  const back = (result: string) => NextResponse.redirect(new URL(`/agency/creators?linkResult=${result}`, dashboardOrigin(req)), 303);
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const creatorAccountId = String(fd.get("creator_account_id") ?? "");
  const cloneId = String(fd.get("clone_id") ?? "");
  if (!isUuid(creatorAccountId)) return back("invalid");

  try {
    if (!await assignedCreatorAccount(access, creatorAccountId)) return new NextResponse("Forbidden", { status: 403 });
    // An empty/default select must never unlink an account (including slug-only
    // links created by the Twin build pipeline).
    if (!cloneId) return back("unchanged");
    if (!isUuid(cloneId)) return back("invalid");
    const options = await getCreatorBotOptions(access);
    const clone = options.clones.find(candidate => candidate.id === cloneId);
    if (!clone) return new NextResponse("Bot access denied", { status: 403 });

    const values = creatorBotLinkValues(options, clone);
    const db = serviceClient();
    // Never take a bot away from another account. The unique database indexes
    // also reject a competing link created between this check and the upsert.
    const conflicts = await Promise.all([
      ...(values.clone_id ? [db.from("creator_clone_links").select("creator_account_id").eq("clone_id", values.clone_id).neq("creator_account_id", creatorAccountId).limit(1)] : []),
      ...(values.twin_slug ? [db.from("creator_clone_links").select("creator_account_id").eq("twin_slug", values.twin_slug).neq("creator_account_id", creatorAccountId).limit(1)] : []),
    ]);
    if (conflicts.some(result => result.error)) return back("error");
    if (conflicts.some(result => result.data?.length)) return back("conflict");

    const saved = await db.from("creator_clone_links").upsert({
      creator_account_id: creatorAccountId,
      ...values,
      linked_at: new Date().toISOString(),
    }, { onConflict: "creator_account_id" });
    if (saved.error) return back(saved.error.code === "23505" ? "conflict" : "error");
    return back("linked");
  } catch {
    return back("error");
  }
}
