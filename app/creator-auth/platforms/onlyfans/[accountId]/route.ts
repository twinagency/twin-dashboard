import { NextRequest, NextResponse } from "next/server";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { validConnectionRequest } from "@/lib/onlyfans-connections/contract";
import { platformCommand,platformIdentity,platformProfile,ownedPlatformAccounts,platformFailure,platformResponse } from "@/lib/creator-platforms/server";
export const dynamic="force-dynamic";
type Context={params:Promise<{accountId:string}>};
async function owned(creator:{accountId:string;userId:string},accountId:string){
  if(!/^of-[1-9][0-9]{0,15}$/.test(accountId))return false;
  const profile=await platformProfile(creator);return (await ownedPlatformAccounts(profile.id)).some(account=>account.accountId===accountId);
}
export async function GET(_request:NextRequest,context:Context){
  const creator=await platformIdentity();if(creator instanceof NextResponse)return creator;
  try{const {accountId}=await context.params;if(!await owned(creator,accountId))return platformFailure(404,"That account is unavailable.");
    const backend=configuredConnectionBackend();if(!backend)return platformFailure(503,"OnlyFans connection setup is unavailable.");
    const result=await backend.get(accountId);return result.ok?platformResponse({schemaVersion:"of-connections.v1",ok:true,connection:result.data}):platformFailure(result.status,result.error);
  }catch{return platformFailure(503,"Connection status could not be verified. Please refresh.");}
}
export async function POST(request:NextRequest,context:Context){
  const ctx=await platformCommand(request);if(ctx instanceof NextResponse)return ctx;
  if(!validConnectionRequest(ctx.body)||!["session","verify","pause"].includes(ctx.body.action))return platformFailure(400,"That connection change is unavailable.");
  try{const {accountId}=await context.params;if(!await owned(ctx.creator,accountId))return platformFailure(404,"That account is unavailable.");
    const backend=configuredConnectionBackend();if(!backend)return platformFailure(503,"OnlyFans connection setup is unavailable.");
    const result=await backend.command(accountId,{...ctx.body,...ctx.identity(accountId,ctx.body)});
    return result.ok?platformResponse(result.ack):platformFailure(result.status,result.error);
  }catch{return platformFailure(503,"Your account could not be verified. Refresh before trying again.");}
}
