import { NextRequest,NextResponse } from "next/server";
import { requireOnlyFansRead,requestId,PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { vaultMediaId } from "@/lib/onlyfans/vault";
import { vaultRefusal } from "@/lib/onlyfans/vault-route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{accountId:string;mediaId:string}>}) {
  const auth=await requireOnlyFansRead();if(auth instanceof NextResponse)return auth;
  const params=await context.params,accountId=requestId(params.accountId),mediaId=params.mediaId;
  if(!accountId||!vaultMediaId(mediaId)||request.nextUrl.searchParams.size)return vaultRefusal(400,"That vault preview reference is invalid.");
  const backend=configuredVaultBackend();if(!backend)return vaultRefusal(503,"Vault management is not configured.");
  const result=await backend.preview(accountId,mediaId);
  if(!result.ok)return vaultRefusal(result.status,result.error);
  return new NextResponse(result.bytes,{headers:{...PRIVATE_HEADERS,"Content-Type":result.mime,
    "X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
}
