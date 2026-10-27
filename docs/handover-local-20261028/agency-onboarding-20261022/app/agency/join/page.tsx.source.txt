import AgencyJoin from "@/components/AgencyJoin";
import {pendingTeamInvite} from "@/lib/agency-team";
export const dynamic="force-dynamic";
export const metadata={title:"Join your agency · Twin",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function JoinPage({searchParams}:{searchParams:Promise<{code?:string;result?:string}>}) {
  const {code="",result}=await searchParams, invitation=await pendingTeamInvite(code);
  return <main data-agency-team-page className="mx-auto mt-12 max-w-lg rounded-2xl border border-line bg-panel p-6 text-ink">{invitation?<>{result&&<p role="status" className="mb-5 rounded-lg border border-line p-4">{result==="email"?"Verification email requested. Check your inbox and spam folder. If you already have a login, use the sign-in option below.":result==="wait"?"A verification email was recently requested. Check your inbox before trying again.":"Unable to complete this step. Check your login or ask your agency owner for a fresh invitation."}</p>}<AgencyJoin code={code} agency={invitation.agencyName}/></>:<><h1 className="text-2xl font-semibold">Invitation unavailable</h1><p className="mt-3">This invitation has expired, was revoked or has already been accepted. Ask your agency owner for a new link.</p><a href="/agency/login" className="mt-5 inline-block text-accent">Already joined? Sign in</a></>}</main>;
}
