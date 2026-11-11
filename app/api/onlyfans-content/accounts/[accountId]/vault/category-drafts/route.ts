import {NextRequest,NextResponse} from "next/server";
import {requestId} from "@/lib/onlyfans/route";
import {configuredVaultBackend} from "@/lib/onlyfans/vault-backend";
import {validCategoryDraft,object,exact,nonce} from "@/lib/onlyfans/commercial-categories";
import {CONTENT_SCHEMA} from "@/lib/onlyfans/content";
import {vaultAnswer,vaultRefusal,vaultCommandContext} from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function POST(request:NextRequest,context:{params:Promise<{accountId:string}>}){
 const ctx=await vaultCommandContext(request);if(ctx instanceof NextResponse)return ctx;
 const account=requestId((await context.params).accountId);
 if(!account||request.nextUrl.searchParams.size||!object(ctx.body)||!exact(ctx.body,["requestId","category"])||!nonce(ctx.body.requestId)||!validCategoryDraft(ctx.body.category))return vaultRefusal(400,"Review a category, its exact media, rights and manual price before creating drafts.");
 const backend=configuredVaultBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Content management is unavailable.");
 const identity=ctx.identity(account,"category-drafts");
 const result=await backend.categoryDrafts(account,{category:ctx.body.category,...identity});
 return result.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,applied:true,accountId:account,items:result.items}):vaultAnswer({schemaVersion:CONTENT_SCHEMA,...result},result.status);
}
