import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  if (!await isAuthed()) return new NextResponse("Unauthorized", { status: 401 });
  if (!req.headers.get("origin") || new URL(req.headers.get("origin")!).host !== req.headers.get("host")) return new NextResponse("Forbidden",{status:403});
  const fd = await req.formData();
  const agencyId = String(fd.get("agency") ?? "");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const operation = String(fd.get("operation") ?? "");
  const done = (result:string) => NextResponse.redirect(new URL(`/agency-admin?result=${result}`,req.url),303);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !/^[0-9a-f-]{36}$/i.test(agencyId)) return done("error");
  const agency = await supabaseAdmin.from("partner_agencies").select("id").eq("id",agencyId).eq("active",true).maybeSingle();
  if (agency.error || !agency.data) return done("error");
  if (operation === "revoke") {
    const result = await supabaseAdmin.from("agency_memberships").update({active:false}).eq("agency_id",agencyId).eq("email",email).select("user_id");
    return done(!result.error && result.data?.length ? "revoked":"error");
  }
  if (operation!=="create" || password.length<16 || password.length>256) return done("error");
  const created = await supabaseAdmin.auth.admin.createUser({email,password,email_confirm:true});
  if (created.error || !created.data.user) return done("error");
  const membership = await supabaseAdmin.from("agency_memberships").insert({agency_id:agencyId,user_id:created.data.user.id,email,active:true});
  if (membership.error) {
    await supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
    return done("error");
  }
  return done("created");
}
