import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "./route";
import { CAMPAIGN_SCHEMA, canonicalCampaign } from "./campaigns";
import { trustedFormOrigin } from "@/lib/form-origin";
export const campaignAnswer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export const campaignRefuse = (status: number, error: string, outcome = "refused") => campaignAnswer({ schemaVersion: CAMPAIGN_SCHEMA, ok: false, outcome, error }, status);
export async function requireCampaignWriter(request: NextRequest): Promise<{ actor: string; fetch: typeof fetch } | NextResponse> {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.actor) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return campaignRefuse(403, "Request this change from the dashboard.");
  return { actor: ctx.actor, fetch: ctx.fetch };
}
export const campaignCommandKey = (value: unknown) => createHash("sha256").update(canonicalCampaign(value)).digest("hex");
