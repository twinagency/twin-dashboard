import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredCampaignBackend } from "@/lib/onlyfans/campaigns-backend";
import { CAMPAIGN_SCHEMA, campaignId as validId, validCampaignChange } from "@/lib/onlyfans/campaigns";
import { campaignAnswer, campaignRefuse, requireCampaignWriter, campaignCommandKey } from "@/lib/onlyfans/campaign-route";
import { readCommandJson } from "@/lib/onlyfans/command-json";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; campaignId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const params = await context.params, accountId = requestId(params.accountId), id = params.campaignId;
  if (!accountId || !validId(id)) return campaignRefuse(400, "Invalid campaign reference.");
  const backend = configuredCampaignBackend(); if (!backend) return campaignRefuse(503, "Campaigns are not configured.");
  const result = await backend.detail(accountId, id);
  return result.ok ? campaignAnswer({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, ...result.data }) : campaignRefuse(result.status, result.error);
}
export async function POST(request: NextRequest, context: Context) {
  const writer = await requireCampaignWriter(request); if (writer instanceof NextResponse) return writer;
  const params = await context.params, accountId = requestId(params.accountId), id = params.campaignId;
  if (!accountId || !validId(id)) return campaignRefuse(400, "Invalid campaign reference.");
  let input: unknown; try { input = await readCommandJson(request, 4096); } catch { return campaignRefuse(400, "Invalid campaign action."); }
  if (!validCampaignChange(input)) return campaignRefuse(400, "Invalid campaign action.");
  const backend = configuredCampaignBackend(); if (!backend) return campaignRefuse(503, "Campaigns are not configured.");
  const commandKey = campaignCommandKey([writer.actor, accountId, id, input]);
  const result = await backend.change(accountId, id, { ...input, actor: writer.actor, commandKey });
  return result.ok ? campaignAnswer(result.ack) : campaignRefuse(result.status, result.error, result.outcome);
}
