import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
import { validVaultResource, validVaultEdit, type AssetPatch, type FolderPatch } from "@/lib/onlyfans/vault-editing";
import { vaultAnswer, vaultRefusal, vaultCommandContext } from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{accountId:string;resource:string[]}>};
async function target(context:Context){const p=await context.params;const account=requestId(p.accountId), resource=p.resource.join("/");return account&&validVaultResource(resource)?{account,resource}:null;}
export async function GET(request:NextRequest,context:Context){
  const ctx=await requireOnlyFansRead({ agency: true });if(ctx instanceof NextResponse)return ctx;
  const t=await target(context);if(!t||request.nextUrl.searchParams.size)return vaultRefusal(400,"That metadata request is invalid.");
  const backend=configuredVaultBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Content management is not configured.");
  const result=await backend.readResource(t.account,t.resource);
  const key=t.resource==="folders"?"folders":t.resource.startsWith("folders/")?"folder":"asset";
  return result.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:t.account,[key]:result.data}):vaultRefusal(result.status,result.error);
}
export async function POST(request:NextRequest,context:Context){
  const ctx=await vaultCommandContext(request);if(ctx instanceof NextResponse)return ctx;
  const t=await target(context);if(!t||request.nextUrl.searchParams.size||!validVaultEdit(t.resource,ctx.body))return vaultRefusal(400,"That metadata change is invalid.");
  const backend=configuredVaultBackend(ctx.fetch);if(!backend)return vaultRefusal(503,"Content management is not configured.");
  const {requestId:_nonce,...body}=ctx.body;
  const identity=ctx.identity(t.account,"vault-edit:"+t.resource);
  const result=await backend.editResource(t.account,t.resource,{...body as AssetPatch|FolderPatch,...identity});
  return result.ok?vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:true,applied:true,accountId:t.account,commandKey:identity.commandKey,targetId:result.targetId,fingerprint:result.fingerprint}):vaultAnswer({schemaVersion:CONTENT_SCHEMA,ok:false,outcome:result.outcome,error:result.error},result.status);
}
