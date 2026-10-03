import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { hashInviteCode, randomInviteCode } from "@/lib/creator-invite-codes";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!await isAuthed()) return new NextResponse("Unauthorized", { status: 401 });
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });

  const fd = await req.formData();
  const action = String(fd.get("action") ?? "");
  const back = (query: string) =>
    NextResponse.redirect(new URL(`/agency-admin/creator-codes?${query}`, dashboardOrigin(req)), 303);
  const fail = () => back("result=error");
  const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

  if (action === "revoke") {
    const id = String(fd.get("id") ?? "");
    if (!isUuid(id)) return fail();
    const revoked = await supabaseAdmin
      .from("creator_agency_codes")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    return back(!revoked.error && revoked.data?.length ? "result=revoked" : "result=error");
  }

  if (action !== "generate") return fail();

  const agencyId = String(fd.get("agency") ?? "");
  const label = String(fd.get("label") ?? "").trim();
  const maxUsesRaw = String(fd.get("max_uses") ?? "").trim();
  const expiresDaysRaw = String(fd.get("expires_days") ?? "").trim();

  // Every field is validated before any database call.
  if (!isUuid(agencyId) || label.length > 120) return fail();

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

  const agency = await supabaseAdmin
    .from("partner_agencies")
    .select("id,slug")
    .eq("id", agencyId)
    .eq("active", true)
    .maybeSingle();
  if (agency.error || !agency.data) return fail();

  const code = randomInviteCode();
  const inserted = await supabaseAdmin.from("creator_agency_codes").insert({
    agency_id: agencyId,
    code_hash: hashInviteCode(code),
    label: label || null,
    active: true,
    max_uses: maxUses,
    uses: 0,
    expires_at: expiresAt,
  }).select("id");
  if (inserted.error || !inserted.data?.length) return fail();

  // The plaintext never reaches the database, so this redirect is the only
  // chance the operator gets to read it.
  // "for" lets the page build a Moxy-hosted invite link; it is validated again on read.
  const slug = typeof agency.data.slug === "string" && /^[a-z0-9-]{1,60}$/.test(agency.data.slug) ? agency.data.slug : "";
  return back(`created=${encodeURIComponent(code)}${slug ? `&for=${slug}` : ""}`);
}
