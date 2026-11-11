import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId} from "@/lib/onlyfans/route";
import {configuredVaultBackend} from "@/lib/onlyfans/vault-backend";
import {folderReference} from "@/lib/onlyfans/vault-editing";
import {vaultMediaId} from "@/lib/onlyfans/vault";
import {CONTENT_SCHEMA} from "@/lib/onlyfans/content";
import {vaultAnswer,vaultRefusal} from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{accountId:string;folderId:string}>}){
 const ctx=await requireOnlyFansRead({agency:true});if(ctx instanceof NextResponse)return ctx;
 const p=await context.params,account=requestId(p.accountId),ids=(request.nextUrl.searchParams.get("mediaIds")??"").split(",");
 if(!account||!folderReference(p.folderId)||request.nextUrl.searchParams.size!==1||request.nextUrl.searchParams.getAll("mediaIds").length!==1||ids.length>500||!ids.every(vaultMediaId)||new Set(ids).size!==ids.length)return vaultRefusal(400,"Select exact category assets.");
 const backend=configuredVaultBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Content management is unavailable.");
 const result=await backend.reviewCategory(account,p.folderId,ids);
 return result.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,...result.data}):vaultRefusal(result.status,result.error);
}
