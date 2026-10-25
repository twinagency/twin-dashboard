import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId} from "@/lib/onlyfans/route";
import {configuredVaultMediaBackend} from "@/lib/onlyfans/vault-media-backend";
import {vaultMediaId} from "@/lib/onlyfans/vault";
import {mediaObject,mediaUuid} from "@/lib/onlyfans/vault-media";
import {CONTENT_SCHEMA} from "@/lib/onlyfans/content";
import {vaultAnswer,vaultRefusal,vaultCommandContext} from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{accountId:string;mediaId:string}>};
export async function GET(request:NextRequest,context:Context){
  const auth=await requireOnlyFansRead({ agency: true });if(auth instanceof NextResponse)return auth;
  const p=await context.params,accountId=requestId(p.accountId);
  if(!accountId||!vaultMediaId(p.mediaId)||request.nextUrl.searchParams.size)return vaultRefusal(400,"That video reference is invalid.");
  const backend=configuredVaultMediaBackend(auth.fetch);if(!backend)return vaultRefusal(503,"Media management is not configured.");
  const r=await backend.video(accountId,p.mediaId);
  return r.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId,video:r.video}):vaultRefusal(r.status,r.error);
}
export async function POST(request:NextRequest,context:Context){
  const ctx=await vaultCommandContext(request);if(ctx instanceof NextResponse)return ctx;
  const p=await context.params,accountId=requestId(p.accountId);
  if(!accountId||!vaultMediaId(p.mediaId)||request.nextUrl.searchParams.size||!mediaObject(ctx.body)
    ||Object.keys(ctx.body).join(",")!=="requestId"||!mediaUuid(ctx.body.requestId))return vaultRefusal(400,"That video request is invalid.");
  const backend=configuredVaultMediaBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Media management is not configured.");
  const r=await backend.video(accountId,p.mediaId,ctx.identity(accountId,"video:"+p.mediaId));
  return r.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId,video:r.video}):vaultRefusal(r.status,r.error);
}
