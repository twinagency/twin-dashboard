import { NextRequest, NextResponse } from "next/server";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { serviceClient } from "@/lib/supabase-service";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

export async function POST(req: NextRequest) {
  if (!await hasInternalAdminAccess()) return new NextResponse("Unauthorized",{status:401});
  if (!trustedFormOrigin(req) || ![null,"same-origin"].includes(req.headers.get("sec-fetch-site"))) return new NextResponse("Forbidden",{status:403});
  const fd=await req.formData(), agency=String(fd.get("agency")??""), user=String(fd.get("user_id")??""), action=String(fd.get("operation")??"");
  if ([...fd.keys()].some(k=>!["agency","user_id","operation"].includes(k)) || [...fd.keys()].some(k=>fd.getAll(k).length!==1)
    || !/^[0-9a-f-]{36}$/i.test(agency) || !/^[0-9a-f-]{36}$/i.test(user) || !["grant","revoke"].includes(action)) return new NextResponse("Invalid input",{status:400});
  const db=serviceClient();
  const member=await db.from("agency_memberships").select("user_id").eq("agency_id",agency).eq("user_id",user).eq("active",true).eq("creator_scope","all").maybeSingle();
  const result=action==="revoke" ? await db.from("agency_team_owners").delete().eq("agency_id",agency).eq("user_id",user)
    : member.error || !member.data ? {error:true} : await db.from("agency_team_owners").insert({agency_id:agency,user_id:user});
  const url=new URL("/agency-admin",dashboardOrigin(req)); url.searchParams.set("agency",agency);url.searchParams.set("result",result.error ? "conflict":"updated");
  return NextResponse.redirect(url,303);
}
