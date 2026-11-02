import { NextRequest,NextResponse } from "next/server";
import { configuredOnlyFansBackend } from "@/lib/onlyfans/backend";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "@/lib/onlyfans-preview/types";
import { platformIdentity,platformProfile,ownedPlatformAccounts,platformFailure,platformResponse } from "@/lib/creator-platforms/server";
export const dynamic="force-dynamic";
const valid=(value:string)=>/^[A-Za-z0-9._:-]{1,64}$/.test(value);
export async function GET(request:NextRequest,context:{params:Promise<{path?:string[]}>}){
  if(request.headers.has("next-action"))return platformFailure(403,"That action is unavailable.");
  const creator=await platformIdentity();if(creator instanceof NextResponse)return creator;
  try{
    const profile=await platformProfile(creator),params=request.nextUrl.searchParams,{path=[]}=await context.params;
    if(path[0]!=="accounts"||path.some(part=>!valid(part)))return platformFailure(404,"That page is unavailable.");
    if(params.has("creator")&&params.get("creator")!==profile.id)return platformFailure(404,"That creator is unavailable.");
    const accounts=await ownedPlatformAccounts(profile.id);
    const requested=params.get("account");if(requested&&!accounts.some(account=>account.accountId===requested))return platformFailure(404,"That account is unavailable.");
    if(path.length===1)return platformResponse({schemaVersion:ONLYFANS_PREVIEW_SCHEMA_VERSION,scope:{creatorId:profile.id,accountId:requested},accounts:accounts.map(account=>({...account,capabilities:{...account.capabilities,sendManualMessage:"unavailable",pauseAutomation:"unavailable",requestTakeover:"unavailable",manageContent:"unavailable",managePrices:"unavailable",viewSales:"unavailable",resolveDeliveryEvidence:"unavailable"}}))});
    const accountId=path[1];if(!accounts.some(account=>account.accountId===accountId))return platformFailure(404,"That account is unavailable.");
    const backend=configuredOnlyFansBackend();if(!backend)return platformFailure(503,"Your conversations are temporarily unavailable.");
    if(path.length===3&&path[2]==="conversations"){
      const cursor=params.get("cursor");if(cursor&&!/^[A-Za-z0-9_-]{1,256}$/.test(cursor))return platformFailure(400,"That conversation page is invalid.");
      const result=await backend.listConversations(accountId,cursor);if(!result.ok)return platformFailure(result.status,"Your conversations could not be loaded.");
      if(result.data.items.some(row=>row.accountId!==accountId))return platformFailure(502,"Conversation ownership could not be verified.");
      return platformResponse({schemaVersion:ONLYFANS_PREVIEW_SCHEMA_VERSION,accountId,page:result.data});
    }
    if(path.length===4&&path[2]==="conversations"){
      const cursor=params.get("cursor");
      if(params.getAll("cursor").length>1 || (cursor!==null && !/^[A-Za-z0-9_-]{1,512}={0,2}$/.test(cursor)))return platformFailure(400,"That history page is invalid.");
      const conversationId=path[3],result=await backend.getConversation(accountId,conversationId,cursor);if(!result.ok)return platformFailure(result.status,"That conversation could not be loaded.");
      const row=result.data;
      if(row.accountId!==accountId||row.conversationId!==conversationId||row.summary.accountId!==accountId||row.summary.conversationId!==conversationId||row.messages.some(message=>message.conversationId!==conversationId))return platformFailure(502,"Conversation ownership could not be verified.");
      return platformResponse({schemaVersion:ONLYFANS_PREVIEW_SCHEMA_VERSION,accountId,conversation:row});
    }
    return platformFailure(404,"That page is unavailable.");
  }catch{return platformFailure(503,"Your OnlyFans data could not be verified. Please refresh.");}
}
