import { NextRequest,NextResponse } from "next/server";
import { platformCommand,platformProfile,platformFailure,platformResponse,ownedPlatformAccounts } from "@/lib/creator-platforms/server";
import { object } from "@/lib/onlyfans-connections/contract";
import { issueHostedReference,verifyHostedReference,sealHostedResume,openHostedResume } from "@/lib/creator-platforms/hosted-reference";
import { hostedConfigured,hostedAccount,providerRequest,submitHostedConnection,HOSTED_RESUME_COOKIE,PROVIDER_ORIGIN,ProviderAlreadyAuthenticated } from "@/lib/creator-platforms/hosted-server";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,path:"/creator-auth/platforms/onlyfans/hosted",maxAge:3600};
const keys=(value:Record<string,unknown>,expected:string[])=>Object.keys(value).sort().join(",")===expected.sort().join(",");
function attemptId(value:unknown){try{if(typeof value!=="string")return null;const url=new URL(value);return url.origin===PROVIDER_ORIGIN&&!url.search&&!url.hash&&/^\/api\/authenticate\/auth_[A-Za-z0-9_-]{1,100}$/.test(url.pathname)?url.pathname.split("/").at(-1)!:null;}catch{return null;}}
function faceUrl(value:unknown){try{if(typeof value!=="string")return null;const url=new URL(value);return url.protocol==="https:"&&url.hostname==="id.onlyfans.com"&&!url.username&&!url.password&&!url.hash&&["","443"].includes(url.port)?url.href:null;}catch{return null;}}
export async function POST(request:NextRequest){
  const ctx=await platformCommand(request);if(ctx instanceof NextResponse)return ctx;
  if(!hostedConfigured())return platformFailure(503,"OnlyFans sign-in is not available yet.");
  if(!object(ctx.body)||typeof ctx.body.action!=="string")return platformFailure(400,"Invalid connection request.");
  const body=ctx.body;
  try{
    const profile=await platformProfile(ctx.creator);if(!profile.id)return platformFailure(409,"Refresh your platform setup before connecting.");
    if(body.action==="start"&&keys(body,["action"])){
      const reference=issueHostedReference(ctx.creator,profile.id);
      const country=process.env.OFAPI_PROXY_COUNTRY||"us";if(!["us","uk","gb"].includes(country))throw new Error();
      const result=await providerRequest("/api/client-sessions","POST",{display_name:ctx.creator.creatorName,client_reference_id:reference,proxy_country:country,scopes:["*"],app_name:"Twin Technologies"});
      const token=object(result.data)?result.data.token:null;if(typeof token!=="string"||!/^ofapi_cs_[A-Za-z0-9_-]{8,200}$/.test(token))throw new Error();
      // A browser success callback is only a progress signal. The signed provider
      // event and native worker verification establish the account connection.
      return platformResponse({ok:true,kind:"signin",token});
    }
    if(body.action==="reconnect"&&keys(body,["action","accountId"])&&typeof body.accountId==="string"){
      const accounts=await ownedPlatformAccounts(profile.id),selected=accounts.find(account=>account.accountId===body.accountId);if(!selected)return platformFailure(404,"That account is unavailable.");
      const account=await hostedAccount(selected.accountId),reference=issueHostedReference(ctx.creator,profile.id);
      let result:Record<string,unknown>;
      try{result=await providerRequest(`/api/authenticate/${account.providerAccountId}/reauthenticate`,"POST");}
      catch(error){
        if(!(error instanceof ProviderAlreadyAuthenticated))throw error;
        // A healthy provider session needs a new native verification lease, not
        // another login. Its saved owner is still independently checked by /me.
        const submitted=await submitHostedConnection(reference,account.providerAccountId,account.ownerId,selected.binding.handle);
        if(!submitted.ok)throw new Error();
        return platformResponse({ok:true,kind:"reconnect",phase:"checking"});
      }
      const id=attemptId(result.polling_url);if(!id)throw new Error();
      const resume={reference,attemptId:id,accountId:account.accountId,providerAccountId:account.providerAccountId,ownerId:account.ownerId,handle:selected.binding.handle};
      const response=platformResponse({ok:true,kind:"reconnect",phase:"waiting"});response.cookies.set(HOSTED_RESUME_COOKIE,sealHostedResume(resume),cookieOptions);return response;
    }
    if(["status","code","face-done"].includes(String(body.action))){
      if(!keys(body,body.action==="code"?["action","code"]:["action"]))return platformFailure(400,"Invalid verification request.");
      const resume=openHostedResume(request.cookies.get(HOSTED_RESUME_COOKIE)?.value),proof=verifyHostedReference(resume?.reference);
      if(!resume||!proof||proof.accountId!==ctx.creator.accountId||proof.userId!==ctx.creator.userId||proof.profileId!==profile.id||proof.agencyId!==ctx.creator.agencyId||typeof resume.attemptId!=="string"||!/^auth_[A-Za-z0-9_-]{1,100}$/.test(resume.attemptId)||typeof resume.accountId!=="string")return platformFailure(409,"This connection attempt expired. Start again.");
      const accounts=await ownedPlatformAccounts(profile.id),selected=accounts.find(account=>account.accountId===resume.accountId);if(!selected)return platformFailure(404,"That account is unavailable.");
      const account=await hostedAccount(selected.accountId);if(account.providerAccountId!==resume.providerAccountId||account.ownerId!==resume.ownerId)return platformFailure(409,"Your connection changed. Start again.");
      const path=`/api/authenticate/${resume.attemptId}`;
      if(body.action==="code"){
        if(typeof body.code!=="string"||!/^\d{4,8}$/.test(body.code))return platformFailure(400,"Enter the verification code.");
        await providerRequest(path,"PUT",{code:body.code});
      }else if(body.action==="face-done")await providerRequest(path,"PUT",{selfie_verification_completed:true});
      const result=await providerRequest(path,"GET"),last=object(result.lastAttempt)?result.lastAttempt:null;
      if(last?.success===true){
        if(!object(result.account)||result.account.id!==account.providerAccountId)return platformFailure(409,"The verified account did not match. Start again.");
        const submitted=await submitHostedConnection(resume.reference as string,account.providerAccountId,account.ownerId,String(resume.handle));
        if(!submitted.ok)return platformFailure(503,"Your account is signed in. Its connection is still being confirmed; check its status before retrying.");
        const response=platformResponse({ok:true,kind:"reconnect",phase:"checking"});response.cookies.delete({name:HOSTED_RESUME_COOKIE,path:cookieOptions.path});return response;
      }
      if(last?.needs_face_otp===true){const url=faceUrl(last.face_otp_verification_url||result.face_otp_verification_url);if(!url)return platformFailure(409,"This account needs additional verification. Your agency can help complete it.");return platformResponse({ok:true,kind:"reconnect",phase:"face",url});}
      if(result.twoFactorPending===true||last?.needs_otp===true||["needs-otp","needs-app-otp"].includes(String(result.state)))return platformResponse({ok:true,kind:"reconnect",phase:"code"});
      if(last?.completed_at&&last?.success!==true)return platformFailure(409,"Sign-in could not be completed. Start again or ask your agency for help.");
      return platformResponse({ok:true,kind:"reconnect",phase:"waiting"});
    }
    return platformFailure(400,"Invalid connection request.");
  }catch{return platformFailure(503,"Your connection could not be confirmed. Check its status before starting again.");}
}
