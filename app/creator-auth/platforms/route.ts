import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { platformIdentity, platformCommand, platformSnapshot, platformResponse, platformFailure } from "@/lib/creator-platforms/server";
import { object } from "@/lib/onlyfans-connections/contract";
import { platformChannels } from "@/lib/creator-platforms/model";
export const dynamic="force-dynamic";
export async function GET(){const creator=await platformIdentity();if(creator instanceof NextResponse)return creator;try{return platformResponse(await platformSnapshot(creator));}catch(error){return platformFailure(503,error instanceof Error?error.message:"Your platforms could not be loaded.");}}
export async function POST(request:NextRequest){
  const ctx=await platformCommand(request);if(ctx instanceof NextResponse)return ctx;
  if(!object(ctx.body)||Object.keys(ctx.body).join(",")!=="channels"||!platformChannels(ctx.body.channels))return platformFailure(400,"Choose Telegram, OnlyFans or both.");
  const result=await serviceClient().rpc("setup_creator_platforms",{p_account_id:ctx.creator.accountId,p_user_id:ctx.creator.userId,p_channels:ctx.body.channels});
  if(result.error||typeof result.data!=="string")return platformFailure(409,"Your platform setup could not be saved. Refresh before trying again.");
  try{return platformResponse(await platformSnapshot(ctx.creator));}catch{return platformFailure(503,"Your choice was saved, but the latest status could not be loaded. Refresh to check it.");}
}
