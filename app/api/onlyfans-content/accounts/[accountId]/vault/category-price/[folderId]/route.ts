import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId} from "@/lib/onlyfans/route";
import {configuredVaultBackend} from "@/lib/onlyfans/vault-backend";
import {folderReference,vaultEditHash} from "@/lib/onlyfans/vault-editing";
import {object,exact,nonce} from "@/lib/onlyfans/commercial-categories";
import {CONTENT_SCHEMA} from "@/lib/onlyfans/content";
import {vaultAnswer,vaultRefusal,vaultCommandContext} from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";export const runtime="nodejs";
type Context={params:Promise<{accountId:string;folderId:string}>};
export async function GET(request:NextRequest,context:Context){
 const ctx=await requireOnlyFansRead({agency:true});if(ctx instanceof NextResponse)return ctx;
 const p=await context.params,account=requestId(p.accountId);
 if(!account||!folderReference(p.folderId)||request.nextUrl.searchParams.size)return vaultRefusal(400,"Choose a category.");
 const backend=configuredVaultBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Content management is unavailable.");
 const result=await backend.categoryPrice(account,p.folderId);
 return result.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,categoryPrice:result.data}):vaultRefusal(result.status,result.error);
}
export async function POST(request:NextRequest,context:Context){
 const ctx=await vaultCommandContext(request);if(ctx instanceof NextResponse)return ctx;
 const p=await context.params,account=requestId(p.accountId),b=ctx.body;
 if(!account||!folderReference(p.folderId)||request.nextUrl.searchParams.size||!object(b)||!exact(b,["requestId","priceCents","expectedFingerprint"])||!nonce(b.requestId)||!vaultEditHash(b.expectedFingerprint)||!Number.isSafeInteger(b.priceCents)||(b.priceCents as number)<300||(b.priceCents as number)>20000)return vaultRefusal(400,"Set the agency single-asset price using the current category version.");
 const backend=configuredVaultBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Content management is unavailable.");
 const result=await backend.setCategoryPrice(account,p.folderId,{priceCents:b.priceCents as number,expectedFingerprint:b.expectedFingerprint,...ctx.identity(account,"category-price:"+p.folderId)});
 return result.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,...result,applied:true,accountId:account}):vaultAnswer({schemaVersion:CONTENT_SCHEMA,...result},result.status);
}
