import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredCampaignBackend } from "@/lib/onlyfans/campaigns-backend";
import { CAMPAIGN_SCHEMA, validCampaignCreate } from "@/lib/onlyfans/campaigns";
import { campaignAnswer, campaignRefuse, requireCampaignWriter, campaignCommandKey } from "@/lib/onlyfans/campaign-route";
import { readCommandJson, CommandBodyTooLarge } from "@/lib/onlyfans/command-json";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId) return campaignRefuse(400, "Invalid account reference.");
  const backend = configuredCampaignBackend(ctx.fetch); if (!backend) return campaignRefuse(503, "Campaigns are not configured.");
  const result = await backend.list(accountId);
  return result.ok ? campaignAnswer({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, ...result.data }) : campaignRefuse(result.status, result.error);
}
export async function POST(request: NextRequest, context: Context) {
  const writer = await requireCampaignWriter(request); if (writer instanceof NextResponse) return writer;
  const accountId = requestId((await context.params).accountId); if (!accountId) return campaignRefuse(400, "Invalid account reference.");
  let input: unknown; try { input = await readCommandJson(request, 131072); } catch (error) { return campaignRefuse(error instanceof CommandBodyTooLarge ? 413 : 400, "Invalid campaign request."); }
  if (!validCampaignCreate(input)) return campaignRefuse(400, "Review the campaign name, message, audience and schedule.");
  const backend = configuredCampaignBackend(writer.fetch); if (!backend) return campaignRefuse(503, "Campaigns are not configured.");
  const { requestKey: _requestKey, ...payload } = input;
  const commandKey = campaignCommandKey([writer.actor, accountId, input]);
  const result = await backend.create(accountId, { ...payload, actor: writer.actor, commandKey });
  return result.ok ? campaignAnswer(result.ack) : campaignRefuse(result.status, result.error, result.outcome);
}
