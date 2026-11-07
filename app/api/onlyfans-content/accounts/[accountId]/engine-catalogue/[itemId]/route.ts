import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredEngineCatalogueBackend } from "@/lib/onlyfans/engine-catalogue-backend";
import { ENGINE_CATALOGUE_SCHEMA, validCatalogueDecision } from "@/lib/onlyfans/engine-catalogue";
import { contentItemId } from "@/lib/onlyfans/content";
import { readCommandJson, CommandBodyTooLarge } from "@/lib/onlyfans/command-json";
import { trustedFormOrigin } from "@/lib/form-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: false, outcome: "refused", error }, status);

/** Approve or retire one catalogue item. Managers only: a price is a business decision, not a chat action. */
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; itemId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return refuse(403, "Your team access is read-only.");
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return refuse(403, "This change must be requested from this dashboard.");
  const params = await context.params, accountId = requestId(params.accountId), itemId = params.itemId;
  if (!accountId || !contentItemId(itemId)) return refuse(400, "That catalogue reference is invalid.");
  let body: unknown;
  try { body = await readCommandJson(request); if (!validCatalogueDecision(body)) throw new Error(); }
  catch (error) { return refuse(error instanceof CommandBodyTooLarge ? 413 : 400, "That catalogue decision is invalid."); }
  const backend = configuredEngineCatalogueBackend(ctx.fetch);
  if (!backend) return refuse(503, "Catalogue decisions are not configured.");
  const commandKey = createHash("sha256").update(JSON.stringify([ctx.actor, accountId, itemId, body])).digest("hex");
  const result = await backend(accountId, itemId, { ...body, actor: ctx.actor, commandKey });
  return result.ok ? answer({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, outcome: "recorded" })
    : answer({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: false, outcome: result.outcome, error: result.error }, result.status ?? 502);
}
