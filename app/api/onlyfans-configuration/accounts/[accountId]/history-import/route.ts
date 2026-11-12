import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId,PRIVATE_HEADERS} from "@/lib/onlyfans/route";
import {configuredBackendPurpose,createBackendTransport} from "@/lib/onlyfans/backend-transport";
import {CONFIGURATION_SCHEMA,CONFIGURATION_HEADER,canonicalConfiguration} from "@/lib/onlyfans/configuration";
import {trustedFormOrigin} from "@/lib/form-origin";
import {readCommandJson} from "@/lib/onlyfans/command-json";
export const dynamic="force-dynamic";export const runtime="nodejs";
const answer=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:PRIVATE_HEADERS});
export async function POST(request:NextRequest,context:{params:Promise<{accountId:string}>}){
 const ctx=await requireOnlyFansRead({agency:true,write:true});if(ctx instanceof NextResponse)return ctx;
 if(!ctx.actor||!ctx.canManage)return answer({ok:false,error:"Managing access is required."},403);
 if(!trustedFormOrigin(request)||![null,"same-origin"].includes(request.headers.get("sec-fetch-site"))||
  request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
  return answer({ok:false,error:"Use this dashboard."},403);
 const account=requestId((await context.params).accountId);
 if(!account||request.nextUrl.searchParams.size)return answer({ok:false,error:"Invalid account."},400);
 let value:unknown;try{value=await readCommandJson(request,32768);}catch{return answer({ok:false,error:"Invalid history request."},400);}
 const b=value as Record<string,unknown>|null;
 if(!b||Array.isArray(b)||Object.keys(b).sort().join(",")!=="action,expectedRevision,reason,requestId,spec"||b.action!=="configure"||
  !Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0||typeof b.reason!=="string"||!b.reason.trim()||b.reason.length>512||
  typeof b.requestId!=="string"||!(/^[0-9a-f-]{36}$/).test(b.requestId)||!b.spec||typeof b.spec!=="object"||Array.isArray(b.spec))
  return answer({ok:false,error:"Review the history import limits."},400);
 const options=configuredBackendPurpose("CONFIGURATION");if(!options)return answer({ok:false,error:"History configuration unavailable."},503);
 const commandKey=createHash("sha256").update(canonicalConfiguration([ctx.actor,account,"history-import",b])).digest("hex");
 const {requestId:nonce,...command}=b;void nonce;
 const call=createBackendTransport(ctx.fetch);
 try{
  const response=await call(options.baseUrl.replace(/\/+$/,"")+"/onlyfans/configuration/v1/accounts/"+encodeURIComponent(account)+"/history-import",{
   method:"POST",headers:{Authorization:"Bearer "+options.token,[CONFIGURATION_HEADER]:CONFIGURATION_SCHEMA,"Content-Type":"application/json"},
   body:JSON.stringify({...command,actor:ctx.actor,commandKey})});
  const ack=await response.json();
  if(response.ok&&ack.schemaVersion===CONFIGURATION_SCHEMA&&ack.ok===true&&ack.accountId===account&&ack.commandKey===commandKey)
   return answer({ok:true,history:ack.history});
  if([400,401,403,404,409,413,503].includes(response.status))
   return answer({ok:false,error:"History import refused. Refresh coverage and review limits."},response.status);
 }catch{}
 return answer({ok:false,outcome:"unconfirmed",error:"Outcome unconfirmed. Retry this same request."},502);
}
