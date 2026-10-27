import {createClient} from "@supabase/supabase-js";
import {NextRequest,NextResponse} from "next/server";
import {pendingTeamInvite,teamTokenHash} from "@/lib/agency-team";
import {serviceClient} from "@/lib/supabase-service";
import {setAgencySessionCookies} from "@/lib/agency-session";
import {dashboardOrigin,trustedFormOrigin} from "@/lib/form-origin";
import {SESSION_COOKIE} from "@/lib/session";
import {CLONE_SCOPE_COOKIE} from "@/lib/clone-scope";
import {AGENCY_PORTAL_COOKIE,isMoxy,isLynq} from "@/lib/agency-brand";
export async function POST(req:NextRequest) {
  if(!trustedFormOrigin(req)||![null,"same-origin"].includes(req.headers.get("sec-fetch-site")))return new NextResponse("Forbidden",{status:403});
  const fd=await req.formData();
  if([...fd.keys()].some(k=>!["code","email","password","access_token","refresh_token"].includes(k)||fd.getAll(k).length!==1||typeof fd.get(k)!=="string"))return new NextResponse("Invalid input",{status:400});
  const code=String(fd.get("code")??""),password=String(fd.get("password")??""),access=String(fd.get("access_token")??""),refresh=String(fd.get("refresh_token")??"");
  const invite=await pendingTeamInvite(code);if(!invite)return new NextResponse("Invitation unavailable",{status:400});
  const failure=()=>{const u=new URL("/agency/join",dashboardOrigin(req));u.searchParams.set("code",code);u.searchParams.set("result","error");return NextResponse.redirect(u,303);};
  if(!password||password.length>256||access.length>8192||refresh.length>4096||access&&password.length<16)return failure();
  const auth=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=access ? await auth.auth.setSession({access_token:access,refresh_token:refresh}) : await auth.auth.signInWithPassword({email:String(fd.get("email")??"").trim(),password});
  if(signed.error||!signed.data.session)return failure();
  const verified=await auth.auth.getUser(signed.data.session.access_token);
  if(verified.error||!verified.data.user?.email_confirmed_at||verified.data.user.email?.toLowerCase()!==invite.email)return failure();
  // Verify current membership before password setup; never alter an existing staff account through a new invitation.
  const existing=await serviceClient().from("agency_memberships").select("user_id").eq("user_id",verified.data.user.id).maybeSingle();
  if(existing.error||existing.data)return failure();
  if(access) {const changed=await auth.auth.updateUser({password});if(changed.error)return failure();}
  const accepted=await serviceClient().rpc("agency_team_accept",{p_user:verified.data.user.id,p_hash:teamTokenHash(code),p_verified_email:verified.data.user.email});
  if(accepted.error)return failure();
  const response=NextResponse.redirect(new URL("/agency/setup",dashboardOrigin(req)),303);
  await setAgencySessionCookies(response,signed.data.session);response.cookies.delete(SESSION_COOKIE);response.cookies.delete(CLONE_SCOPE_COOKIE);
  response.cookies.set(AGENCY_PORTAL_COOKIE,isMoxy(invite.agencyName)?"moxy":isLynq(invite.agencyName)?"lynq":"twin",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:86400*30});
  response.headers.set("Cache-Control","private, no-store");return response;
}
