import {NextRequest,NextResponse} from "next/server";
import {planCGate} from "@/lib/onlyfans/plan-c-guard";
import {lifecycle,type LifecycleCommand} from "@/lib/onlyfans/plan-c-lifecycle-backend";
import {PRIVATE_HEADERS} from "@/lib/onlyfans/route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{accountId:string}>};
const answer=(result:Awaited<ReturnType<typeof lifecycle>>)=>NextResponse.json(result.body,{status:result.status,headers:PRIVATE_HEADERS});
export async function GET(request:NextRequest,context:Context){
 const gate=await planCGate(request,(await context.params).accountId,false);
 if(gate instanceof NextResponse)return gate;
 if(request.nextUrl.searchParams.size)return NextResponse.json({ok:false},{status:400,headers:PRIVATE_HEADERS});
 return answer(await lifecycle(gate.accountId,gate.actor));
}
export async function POST(request:NextRequest,context:Context){
 const gate=await planCGate(request,(await context.params).accountId,true);
 if(gate instanceof NextResponse)return gate;
 const body=gate.body as Record<string,unknown>|null;
 if(!body||Array.isArray(body)||Object.keys(body).sort().join(",")!=="action,commandKey,expectedRevision,reason"||
  !["activate","stop","autonomous","supervised"].includes(String(body.action))||
  !Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<1||
  typeof body.commandKey!=="string"||!(/^[0-9a-f]{64}$/).test(body.commandKey)||
  typeof body.reason!=="string"||!body.reason.trim()||body.reason.length>512)
  return NextResponse.json({ok:false,error:"Review the scope action and reason."},{status:400,headers:PRIVATE_HEADERS});
 return answer(await lifecycle(gate.accountId,gate.actor,body as LifecycleCommand));
}
