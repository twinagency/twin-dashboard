import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredContentBackend } from "@/lib/onlyfans/content-backend";
import { CONTENT_SCHEMA, canonicalContent, contentItemId, validContentRequest } from "@/lib/onlyfans/content";
import { readCommandJson } from "@/lib/onlyfans/command-json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; itemId: string }> };
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: CONTENT_SCHEMA, ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(_request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const params = await context.params; const accountId = requestId(params.accountId), itemId = params.itemId;
  if (!accountId || !contentItemId(itemId)) return refuse(400, "That catalogue reference is invalid.");
  const backend = configuredContentBackend(ctx.fetch); if (!backend) return refuse(503, "Catalogue editing is not configured.");
  const result = await backend.get(accountId, itemId);
  return result.ok ? answer({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId, itemId, item: result.data }) : refuse(result.status, result.error);
}
export async function POST(request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return refuse(403, "Your team access is read-only.");
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return refuse(403, "Save changes from this dashboard.");
  const params = await context.params; const accountId = requestId(params.accountId), itemId = params.itemId;
  if (!accountId || !contentItemId(itemId)) return refuse(400, "That catalogue reference is invalid.");
  let body: unknown;
  try {
    body = await readCommandJson(request);
  } catch (error) { return refuse(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "That save request is invalid."); }
  if (!validContentRequest(body)) return refuse(400, "That catalogue change is invalid.");
  const backend = configuredContentBackend(ctx.fetch); if (!backend) return refuse(503, "Catalogue editing is not configured.");
  const actor = ctx.actor;
  const commandKey = digest(canonicalContent([actor, accountId, itemId, body]));
  const result = await backend.save(accountId, itemId, { ...body, actor, commandKey });
  return result.ok ? answer(result.ack) : answer({ schemaVersion: CONTENT_SCHEMA, ...result }, result.status);
}
