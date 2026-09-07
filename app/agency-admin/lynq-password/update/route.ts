import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";

export async function POST(req:NextRequest) {
  if(!trustedFormOrigin(req)||req.headers.has("next-action"))return NextResponse.json({ok:false},{status:403});
  if(req.cookies.get(AGENCY_COOKIE)?.value||!await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value))return NextResponse.json({ok:false},{status:401});
  try {
    const password=String((await req.formData()).get("password")??"");
    if(password.length<16||password.length>256)return NextResponse.json({ok:false},{status:400});
    const db=serviceClient();
    const member=await db.from("agency_memberships").select("user_id")
      .eq("agency_id","74b03b70-397e-49ab-841f-8adb8241d87d").eq("user_id","6e6491b9-8db0-43f5-b04a-d4509318dac9").eq("active",true).maybeSingle();
    if(member.error||!member.data)return NextResponse.json({ok:false},{status:403});
    const {error}=await db.auth.admin.updateUserById(member.data.user_id,{password});
    return NextResponse.json({ok:!error},{status:error?502:200,headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({ok:false},{status:503});}
}
