import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { hashInviteCode, randomInviteCode } from "@/lib/creator-invite-codes";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const access = await getDashboardAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });

  const fd = await req.formData();
  const action = String(fd.get("action") ?? "");
  const back = (query: string) =>
    NextResponse.redirect(new URL(`/agency/creator-invites?${query}`, dashboardOrigin(req)), 303);
  const fail = () => back("result=error");
  const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

  if (action === "revoke") {
    const id = String(fd.get("id") ?? "");
    if (!isUuid(id)) return fail();
    // Scoped to this agency: an agency can only revoke its own codes.
    const revoked = await supabaseAdmin
      .from("creator_agency_codes")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("agency_id", access.id)
      .select("id");
    return back(!revoked.error && revoked.data?.length ? "result=revoked" : "result=error");
  }

  if (action !== "generate") return fail();

  const label = String(fd.get("label") ?? "").trim();
  const maxUsesRaw = String(fd.get("max_uses") ?? "").trim();
  const expiresDaysRaw = String(fd.get("expires_days") ?? "").trim();

  if (label.length > 120) return fail();

  let maxUses: number | null = null;
  if (maxUsesRaw) {
    if (!/^\d{1,6}$/.test(maxUsesRaw)) return fail();
    maxUses = Number(maxUsesRaw);
    if (!Number.isInteger(maxUses) || maxUses < 1) return fail();
  }

  let expiresAt: string | null = null;
  if (expiresDaysRaw) {
    if (!/^\d{1,4}$/.test(expiresDaysRaw)) return fail();
    const days = Number(expiresDaysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return fail();
    expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  const code = randomInviteCode();
  const inserted = await supabaseAdmin.from("creator_agency_codes").insert({
    agency_id: access.id,
    code_hash: hashInviteCode(code),
    label: label || null,
    active: true,
    max_uses: maxUses,
    uses: 0,
    expires_at: expiresAt,
  }).select("id");
  if (inserted.error || !inserted.data?.length) return fail();

  return back(`created=${encodeURIComponent(code)}`);
}
