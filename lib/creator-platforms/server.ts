import "server-only";
import { createHash } from "node:crypto";
import { trustedFormOrigin } from "@/lib/form-origin";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { serviceClient } from "@/lib/supabase-service";
import { getViewAsBannerInfo } from "@/lib/view-as-banner";
import { configuredOnlyFansBackend } from "@/lib/onlyfans/backend";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { readCommandJson } from "@/lib/onlyfans/command-json";
import { canonicalConnection } from "@/lib/onlyfans-connections/contract";
import { PLATFORM_SCHEMA, type CreatorPlatforms } from "./model";
import { configuredSignInBackend } from "@/lib/onlyfans-sign-in/backend";
export const platformResponse = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export const platformFailure = (status:number,error:string) => platformResponse({schemaVersion:PLATFORM_SCHEMA,ok:false,error},status);
export async function platformIdentity(write=false) {
  const jar=await cookies();
  // A master/agency cookie and a forged creator header never substitute for this session.
  const creator=await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  if(!creator) return platformFailure(401,"Sign in to your creator account.");
  if(write && (creator.readOnly || await getViewAsBannerInfo())) return platformFailure(403,"Connections cannot be changed in a read-only view.");
  return creator;
}
export async function platformCommand(request:NextRequest) {
  const creator=await platformIdentity(true);if(creator instanceof NextResponse)return creator;
  if(!trustedFormOrigin(request) || ![null,"same-origin"].includes(request.headers.get("sec-fetch-site")) || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return platformFailure(403,"Open connection setup from your dashboard.");
  let body:unknown;try{body=await readCommandJson(request,131_072);}catch{return platformFailure(400,"That connection request could not be read.");}
  const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
  const actor=`creator-session:${digest(creator.accountId)}`;
  return {creator,body,identity:(scope:string,command:unknown)=>({actor,commandKey:digest(canonicalConnection([actor,scope,command]))})};
}
export async function platformProfile(creator:{accountId:string;userId:string}) {
  const db=serviceClient();
  const {data,error}=await db.from("creator_accounts").select("id,auth_user_id,platform_creator_id,requested_channels").eq("id",creator.accountId).eq("auth_user_id",creator.userId).maybeSingle();
  if(error||!data)throw new Error("Platform setup could not be loaded. Please refresh.");
  const link=await db.from("creator_clone_links").select("clone_id").eq("creator_account_id",creator.accountId).maybeSingle();
  if(link.error || data.platform_creator_id && link.data?.clone_id && data.platform_creator_id!==link.data.clone_id)throw new Error("Your platform identity needs your agency’s attention.");
  const id=(data.platform_creator_id||link.data?.clone_id||null) as string|null;
  return {id,requested:data.requested_channels as ("telegram"|"onlyfans")[],telegramLinked:!!id&&link.data?.clone_id===id};
}
export async function ownedPlatformAccounts(profileId:string|null) {
  if(!profileId)return [];
  const backend=configuredOnlyFansBackend();if(!backend)throw new Error("OnlyFans connection status is temporarily unavailable.");
  const result=await backend.listAccounts({creatorId:profileId});
  // profileId comes only from the signed-in creator's current database identity.
  // No native binding is the normal first-connection state, not an outage.
  if(!result.ok && result.status===404 && result.code==="backend_unknown_creator")return [];
  if(!result.ok || !Array.isArray(result.data) || result.data.some(account=>account?.binding?.creatorId!==profileId || account.binding.channel!=="onlyfans"))throw new Error("Your OnlyFans accounts could not be verified. Please refresh.");
  if(new Set(result.data.map(account=>account.accountId)).size!==result.data.length)throw new Error("Your OnlyFans accounts could not be verified. Please refresh.");
  return result.data;
}
export async function platformSnapshot(creator:Awaited<ReturnType<typeof platformIdentity>>):Promise<CreatorPlatforms> {
  if(creator instanceof NextResponse)throw new Error("Creator session required");
  const profile=await platformProfile(creator),db=serviceClient();
  const telegram={configured:false,status:null as string|null,handle:null as string|null};
  if(profile.id&&profile.telegramLinked){
    const result=await db.from("clones").select("id,status,business_username").eq("id",profile.id).neq("bot_token","").maybeSingle();
    if(result.error)throw new Error("Telegram connection status could not be loaded.");
    if(result.data){telegram.configured=true;telegram.status=result.data.status;telegram.handle=result.data.business_username;}
  }
  let onlyfans:CreatorPlatforms["onlyfans"];
  try{
    const accounts=await ownedPlatformAccounts(profile.id),connections=configuredConnectionBackend();
    if(!connections)throw new Error("OnlyFans connection setup is temporarily unavailable.");
    const enrollments=profile.id?await connections.enrollments(profile.id):{ok:true as const,data:[]};
    if(!enrollments.ok)throw new Error("OnlyFans connection setup is temporarily unavailable.");
    onlyfans={status:"ready",error:null,signIn:configuredSignInBackend()?"hosted":"desktop",enrollments:enrollments.data,accounts:await Promise.all(accounts.map(async account=>{const connection=await connections.get(account.accountId);return{id:account.accountId,handle:account.binding.handle,health:account.health,connection:connection.ok?connection.data:null};}))};
  }catch(error){onlyfans={status:"unavailable",accounts:[],enrollments:[],error:error instanceof Error?error.message:"OnlyFans connection status is unavailable."};}
  return{schemaVersion:PLATFORM_SCHEMA,creatorName:creator.creatorName,profileId:profile.id,requested:profile.requested||[],readOnly:creator.readOnly,telegram,onlyfans};
}
