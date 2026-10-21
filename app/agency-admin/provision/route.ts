import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { serviceClient } from "@/lib/supabase-service";
import { parseAgencyMemberCommand } from "@/lib/agency-member-management";

export async function POST(req: NextRequest) {
  if (!await hasInternalAdminAccess()) return new NextResponse("Unauthorized", { status: 401 });
  if (!trustedFormOrigin(req) || ![null,"same-origin"].includes(req.headers.get("sec-fetch-site"))) return new NextResponse("Forbidden", {status:403});
  let command: ReturnType<typeof parseAgencyMemberCommand>;
  try { command = parseAgencyMemberCommand(await req.formData()); } catch { command = null; }
  const done = (result:string) => {
    const target = new URL("/agency-admin", dashboardOrigin(req));
    target.searchParams.set("result",result);
    if (command) target.searchParams.set("agency",command.agencyId);
    return NextResponse.redirect(target,303);
  };
  if (!command) return done("error");
  const db = serviceClient();
  const agency = await db.from("partner_agencies").select("id").eq("id",command.agencyId).eq("active",true).maybeSingle();
  if (agency.error || !agency.data) return done("error");
  if (command.operation !== "create") {
    let query = db.from("agency_memberships").update(command.operation === "revoke" ? {active:false}
      : {active:true,can_manage:command.canManage}).eq("agency_id",command.agencyId).eq("email",command.email);
    if (command.userId) query = query.eq("user_id",command.userId);
    if (command.expectedActive !== undefined) query = query.eq("active",command.expectedActive);
    if (command.expectedCanManage !== undefined) query = query.eq("can_manage",command.expectedCanManage);
    const result = await query.select("user_id");
    return done(!result.error && result.data?.length === 1 ? command.operation === "revoke" ? "revoked" : "updated" : "conflict");
  }
  // Preserve the existing password-based provisioning flow. This sends no invitation email.
  const created = await db.auth.admin.createUser({email:command.email,password:command.password,email_confirm:true});
  if (created.error || !created.data.user) return done("error");
  const membership = await db.from("agency_memberships").insert({agency_id:command.agencyId,user_id:created.data.user.id,
    email:command.email,active:true,can_manage:command.canManage});
  if (membership.error) {
    await db.auth.admin.deleteUser(created.data.user.id);
    return done("error");
  }
  return done("created");
}
