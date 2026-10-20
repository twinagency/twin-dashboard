import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId,PRIVATE_HEADERS} from "@/lib/onlyfans/route";
import {configuredVaultMediaBackend} from "@/lib/onlyfans/vault-media-backend";
import {vaultMediaId} from "@/lib/onlyfans/vault";
import {vaultRefusal} from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{accountId:string;mediaId:string}>};
async function stream(request:NextRequest,context:Context,head:boolean){
  const auth=await requireOnlyFansRead({ agency: true });if(auth instanceof NextResponse)return auth;
  const p=await context.params,accountId=requestId(p.accountId),range=request.headers.get("range");
  if(!accountId||!vaultMediaId(p.mediaId)||request.nextUrl.searchParams.size)return vaultRefusal(400,"That video reference is invalid.");
  if(range&&(range.length>100||!/^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/.test(range)))return new NextResponse(null,{status:416,headers:PRIVATE_HEADERS});
  const backend=configuredVaultMediaBackend(auth.fetch);if(!backend)return vaultRefusal(503,"Media management is not configured.");
  const r=await backend.stream(accountId,p.mediaId,range,head);if(!r.ok)return vaultRefusal(r.status,r.error);
  const headers=new Headers(PRIVATE_HEADERS);r.headers.forEach((value,key)=>headers.set(key,value));headers.set("X-Content-Type-Options","nosniff");
  return new NextResponse(head?null:r.body,{status:r.status,headers});
}
export const GET=(request:NextRequest,context:Context)=>stream(request,context,false);
export const HEAD=(request:NextRequest,context:Context)=>stream(request,context,true);
