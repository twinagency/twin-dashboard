import { NextRequest, NextResponse } from "next/server";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { object, validConnectionRequest, type ConnectionEnrollmentRequest } from "@/lib/onlyfans-connections/contract";
import { platformCommand,platformProfile,platformFailure,platformResponse } from "@/lib/creator-platforms/server";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
  const ctx=await platformCommand(request);if(ctx instanceof NextResponse)return ctx;
  if(!object(ctx.body)||Object.keys(ctx.body).sort().join(",")!=="handle,session"||typeof ctx.body.handle!=="string"||!ctx.body.handle.trim()
    ||new TextEncoder().encode(ctx.body.handle).length>160||!validConnectionRequest({action:"session",expectedRevision:0,payload:ctx.body.session}))return platformFailure(400,"Check the OnlyFans account details and connection file.");
  try{
    const profile=await platformProfile(ctx.creator);if(!profile.id)return platformFailure(409,"Choose your platforms before connecting an account.");
    const backend=configuredConnectionBackend();if(!backend)return platformFailure(503,"OnlyFans connection setup is temporarily unavailable.");
    const command={creatorId:profile.id,creatorName:ctx.creator.creatorName,handle:ctx.body.handle,session:ctx.body.session as ConnectionEnrollmentRequest["session"]};
    const result=await backend.enroll({...command,...ctx.identity("enroll-account",command)});
    return result.ok?platformResponse({ok:true,enrollment:result.data}):platformFailure(result.status,result.error);
  }catch{return platformFailure(503,"Your connection request could not be confirmed. Refresh before trying again.");}
}
