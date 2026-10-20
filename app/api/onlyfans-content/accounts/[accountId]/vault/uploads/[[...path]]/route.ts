import { NextRequest,NextResponse } from "next/server";
import { requireOnlyFansRead,requestId } from "@/lib/onlyfans/route";
import { configuredVaultMediaBackend } from "@/lib/onlyfans/vault-media-backend";
import { MAX_CHUNK_BYTES,mediaObject,mediaUuid,validUploadFiles } from "@/lib/onlyfans/vault-media";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
import { vaultAnswer,vaultRefusal,vaultCommandContext,vaultSessionContext } from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{accountId:string;path?:string[]}>};
export async function GET(request:NextRequest,context:Context){
  const auth=await requireOnlyFansRead();if(auth instanceof NextResponse)return auth;
  const {accountId:raw,path=[]}=await context.params,accountId=requestId(raw);
  if(!accountId||path.length||request.nextUrl.searchParams.size)return vaultRefusal(400,"That upload status request is invalid.");
  const backend=configuredVaultMediaBackend();if(!backend)return vaultRefusal(503,"Media management is not configured.");
  const r=await backend.uploads(accountId);
  return r.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId,uploads:r.data}):vaultRefusal(r.status,r.error);
}
export async function POST(request:NextRequest,context:Context){
  const {accountId:raw,path=[]}=await context.params,accountId=requestId(raw);
  if(!accountId)return vaultRefusal(400,"That upload account is invalid.");
  const backend=configuredVaultMediaBackend();if(!backend)return vaultRefusal(503,"Media management is not configured.");
  if(path.length===3&&mediaUuid(path[0])&&path[1]==="files"&&mediaUuid(path[2])){
    const ctx=await vaultSessionContext(request,"application/octet-stream");if(ctx instanceof NextResponse)return ctx;
    const query=request.nextUrl.searchParams,digest=request.headers.get("x-upload-sha256"),offset=query.get("offset");
    if(query.size!==1||query.getAll("offset").length!==1||!offset||!/^\d{1,12}$/.test(offset)||!digest||!/^[a-f0-9]{64}$/.test(digest))return vaultRefusal(400,"That upload chunk is invalid.");
    if(!request.body)return vaultRefusal(400,"Choose a file chunk to upload.");
    const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
    try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_CHUNK_BYTES){await reader.cancel();return vaultRefusal(413,"That upload chunk is too large.");}parts.push(part.value);}}
    catch{return vaultRefusal(400,"The file transfer was interrupted. Refresh its recorded progress.");}
    const bytes=new Uint8Array(size);let position=0;for(const part of parts){bytes.set(part,position);position+=part.byteLength;}
    const r=await backend.chunk(accountId,path[0],path[2],Number(offset),digest,bytes,ctx.actor);
    return r.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId,jobId:path[0],fileId:path[2],receivedBytes:r.receivedBytes}):vaultRefusal(r.status,r.error);
  }
  const ctx=await vaultCommandContext(request);if(ctx instanceof NextResponse)return ctx;
  if(request.nextUrl.searchParams.size||!mediaObject(ctx.body)||!mediaUuid(ctx.body.requestId))return vaultRefusal(400,"That upload request is invalid.");
  if(path.length===0){
    if(Object.keys(ctx.body).sort().join(",")!=="expectedConnectionRevision,files,requestId"||!validUploadFiles(ctx.body.files)
      ||!Number.isSafeInteger(ctx.body.expectedConnectionRevision)||(ctx.body.expectedConnectionRevision as number)<1)return vaultRefusal(400,"Choose supported files and a verified account.");
    const r=await backend.create(accountId,{files:ctx.body.files,expectedConnectionRevision:ctx.body.expectedConnectionRevision as number,...ctx.identity(accountId,"upload")});
    return r.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId,upload:r.upload}):vaultRefusal(r.status,r.error);
  }
  if(path.length===2&&mediaUuid(path[0])&&["finish","cancel"].includes(path[1])&&Object.keys(ctx.body).join(",")==="requestId"){
    const r=await backend.action(accountId,path[0],path[1] as "finish"|"cancel",ctx.identity(accountId,"upload:"+path.join(":")));
    return r.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId,upload:r.upload}):vaultRefusal(r.status,r.error);
  }
  return vaultRefusal(400,"That upload action is invalid.");
}
