import { NextRequest, NextResponse } from "next/server";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { object } from "@/lib/onlyfans-connections/contract";
import { validBrowserSession } from "@/lib/creator-platforms/browser-connection";
import { platformCommand, platformProfile, platformFailure, platformResponse } from "@/lib/creator-platforms/server";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const ctx = await platformCommand(request); if (ctx instanceof NextResponse) return ctx;
  if (!object(ctx.body) || Object.keys(ctx.body).sort().join(",") !== "handle,profileId,session" || typeof ctx.body.profileId !== "string" ||
      typeof ctx.body.handle !== "string" || !/^[A-Za-z0-9_.-]{1,80}$/.test(ctx.body.handle) || !validBrowserSession(ctx.body.session))
    return platformFailure(400,"Your browser connection is incomplete or expired. Start again from Connect OnlyFans.");
  try {
    const profile = await platformProfile(ctx.creator);
    // A tab that changed creator while OnlyFans was open cannot attach the old attempt.
    if (!profile.id || profile.id !== ctx.body.profileId) return platformFailure(409,"Your creator account changed. Refresh this page and start a new connection.");
    const backend = configuredConnectionBackend(); if (!backend) return platformFailure(503,"OnlyFans connection setup is temporarily unavailable.");
    const command = {creatorId:profile.id, creatorName:ctx.creator.creatorName, handle:ctx.body.handle, session:ctx.body.session};
    const result = await backend.enroll({...command,...ctx.identity("enroll-account",command)});
    return result.ok ? platformResponse({ok:true,enrollment:result.data}) : platformFailure(result.status,result.error);
  } catch { return platformFailure(503,"Your connection request could not be confirmed. Check its status before retrying."); }
}
