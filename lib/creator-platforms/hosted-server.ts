import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { serviceClient } from "@/lib/supabase-service";
import { creatorAccountStatusAllowsAccess } from "@/lib/creator-dashboard-identity";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { configuredBackendPurpose, createBackendTransport } from "@/lib/onlyfans/backend-transport";
import { canonicalConnection, connectionOwner, object } from "@/lib/onlyfans-connections/contract";
import { parseCommandJson } from "@/lib/onlyfans/command-json";
import { platformProfile } from "./server";
import { verifyHostedReference } from "./hosted-reference";
export const HOSTED_RESUME_COOKIE="twin_onlyfans_resume";
export const PROVIDER_ORIGIN="https://app.onlyfansapi.com";
import { hostedConfigured } from "./hosted-config";
export { hostedConfigured } from "./hosted-config";
export class ProviderAlreadyAuthenticated extends Error { constructor(){super("The provider account is already signed in");} }
export async function providerRequest(path:string,method:"GET"|"POST"|"PUT",body?:unknown){
  if(!hostedConfigured()||!/^\/api\/(client-sessions|authenticate\/acct_[A-Za-z0-9]{1,80}\/reauthenticate|authenticate\/auth_[A-Za-z0-9_-]{1,100})$/.test(path))throw new Error("Connection service unavailable");
  const response=await fetch(PROVIDER_ORIGIN+path,{method,headers:{Authorization:`Bearer ${process.env.OFAPI_API_KEY}`,"Content-Type":"application/json",Accept:"application/json"},body:body===undefined?undefined:JSON.stringify(body),credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
  const raw=await limitedBytes(response.body,131072);
  const parsed=parseCommandJson(new TextDecoder("utf-8",{fatal:true}).decode(raw));if(!object(parsed))throw new Error("Connection service unavailable");
  if(!response.ok){
    if(response.status===400&&method==="POST"&&/^\/api\/authenticate\/acct_[A-Za-z0-9]{1,80}\/reauthenticate$/.test(path)&&parsed.reason==="Account is already successfully authenticated"&&parsed.message==="Can't re-authenticate account at this time.")throw new ProviderAlreadyAuthenticated();
    throw new Error("Connection service unavailable");
  }
  return parsed;
}
export async function limitedBytes(stream:ReadableStream<Uint8Array>|null,maximum:number){
  if(!stream)throw new Error("Empty connection response");const reader=stream.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();throw new Error("Connection request too large");}parts.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
export function validProviderSignature(bytes:Uint8Array,signature:string|null){
  const secret=process.env.OFAPI_WEBHOOK_SECRET||"";if(secret.length<32||!signature||!/^[a-f0-9]{64}$/.test(signature))return false;
  const expected=createHmac("sha256",secret).update(bytes).digest("hex");return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
export async function currentHostedCreator(reference:string){
  const proof=verifyHostedReference(reference);if(!proof)throw new Error("Connection reference unavailable");
  const db=serviceClient();
  const [account,assignment]=await Promise.all([
    db.from("creator_accounts").select("id,auth_user_id,display_name,account_status,source").eq("id",proof.accountId).eq("auth_user_id",proof.userId).maybeSingle(),
    db.from("creator_agency_assignments").select("agency_id,partner_agencies(active)").eq("creator_account_id",proof.accountId).maybeSingle(),
  ]);
  const agency=assignment.data?.partner_agencies as unknown as {active:boolean}|null;
  if(account.error||assignment.error||!account.data||!creatorAccountStatusAllowsAccess(account.data.account_status)||(assignment.data?.agency_id||null)!==proof.agencyId||(proof.agencyId&&!agency?.active)||(account.data.source==="agency_invite"&&!proof.agencyId))throw new Error("Creator account changed");
  const profile=await platformProfile({accountId:proof.accountId,userId:proof.userId});if(profile.id!==proof.profileId)throw new Error("Creator profile changed");
  return{proof,name:account.data.display_name||"Your creator account"};
}
export async function submitHostedConnection(reference:string,providerAccountId:string,ownerId:number,handle:string){
  if(!/^acct_[A-Za-z0-9]{1,80}$/.test(providerAccountId)||!Number.isSafeInteger(ownerId)||ownerId<1||!/^[A-Za-z0-9_.-]{1,80}$/.test(handle))throw new Error("Invalid provider identity");
  const {proof}=await currentHostedCreator(reference),backend=configuredConnectionBackend();if(!backend)throw new Error("Connection service unavailable");
  const actor="creator-session:"+createHash("sha256").update(proof.accountId).digest("hex");
  const session={ownerId,hosted:{schemaVersion:"ofapi.v1" as const,accountId:providerAccountId},expiresAt:new Date((proof.issuedAt+23*3600)*1000).toISOString()};
  // Provider-event fields stay immutable across retries, including display-name edits.
  const command={creatorId:proof.profileId,creatorName:"@"+handle,handle,session};
  const commandKey=createHash("sha256").update(canonicalConnection([actor,"hosted-enroll",reference,command])).digest("hex");
  return backend.enroll({...command,actor,commandKey});
}
export async function hostedAccount(accountId:string){
  if(!/^of-[1-9][0-9]{0,15}$/.test(accountId))throw new Error("Invalid account");
  const config=configuredBackendPurpose("CONNECTION");if(!config)throw new Error("Connection service unavailable");
  const response=await createBackendTransport()(config.baseUrl.replace(/\/+$/,"")+"/onlyfans/connection/v1/hosted-accounts/"+encodeURIComponent(accountId),{method:"GET",headers:{Authorization:`Bearer ${config.token}`,"X-OnlyFans-Connection-Version":"of-connections.v1"}});
  const body=response.ok?await response.json():null,value=body?.account;
  if(body?.schemaVersion!=="of-connections.v1"||body?.ok!==true||!object(value)||value.accountId!==accountId||typeof value.providerAccountId!=="string"||!/^acct_[A-Za-z0-9]{1,80}$/.test(value.providerAccountId)||!connectionOwner(String(value.ownerId)))throw new Error("Hosted connection unavailable");
  return{accountId,providerAccountId:value.providerAccountId,ownerId:connectionOwner(String(value.ownerId))!};
}
