import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId,PRIVATE_HEADERS} from "@/lib/onlyfans/route";
import {configuredPreparationBackend} from "@/lib/onlyfans/preparation-backend";
import {validPreparationCommand} from "@/lib/onlyfans/preparation";
import {CONFIGURATION_SCHEMA,canonicalConfiguration} from "@/lib/onlyfans/configuration";
import {readCommandJson} from "@/lib/onlyfans/command-json";
import {trustedFormOrigin} from "@/lib/form-origin";
export const dynamic="force-dynamic";export const runtime="nodejs";
type Context={params:Promise<{accountId:string}>};
const answer=(body:unknown,status=200)=>NextResponse.json({schemaVersion:CONFIGURATION_SCHEMA,...body as object},{status,headers:PRIVATE_HEADERS});
export async function GET(request:NextRequest,context:Context){
 const ctx=await requireOnlyFansRead({agency:true});if(ctx instanceof NextResponse)return ctx;
 const account=requestId((await context.params).accountId);if(!account||request.nextUrl.searchParams.size)return answer({ok:false,error:"Invalid account."},400);
 const backend=configuredPreparationBackend(ctx.fetch);if(!backend)return answer({ok:false,error:"Preparation is unavailable."},503);
 const result=await backend.request(account);return result.ok?answer({ok:true,accountId:account,preparation:result.preparation}):answer(result,result.status);
}
export async function POST(request:NextRequest,context:Context){
 const ctx=await requireOnlyFansRead({agency:true,write:true});if(ctx instanceof NextResponse)return ctx;
 if(!ctx.actor||!ctx.canManage)return answer({ok:false,error:"Managing access is required."},403);
 if(!trustedFormOrigin(request)||![null,"same-origin"].includes(request.headers.get("sec-fetch-site"))||
 request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return answer({ok:false,error:"Use this dashboard."},403);
 const account=requestId((await context.params).accountId);if(!account||request.nextUrl.searchParams.size)return answer({ok:false,error:"Invalid account."},400);
 let body:unknown;try{body=await readCommandJson(request,16384);}catch{return answer({ok:false,error:"Invalid preparation request."},400);}
 if(!validPreparationCommand(body))return answer({ok:false,error:"Review the preparation identity and explicit budget."},400);
 const backend=configuredPreparationBackend(ctx.fetch);if(!backend)return answer({ok:false,error:"Preparation is unavailable."},503);
 const commandKey=createHash("sha256").update(canonicalConfiguration([ctx.actor,account,"preparation",body])).digest("hex");
 const {requestId:nonce,...command}=body;void nonce;
 const result=await backend.request(account,{...command,actor:ctx.actor,commandKey});
 return result.ok?answer({ok:true,accountId:account,preparation:result.preparation}):answer(result,result.status);
}
