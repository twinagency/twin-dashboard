import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId,PRIVATE_HEADERS} from "@/lib/onlyfans/route";
import {configuredCommercialBackend} from "@/lib/onlyfans/commercial-backend";
import {CONFIGURATION_SCHEMA} from "@/lib/onlyfans/configuration";
export const dynamic="force-dynamic";export const runtime="nodejs";
type Context={params:Promise<{accountId:string}>};
const answer=(body:unknown,status=200)=>NextResponse.json({schemaVersion:CONFIGURATION_SCHEMA,...body as object},{status,headers:PRIVATE_HEADERS});
/** Read-only history coverage. The dashboard reports what the backend measured; it never infers completeness. */
export async function GET(request:NextRequest,context:Context){
 const ctx=await requireOnlyFansRead({agency:true});if(ctx instanceof NextResponse)return ctx;
 const account=requestId((await context.params).accountId);if(!account||request.nextUrl.searchParams.size)return answer({ok:false,error:"Invalid account."},400);
 const backend=configuredCommercialBackend(ctx.fetch);if(!backend)return answer({ok:false,error:"History coverage is unavailable."},503);
 const result=await backend.read(account,"history-coverage");return result.ok?answer({ok:true,accountId:account,coverage:result.data}):answer(result,result.status);
}
