import { NextRequest, NextResponse } from "next/server";
import { PRIVATE_HEADERS, requestId, requireOnlyFansRead } from "@/lib/onlyfans/route";
import { configuredMoxyBackend } from "@/lib/onlyfans/moxy-backend";
import { MOXY_SCHEMA, validMoxyChange } from "@/lib/onlyfans/moxy";
import { trustedFormOrigin } from "@/lib/form-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string }> };
const answer = (body: object, status = 200) => NextResponse.json({ schemaVersion: MOXY_SCHEMA, ...body }, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ ok: false, error }, status);

export async function GET(_request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId) return refuse(400, "Invalid account reference.");
  const backend = configuredMoxyBackend(ctx.fetch); if (!backend) return refuse(503, "Moxy configuration is unavailable.");
  const result = await backend.get(accountId);
  return result.ok ? answer({ ok: true, accountId, moxy: result.data, canManage: ctx.canManage }) : refuse(result.status, result.error);
}

export async function POST(request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return refuse(403, "Management access is required.");
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return refuse(403, "Save changes from this dashboard.");
  const accountId = requestId((await context.params).accountId); if (!accountId) return refuse(400, "Invalid account reference.");
  let body: unknown;
  try {
    const reader = request.body?.getReader(); if (!reader) return refuse(400, "Missing change.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 130000) { await reader.cancel(); return refuse(413, "The creator setup is too large."); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    const raw = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch { return refuse(400, "Invalid change."); }
  if (!validMoxyChange(body)) return refuse(400, "Invalid Moxy configuration.");
  const backend = configuredMoxyBackend(ctx.fetch); if (!backend) return refuse(503, "Moxy configuration is unavailable.");
  const result = await backend.save(accountId, body, ctx.actor);
  return result.ok ? NextResponse.json(result.ack, { headers: PRIVATE_HEADERS }) : answer(result, result.status);
}
