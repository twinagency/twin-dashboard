import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId,PRIVATE_HEADERS} from "@/lib/onlyfans/route";
import {configuredBackendPurpose,createBackendTransport} from "@/lib/onlyfans/backend-transport";
import {CONFIGURATION_SCHEMA,CONFIGURATION_HEADER,canonicalConfiguration} from "@/lib/onlyfans/configuration";
import {readCommandJson} from "@/lib/onlyfans/command-json";
import {trustedFormOrigin} from "@/lib/form-origin";
export const dynamic="force-dynamic";export const runtime="nodejs";
type Context={params:Promise<{accountId:string;itemId:string}>};
const answer=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:PRIVATE_HEADERS});
async function handle(request:NextRequest,context:Context,write:boolean){
 const ctx=await requireOnlyFansRead({agency:true,...(write?{write:true}:{})});
 if(ctx instanceof NextResponse)return ctx;
 if(write&&(!ctx.actor||!ctx.canManage))return answer({ok:false,error:"Managing access is required."},403);
 const p=await context.params,account=requestId(p.accountId),item=p.itemId;
 if(!account||!(/^[1-9][0-9]{0,9}$/).test(item)||request.nextUrl.searchParams.size)return answer({ok:false},400);
 if(write&&(!trustedFormOrigin(request)||![null,"same-origin"].includes(request.headers.get("sec-fetch-site"))))return answer({ok:false},403);
 const options=configuredBackendPurpose("CONFIGURATION");if(!options)return answer({ok:false},503);
 let command:Record<string,unknown>|undefined;
 if(write){
  let body:unknown;try{body=await readCommandJson(request,4096);}catch{return answer({ok:false},400);}
  if(!body||typeof body!=="object"||Array.isArray(body))return answer({ok:false},400);
  const value=body as Record<string,unknown>,approve=value.action==="approve";
  const keys=["action","expectedRevision","requestId",...(approve?["standardCents","discountCents","expectedFingerprint"]:[])];
  if((!approve&&value.action!=="withdraw")||Object.keys(value).length!==keys.length||!keys.every(k=>k in value)||
   !Number.isInteger(value.expectedRevision)||Number(value.expectedRevision)<0||typeof value.requestId!=="string"||
   !(/^[0-9a-f-]{36}$/).test(value.requestId))return answer({ok:false},400);
  if(approve&&(!Number.isInteger(value.standardCents)||Number(value.standardCents)<300||Number(value.standardCents)>20000||
   !(value.discountCents===null||Number.isInteger(value.discountCents)&&Number(value.discountCents)>=300&&Number(value.discountCents)<Number(value.standardCents))||
   typeof value.expectedFingerprint!=="string"||!(/^[a-f0-9]{64}$/).test(value.expectedFingerprint)))return answer({ok:false},400);
  const commandKey=createHash("sha256").update(canonicalConfiguration([ctx.actor,account,item,"terms",value])).digest("hex");
  const {requestId:nonce,...rest}=value;void nonce;
  command={...rest,actor:ctx.actor,commandKey};
 }
 try{
  const call=createBackendTransport(ctx.fetch);
  const response=await call(options.baseUrl.replace(/\/+$/,"")+"/onlyfans/configuration/v1/accounts/"+encodeURIComponent(account)+"/catalogue-terms/"+item,
   {method:write?"POST":"GET",headers:{Authorization:"Bearer "+options.token,[CONFIGURATION_HEADER]:CONFIGURATION_SCHEMA,...(write?{"Content-Type":"application/json"}:{})},...(command?{body:JSON.stringify(command)}:{})});
  const body=await response.json();
  if(response.ok&&body?.ok===true&&body.schemaVersion===CONFIGURATION_SCHEMA&&body.accountId===account&&body.terms?.itemId===item&&Number.isInteger(body.terms.revision))
   return answer(body);
  return answer({ok:false,error:"Refresh and review the current product and terms."},[400,401,403,404,409,413,503].includes(response.status)?response.status:502);
 }catch{return answer({ok:false,outcome:write?"unconfirmed":"refused",error:write?"Outcome unconfirmed. Retry the same request.":"Terms could not be read."},502);}
}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,false);
export const POST=(r:NextRequest,c:Context)=>handle(r,c,true);
