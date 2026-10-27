import {NextRequest,NextResponse} from "next/server";
import {pendingTeamInvite} from "@/lib/agency-team";
import {serviceClient} from "@/lib/supabase-service";
import {dashboardOrigin,trustedFormOrigin} from "@/lib/form-origin";
export async function POST(req:NextRequest) {
  if(!trustedFormOrigin(req)||![null,"same-origin"].includes(req.headers.get("sec-fetch-site")))return new NextResponse("Forbidden",{status:403});
  const fd=await req.formData(),code=String(fd.get("code")??"");
  if([...fd.keys()].some(k=>k!=="code")||fd.getAll("code").length!==1)return new NextResponse("Invalid input",{status:400});
  const invite=await pendingTeamInvite(code);if(!invite)return new NextResponse("Invitation unavailable",{status:400});
  const url=new URL("/agency/join",dashboardOrigin(req));url.searchParams.set("code",code);
  const db=serviceClient(),now=new Date().toISOString();
  // Atomic cooldown prevents concurrent email requests using the same link.
  let claim=db.from("agency_team_invites").update({email_requested_at:now}).eq("id",invite.id).is("revoked_at",null).is("accepted_at",null);
  claim=invite.email_requested_at ? claim.eq("email_requested_at",invite.email_requested_at).lt("email_requested_at",new Date(Date.now()-300_000).toISOString()) : claim.is("email_requested_at",null);
  const claimed=await claim.select("id");
  if(claimed.error||claimed.data?.length!==1)url.searchParams.set("result","wait");
  else {
    // User explicitly requested this email. No background/bulk invitations.
    const sent=await db.auth.admin.inviteUserByEmail(invite.email,{redirectTo:url.toString()});
    url.searchParams.set("result",sent.error?"error":"email");
  }
  const response=NextResponse.redirect(url,303);response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
}
