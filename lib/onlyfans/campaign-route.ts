import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "./route";
import { CAMPAIGN_SCHEMA, canonicalCampaign } from "./campaigns";
export const campaignAnswer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export const campaignRefuse = (status: number, error: string, outcome = "refused") => campaignAnswer({ schemaVersion: CAMPAIGN_SCHEMA, ok: false, outcome, error }, status);
export async function requireCampaignWriter(request: NextRequest): Promise<{ actor: string } | NextResponse> {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!await verifySessionToken(session)) return campaignRefuse(401, "Sign in again before changing a campaign.");
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return campaignRefuse(403, "Request this change from the dashboard.");
  return { actor: `op-session:${createHash("sha256").update(session!).digest("hex")}` };
}
export const campaignCommandKey = (value: unknown) => createHash("sha256").update(canonicalCampaign(value)).digest("hex");
