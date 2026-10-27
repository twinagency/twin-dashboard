import {NextRequest,NextResponse} from "next/server";
import {requireOnlyFansRead,requestId,PRIVATE_HEADERS} from "@/lib/onlyfans/route";
import {configuredBackendPurpose,createBackendTransport} from "@/lib/onlyfans/backend-transport";
import {CONTENT_HEADER,CONTENT_SCHEMA} from "@/lib/onlyfans/content";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{accountId:string;fanId:string;messageId:string;mediaId:string;variant:string}>}) {
  const auth=await requireOnlyFansRead({agency:true});if(auth instanceof NextResponse)return auth;
  const p=await context.params;
  const id=(v:string)=>/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<BigInt("9223372036854775808");
  if(!requestId(p.accountId)||![p.fanId,p.messageId,p.mediaId].every(id)||!["preview","file"].includes(p.variant)||request.nextUrl.searchParams.size)return new NextResponse(null,{status:400});
  const config=configuredBackendPurpose("CONTENT");if(!config)return new NextResponse(null,{status:503});
  try {
    const path=`/onlyfans/content/v1/accounts/${encodeURIComponent(p.accountId)}/message-media/${p.fanId}/${p.messageId}/${p.mediaId}/${p.variant}`;
    const r=await createBackendTransport(auth.fetch)(config.baseUrl.replace(/\/+$/,"")+path,{method:"GET",headers:{Authorization:`Bearer ${config.token}`,[CONTENT_HEADER]:CONTENT_SCHEMA}});
    if(r.status===202){await r.body?.cancel();return new NextResponse(null,{status:202,headers:{...PRIVATE_HEADERS,"Retry-After":"2"}});}
    const mime=r.headers.get("content-type")?.split(";")[0]||"";
    if(!r.ok||!(p.variant==="preview"?["image/jpeg","image/png","image/webp","image/gif"]:["video/mp4","video/webm"]).includes(mime)){await r.body?.cancel();return new NextResponse(null,{status:r.status===404?404:503,headers:PRIVATE_HEADERS});}
    return new NextResponse(r.body,{headers:{...PRIVATE_HEADERS,"Content-Type":mime,"X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  }catch{return new NextResponse(null,{status:503,headers:PRIVATE_HEADERS});}
}

